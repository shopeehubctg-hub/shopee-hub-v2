import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
function route(path,membership){
  const source=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};const cookies=[];
  const mockedRequire=name=>{
    if(name==="next/headers")return {cookies:async()=>({set:(...args)=>cookies.push(args)})};
    if(name.endsWith("/chatgpt-auth"))return {createPortalSession:()=>"signed-test-cookie",PORTAL_SESSION_COOKIE:"portal"};
    if(name.endsWith("/supabase-rest"))return {supabaseConfig:()=>({url:"https://auth.example.test",secret:"test-secret"}),supabaseRest:async()=>membership};
    throw Error("Unexpected import "+name);
  };
  new Function("require","exports","process",source)(mockedRequire,exports,{env:{PORTAL_PUBLIC_URL:"https://shopee-hub-v2-260731.vercel.app"}});
  return {exports,cookies};
}
test("old shared temporary password is not accepted without an email token",async()=>{
  const {exports}=route("app/api/auth/password/route.ts",[{active:true,role:"customer"}]);
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error("provider must not be called")};
  try{
    const response=await exports.POST(new Request("https://shopee-hub-v2-260731.vercel.app/api/auth/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"customer@example.test",temporaryPassword:"shared",password:"a long new password"})}));
    assert.equal(response.status,400);
  }finally{globalThis.fetch=oldFetch}
});
test("a verified email token changes only its own active account",async()=>{
  const {exports,cookies}=route("app/api/auth/password/route.ts",[{active:true,role:"customer"}]);
  const requests=[];const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{requests.push([url,options]);return Response.json(options.method==="PUT"?{ok:true}:{email:"customer@example.test"})};
  try{
    const response=await exports.POST(new Request("https://shopee-hub-v2-260731.vercel.app/api/auth/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessToken:"user-token",password:"a long new password"})}));
    assert.equal(response.status,200);
    assert.equal(requests.length,2);
    assert.equal(requests[1][1].method,"PUT");
    assert.equal(requests[1][1].headers.Authorization,"Bearer user-token");
    assert.equal(cookies.length,1);
  }finally{globalThis.fetch=oldFetch}
});
test("recovery response does not reveal whether an account is registered",async()=>{
  const {exports}=route("app/api/auth/recover/route.ts",[]);
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error("provider must not be called")};
  try{
    const response=await exports.POST(new Request("https://shopee-hub-v2-260731.vercel.app/api/auth/recover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"missing@example.test"})}));
    assert.equal(response.status,200);
    assert.match((await response.json()).message,/If this email has portal access/);
  }finally{globalThis.fetch=oldFetch}
});
