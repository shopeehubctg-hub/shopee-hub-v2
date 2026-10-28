import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";

async function bundle(entry,stub){
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"readiness-dependencies",setup(build){
    build.onResolve({filter:/^(next\/server|drizzle-orm|.*\/(deployment-isolation|supabase-rest|db))$/},args=>({path:args.path,namespace:"readiness-test"}));
    build.onLoad({filter:/.*/,namespace:"readiness-test"},args=>({loader:"js",contents:stub(args.path)}));
  }}]});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const {proxy}=await bundle("proxy.ts",()=>"export const NextResponse={next:()=>new Response(null,{headers:{'x-middleware-next':'1'}})};");
const {GET}=await bundle("app/api/health/route.ts",path=>path.endsWith("deployment-isolation")?
  "export function assertDeploymentIsolation(){globalThis.__readiness.check();} export function deploymentTarget(){return 'staging';} export const STAGING_SUPABASE_REF='stage-ref', PRODUCTION_SUPABASE_REF='prod-ref';":path.endsWith("supabase-rest")?
  "export async function supabaseRest(path){return globalThis.__readiness.rest(path);}":path.endsWith("/db")?
  "export async function getDb(){return {execute:query=>globalThis.__readiness.sql(query)};}":"export const sql=(parts)=>parts.join('');");

test("readiness is reachable before app sign-in while business APIs stay protected",async()=>{
  const request=path=>({nextUrl:{pathname:path},cookies:{get:()=>undefined}});
  assert.equal((await proxy(request("/api/health"))).headers.get("x-middleware-next"),"1");
  for(const path of ["/api/dashboard","/api/admin/users","/api/packages"])
    assert.equal((await proxy(request(path))).status,401);
});

test("readiness verifies both Supabase REST and Postgres, and reports errors without credentials",async()=>{
  const calls=[];
  globalThis.__readiness={check:()=>calls.push("isolation"),rest:path=>{assert.equal(path,"tenants?select=id&limit=1");calls.push("REST");return [{id:"private-tenant"}];},sql:query=>{assert.equal(query,"select 1");calls.push("Postgres");return [{"?column?":1}];}};
  const ready=await GET();assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{status:"ready",environment:"staging",projectRef:"stage-ref",databaseReachable:true});assert.equal(calls[0],"isolation");assert.ok(calls.includes("REST")&&calls.includes("Postgres"));
  assert.equal(ready.headers.get("cache-control"),"no-store");
  for(const method of ["check","rest","sql"]){
    const saved=globalThis.__readiness[method];globalThis.__readiness[method]=()=>{throw Error("SECRET_CONNECTION_STRING");};
    const failed=await GET();assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/SECRET_CONNECTION_STRING|private-tenant/);globalThis.__readiness[method]=saved;
  }
});
