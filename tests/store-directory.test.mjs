import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve("esbuild", { paths: [dirname(require.resolve("vite"))] })));
const compiled = await build({
  entryPoints: ["app/store-directory.ts"], bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "database-stub", setup(build) {
    build.onResolve({ filter: /^(server-only|\.\/supabase-rest)$/ }, args => ({ path: args.path, namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({
      contents: args.path === "server-only" ? "" : "export async function supabaseRest(path,init){return globalThis.__storeRest(path,init);}", loader: "js",
    }));
  } }],
});
const directory = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

test("store details validate links, owner and distinct project names", () => {
  const valid = directory.parseStoreDetails({
    storeGroupLink: "https://chat.whatsapp.com/group", googleDriveLink: "https://drive.google.com/folder",
    adsTopUpOwner: "Client Approval", projectLinks: [
      { project: "Mizino Placenta", href: "https://chat.whatsapp.com/first", driveLink: "https://drive.google.com/first" },
      { project: "Mizino SlimPro", href: "https://chat.whatsapp.com/second", driveLink: "https://drive.google.com/second" },
    ],
  });
  assert.equal(valid.value.projectLinks.length, 2);
  assert.notEqual(valid.value.projectLinks[0].driveLink, valid.value.projectLinks[1].driveLink);
  assert.equal("error" in directory.parseStoreDetails({projectLinks:[{project:"A",href:"javascript:alert(1)"}]}),true);
  assert.equal("error" in directory.parseStoreDetails({projectLinks:[{project:"A",href:"https://one.test"},{project:"a",href:"https://two.test"}]}),true);
  assert.equal("error" in directory.parseStoreDetails({adsTopUpOwner:"unknown",projectLinks:[]}),true);
});

test("store directory reads profiles by stable store ID and keeps project order", async () => {
  globalThis.__storeRest = async path => {
    if (path.startsWith("link_directory_stores")) return [{store_id:"store-1",store_name:"Original",ads_top_up_owner:"Client",store_group_link:null,google_drive_link:null}];
    return [
      {id:2,store_id:"store-1",project_name:"First",project_group_link:"https://one.test",google_drive_link:"https://drive.test/one"},
      {id:3,store_id:"store-1",project_name:"Second",project_group_link:"https://two.test",google_drive_link:"https://drive.test/two"},
    ];
  };
  const result = await directory.storeDirectory("tenant-1");
  assert.deepEqual(directory.storeDetails(result,"store-1").projectLinks.map(x=>x.project),["First","Second"]);
  assert.equal(directory.storeDetails(result,"store-1").adsTopUpOwner,"Client");
  assert.equal(directory.storeDetails(result,"other").projectLinks.length,0);
});
