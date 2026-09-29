import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve("esbuild", { paths: [dirname(require.resolve("vite"))] })));
const bundled = await build({
  entryPoints: ["app/api/admin/stores/route.ts"], bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "api-stubs", setup(build) {
    build.onResolve({ filter: /^(server-only|.*\/chatgpt-auth|.*\/supabase-rest)$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({
      contents: args.path === "server-only" ? "" : args.path === "chatgpt-auth"
        ? "export async function getChatGPTUser(){return globalThis.__user;}"
        : "export async function supabaseRest(path,init){return globalThis.__rest(path,init);}", loader: "js",
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const request = (method, body) => new Request("https://portal.test/api/admin/stores", {method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
let state;
beforeEach(() => {
  globalThis.__user = {email:"admin@example.test"};
  state = {stores:[],profiles:[],projects:[],member:{tenant_id:"tenant-1",role:"superadmin",active:true}};
  globalThis.__rest = async (path,init={}) => {
    const url = new URL(path,"https://rest.test/");
    const table = url.pathname.slice(1);
    const body = init.body ? JSON.parse(init.body) : null;
    if (table === "customer_users") return [state.member];
    if (table === "stores") {
      if (init.method === "POST") {state.stores.push(body);return [body];}
      if (init.method === "PATCH") {const row=state.stores.find(x=>x.id===url.searchParams.get("id")?.slice(3));Object.assign(row,body);return [row];}
      if (init.method === "DELETE") {state.stores=state.stores.filter(x=>x.id!==url.searchParams.get("id")?.slice(3));return undefined;}
      return state.stores;
    }
    if (table === "link_directory_stores") {
      if (init.method === "POST") {state.profiles=[...state.profiles.filter(x=>x.store_id!==body.store_id),body];return undefined;}
      return state.profiles;
    }
    if (table === "link_directory_projects") {
      if (init.method === "DELETE") {state.projects=state.projects.filter(x=>x.store_id!==url.searchParams.get("store_id")?.slice(3));return undefined;}
      if (init.method === "POST") {state.projects.push(...body.map((x,index)=>({...x,id:index+1})));return undefined;}
      return state.projects;
    }
    throw new Error(`Unexpected table ${table}`);
  };
});

test("only Super Admin may add stores with linked Supabase details", async () => {
  state.member.role="customer";
  assert.equal((await api.POST(request("POST",{name:"Demo",market:"MY",projectLinks:[]}))).status,403);
  state.member.role="superadmin";
  const response=await api.POST(request("POST",{name:"Demo",market:"MY",adsTopUpOwner:"Shopee Hub",storeGroupLink:"https://chat.whatsapp.com/group",googleDriveLink:"https://drive.google.com/store",projectLinks:[{project:"Launch",href:"https://chat.whatsapp.com/launch",driveLink:"https://drive.google.com/launch"}]}));
  assert.equal(response.status,201);
  assert.equal(state.stores.length,1);
  assert.equal(state.profiles[0].ads_top_up_owner,"Shopee Hub");
  assert.equal(state.projects[0].google_drive_link,"https://drive.google.com/launch");
});

test("editing display name and links leaves stable store identity", async () => {
  state.stores=[{id:"shopee-demo",tenant_id:"tenant-1",name:"Demo",display_name:null,bigseller_name:"Demo",platform:"Shopee MY"}];
  state.profiles=[{store_id:"shopee-demo",tenant_id:"tenant-1",store_name:"Demo",ads_top_up_owner:"Client",store_group_link:null,google_drive_link:null}];
  const response=await api.PATCH(request("PATCH",{id:"shopee-demo",name:"Demo New",adsTopUpOwner:"Client Approval",storeGroupLink:"",googleDriveLink:"",projectLinks:[{project:"Launch",href:"https://chat.whatsapp.com/launch",driveLink:""}]}));
  assert.equal(response.status,200);
  assert.equal(state.stores[0].id,"shopee-demo");
  assert.equal(state.stores[0].name,"Demo");
  assert.equal(state.stores[0].display_name,"Demo New");
  assert.equal(state.profiles[0].store_name,"Demo");
  assert.equal(state.profiles[0].ads_top_up_owner,"Client Approval");
  assert.equal(state.projects.length,1);
});
