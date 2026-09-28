import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const require=createRequire(import.meta.url);
const esbuildPath=require.resolve("esbuild",{paths:[dirname(require.resolve("vite"))]});
const { build }=await import(pathToFileURL(esbuildPath));
const compiled=await build({
  stdin:{contents:'export { GET, POST, PATCH } from "./app/api/live-calendar/route"; export { PATCH as updateUser } from "./app/api/admin/users/route"; export * from "./app/live-calendar-model";',resolveDir:process.cwd(),loader:"ts"},
  bundle:true,write:false,platform:"node",format:"esm",
  plugins:[{name:"calendar-test-adapters",setup(build){
    build.onResolve({filter:/\/(chatgpt-auth|supabase-rest|live-calendar-store-registry)$/},args=>({path:args.path.split("/").pop(),namespace:"calendar-test"}));
    build.onLoad({filter:/.*/,namespace:"calendar-test"},args=>({contents:args.path==="chatgpt-auth"?'export async function getChatGPTUser(){return globalThis.__calendarUser;}':args.path==="supabase-rest"?'export async function supabaseRest(path,init){return globalThis.__calendarRest(path,init);} export function supabaseConfig(){return {url:"https://unused.test",secret:"test"};}':'export async function directoryStoreNames(){globalThis.__directoryReads++;return globalThis.__directoryNames;}',loader:"js"}));
  }}],
});
const api=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

const sg={id:"shopee-skindae-sg",tenant_id:"j-packaging",name:"SkinDae SG",bigseller_name:"SkinDae SG by CTG4u",platform:"Shopee SG"};
const my={id:"shopee-skindae-my-by-ctg4u",tenant_id:"j-packaging",name:"SkinDae MY by CTG4u",bigseller_name:"SkinDae MY by CTG4u",platform:"Shopee"};
const id="00000000-0000-4000-8000-000000000001";
let state;
const request=(method,body)=>new Request("https://calendar.test/api/live-calendar",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const input=()=>({storeId:sg.id,title:"SG launch",startLocal:"2026-09-28T23:30",endLocal:"2026-09-29T00:30",timeZone:"Asia/Singapore",internalNote:"Internal staffing note"});
const session=(extra={})=>({id,tenant_id:"j-packaging",store_id:sg.id,title:"SG launch",start_at:"2026-09-28T15:30:00.000Z",end_at:"2026-09-28T16:30:00.000Z",time_zone:"Asia/Singapore",status:"scheduled",internal_note:"Private",...extra});

beforeEach(()=>{
  globalThis.__calendarUser={email:"admin@example.test"};
  globalThis.__directoryNames=["SkinDae SG by CTG4u","New SG Store"];
  globalThis.__directoryReads=0;
  state={member:{id:1,tenant_id:"j-packaging",role:"superadmin",active:true,module_access_mode:"role_default",store_access_mode:"all"},tenantActive:true,tenantModule:true,userModule:true,stores:[my,sg],assigned:[sg.id],sessions:[],calls:[]};
  globalThis.__calendarRest=async(path,init={})=>{
    state.calls.push({path,init});
    const url=new URL(path,"https://rest.test/");const table=url.pathname.slice(1);const q=url.searchParams;
    if(table==="customer_users")return[q.get("id")?state.targetUser:state.member];
    if(table==="tenants")return[{active:state.tenantActive}];
    if(table==="tenant_module_permissions")return state.tenantModule===null?[]:[{enabled:state.tenantModule}];
    if(table==="user_module_permissions")return[{enabled:state.userModule}];
    if(table==="user_store_access")return state.assigned.map(store_id=>({store_id}));
    if(table==="stores"){
      if(init.method==="POST"){const row=JSON.parse(init.body);state.stores.push(row);return[row];}
      return state.stores.filter(row=>row.tenant_id===q.get("tenant_id")?.slice(3));
    }
    if(table!=="live_sessions")throw new Error(`Unexpected table ${table}`);
    if(init.method==="POST"){const row={id,...JSON.parse(init.body),status:"scheduled"};state.sessions.push(row);return[row];}
    let rows=state.sessions.filter(row=>!q.get("tenant_id")||row.tenant_id===q.get("tenant_id").slice(3));
    if(q.get("id"))rows=rows.filter(row=>row.id===q.get("id").slice(3));
    if(q.get("status"))rows=rows.filter(row=>row.status===q.get("status").slice(3));
    if(q.get("store_id")?.startsWith("eq."))rows=rows.filter(row=>row.store_id===q.get("store_id").slice(3));
    if(q.get("store_id")?.startsWith("in.")){const ids=JSON.parse(`[${q.get("store_id").slice(4,-1)}]`);rows=rows.filter(row=>ids.includes(row.store_id));}
    if(q.get("start_at"))rows=rows.filter(row=>row.start_at<q.get("start_at").slice(3));
    if(q.get("end_at"))rows=rows.filter(row=>row.end_at>q.get("end_at").slice(3));
    if(init.method==="PATCH"){const change=JSON.parse(init.body);rows.forEach(row=>Object.assign(row,change));return rows;}
    const offset=Number(q.get("offset")||0),limit=Number(q.get("limit")||1000);
    rows=rows.slice(offset,offset+limit);
    if(q.get("select")!=="*"){const fields=q.get("select").split(",");rows=rows.map(row=>Object.fromEntries(fields.map(field=>[field,row[field]])));}
    return rows;
  };
});

test("authentication, membership, tenant and module fail closed",async()=>{
  globalThis.__calendarUser=null;
  assert.equal((await api.GET(new Request("https://calendar.test/api/live-calendar"))).status,401);
  assert.equal(state.calls.length,0);
  globalThis.__calendarUser={email:"client@example.test"};state.member.active=false;
  assert.equal((await api.GET(new Request("https://calendar.test/api/live-calendar"))).status,403);
  state.member.active=true;state.tenantActive=false;
  assert.equal((await api.GET(new Request("https://calendar.test/api/live-calendar"))).status,403);
  state.tenantActive=true;state.member.role="customer";state.tenantModule=null;
  assert.equal((await api.GET(new Request("https://calendar.test/api/live-calendar"))).status,403);
  state.tenantModule=true;state.member.module_access_mode="custom";state.userModule=false;
  assert.equal((await api.GET(new Request("https://calendar.test/api/live-calendar"))).status,403);
});

test("selected-store client reads only its store, without cancelled sessions or internal notes",async()=>{
  state.member.role="customer";state.member.store_access_mode="selected";
  state.assigned=["shopee-skindae-sg-by-ctg4u"];
  state.sessions=[session(),session({id:"my",store_id:my.id}),session({id:"other",tenant_id:"other"}),session({id:"cancelled",status:"cancelled"})];
  const result=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.deepEqual(result.stores.map(store=>store.id),[sg.id]);assert.equal(result.sessions.length,1);
  assert.equal("internal_note" in result.sessions[0],false);assert.equal(result.unregisteredStores.length,0);assert.equal(globalThis.__directoryReads,0);
  assert.equal((await api.GET(new Request(`https://calendar.test/api/live-calendar?storeId=${my.id}`))).status,403);
  assert.equal((await api.POST(request("POST",input()))).status,403);
  assert.equal((await api.POST(request("POST",{action:"registerStore",directoryName:"New SG Store"}))).status,403);
  assert.equal((await api.PATCH(request("PATCH",{id,action:"cancel"}))).status,403);
});

test("global Directory is invisible and unregistrable for another tenant",async()=>{
  state.member.tenant_id="other";state.stores=[{...sg,id:"other-store",tenant_id:"other"}];
  const result=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.deepEqual(result.unregisteredStores,[]);assert.equal(globalThis.__directoryReads,0);
  assert.equal((await api.POST(request("POST",{action:"registerStore",directoryName:"New SG Store",tenant_id:"j-packaging"}))).status,403);
  assert.equal(state.calls.some(call=>call.init.method==="POST"),false);
});

test("multi-store customer gets exactly its explicit store grants",async()=>{
  state.member.role="customer";state.member.store_access_mode="all";
  state.stores.push({...my,id:"unassigned-store",name:"Unassigned Store"});
  state.assigned=[sg.id,my.id];
  state.sessions=[session(),session({id:"my",store_id:my.id}),session({id:"unassigned",store_id:"unassigned-store"})];
  const result=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.deepEqual(result.stores.map(store=>store.id),[my.id,sg.id]);
  assert.deepEqual(result.sessions.map(row=>row.store_id),[sg.id,my.id]);
});

test("legacy customer all never grants fleet calendar access without explicit store rows",async()=>{
  state.member.role="customer";state.member.store_access_mode="all";state.assigned=[];state.sessions=[session()];
  const customer=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.deepEqual(customer.stores,[]);assert.deepEqual(customer.sessions,[]);
  state.member.role="manager";
  const manager=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.equal(manager.stores.length,2);assert.equal(manager.sessions.length,1);
});

test("admin registration validates Directory and uses the tenant derived from membership",async()=>{
  assert.equal((await api.POST(request("POST",{action:"registerStore",directoryName:"Injected Store"}))).status,400);
  const response=await api.POST(request("POST",{action:"registerStore",directoryName:"New SG Store",tenant_id:"other"}));
  assert.equal(response.status,201);
  const created=(await response.json()).store;
  assert.equal(created.tenant_id,"j-packaging");assert.equal(created.platform,"Shopee SG");
});

test("SG timezone, real calendar dates and overnight UTC conversion are validated",async()=>{
  assert.equal(api.parseStoreLocal("2026-02-30T20:00"),null);
  assert.equal(api.parseStoreLocal("2026-09-28T23:30"),"2026-09-28T15:30:00.000Z");
  assert.equal((await api.POST(request("POST",{...input(),timeZone:"Asia/Kuala_Lumpur"}))).status,400);
  assert.equal((await api.POST(request("POST",{...input(),storeId:"other-store",tenant_id:"other"}))).status,403);
  const response=await api.POST(request("POST",{...input(),tenant_id:"other"}));
  assert.equal(response.status,201);
  const created=(await response.json()).session;
  assert.equal(created.tenant_id,"j-packaging");assert.equal(created.end_at,"2026-09-28T16:30:00.000Z");
});

test("same-store overlap needs explicit confirmation and cross-tenant edits fail",async()=>{
  state.sessions=[session({id:"00000000-0000-4000-8000-000000000002"})];
  assert.equal((await api.POST(request("POST",input()))).status,409);
  assert.equal((await api.POST(request("POST",{...input(),confirmOverlap:true}))).status,201);
  state.sessions=[session({tenant_id:"other"})];
  assert.equal((await api.PATCH(request("PATCH",{...input(),id}))).status,404);
});

test("cancel remains in admin history and disappears from client reads",async()=>{
  state.sessions=[session()];
  assert.equal((await api.PATCH(request("PATCH",{id,action:"cancel"}))).status,200);
  assert.equal(state.sessions[0].status,"cancelled");
  const admin=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();assert.equal(admin.sessions.length,1);
  state.member.role="customer";
  const client=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();assert.equal(client.sessions.length,0);
});

test("admin can edit and reschedule a session without treating itself as an overlap",async()=>{
  state.sessions=[session()];
  const response=await api.PATCH(request("PATCH",{...input(),id,title:"Rescheduled SG launch",startLocal:"2026-09-29T20:00",endLocal:"2026-09-29T21:00"}));
  assert.equal(response.status,200);
  const changed=(await response.json()).session;
  assert.equal(changed.start_at,"2026-09-29T12:00:00.000Z");assert.equal(changed.title,"Rescheduled SG launch");
  assert.equal(changed.updated_by,"admin@example.test");assert.equal(changed.tenant_id,"j-packaging");
});

test("reads all pages beyond 500 sessions without truncation",async()=>{
  state.sessions=Array.from({length:1001},(_,index)=>session({id:String(index)}));
  const result=await(await api.GET(new Request("https://calendar.test/api/live-calendar"))).json();
  assert.equal(result.sessions.length,1001);
  assert.deepEqual(state.calls.filter(call=>call.path.startsWith("live_sessions?")).map(call=>new URL(call.path,"https://rest.test").searchParams.get("offset")),["0","500","1000"]);
});

test("SkinDae SG canonical identity never matches MY or the Orders slug row",()=>{
  assert.equal(api.canonicalIdForDirectoryName("SkinDae SG by CTG4u"),sg.id);
  assert.equal(api.canonicalStoreId("shopee-skindae-sg-by-ctg4u"),sg.id);
  assert.equal(api.matchingStore("SkinDae SG",[my]),undefined);
  assert.equal(api.matchingStore("SkinDae SG",[{...sg,id:"shopee-skindae-sg-by-ctg4u"}]),undefined);
  assert.equal(api.matchingStore("SkinDae SG",[my,sg]).id,sg.id);
});

test("customer Calendar permission settings require explicit selected stores",async()=>{
  state.targetUser={...state.member,id:2,role:"customer",store_access_mode:"all",module_access_mode:"custom"};
  const body={id:2,role:"customer",moduleAccessMode:"custom",enabledModules:["live_calendar"],storeAccessMode:"all",storeIds:[sg.id]};
  assert.equal((await api.updateUser(request("PATCH",body))).status,400);
  assert.equal((await api.updateUser(request("PATCH",{...body,storeAccessMode:"selected",storeIds:[]}))).status,400);
  assert.equal(state.calls.some(call=>call.init.method),false);
});

test("calendar local day bounds include grid-first-day 00:30 in every browser timezone",()=>{
  const previous=process.env.TZ;
  try {
    for(const zone of ["UTC","Asia/Kuala_Lumpur","America/Los_Angeles","Pacific/Auckland"]) {
      process.env.TZ=zone;
      const anchor=api.storeCalendarAnchor("2026-09-27T17:00:00.000Z");
      assert.equal(anchor.toISOString(),"2026-09-28T00:00:00.000Z");
      const range=api.calendarRange("month",anchor);
      assert.equal(range.startDay.toISOString(),"2026-08-31T00:00:00.000Z");
      assert.equal(range.from,"2026-08-30T16:00:00.000Z");
      const firstEvent=api.parseStoreLocal("2026-08-31T00:30");
      assert.ok(firstEvent>=range.from&&firstEvent<range.to);
      assert.equal(api.storeDateKey(firstEvent),"2026-08-31");
      assert.equal(api.storeDateKey(api.parseStoreLocal("2026-09-29T00:30")),"2026-09-29");
    }
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test("sessions continue across week/month boundaries without adding a midnight end day",()=>{
 const row={start_at:"2026-10-04T15:30:00Z",end_at:"2026-10-04T16:30:00Z"};
 assert.equal(api.sessionOccursOnDay(row,new Date("2026-10-04T00:00:00Z")),true);
 assert.equal(api.sessionOccursOnDay(row,new Date("2026-10-05T00:00:00Z")),true);
 assert.equal(api.sessionOccursOnDay(row,new Date("2026-10-06T00:00:00Z")),false);
 assert.equal(api.sessionOccursOnDay({...row,end_at:"2026-10-04T16:00:00Z"},new Date("2026-10-05T00:00:00Z")),false);
 assert.equal(api.sessionOccursOnDay({start_at:"2026-09-30T15:30:00Z",end_at:"2026-09-30T16:30:00Z"},new Date("2026-10-01T00:00:00Z")),true);
});
