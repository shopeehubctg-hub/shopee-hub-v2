import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=ts.transpileModule(readFileSync("app/api/value-actions/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
const mockedRequire=name=>{
  if(name.endsWith("/chatgpt-auth"))return {getChatGPTUser:async()=>null};
  if(name.endsWith("/ad-balance-validation.js"))return {malaysiaDate:()=>"2026-10-28"};
  if(name.endsWith("/module-access"))return {};
  if(name.endsWith("/db")||name.endsWith("/db/schema"))return {getDb:()=>{throw Error("unauthorized database access")}};
  if(name==="drizzle-orm")return {};
  throw Error("Unexpected import: "+name);
};
new Function("require","exports","process",source)(mockedRequire,exports,{env:{SHOPEE_VALUE_PROOF_ENABLED:"1"}});
test("an unauthenticated caller cannot create an action",async()=>{
  const request=new Request("https://portal.example.test/api/value-actions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({storeId:"store-1",category:"Pricing",title:"Check",detail:"Issue",impact:"Save cost",dueDate:"2026-11-01"})});
  const response=await exports.POST(request);
  assert.equal(response.status,401);
});
test("an unauthenticated caller cannot approve an action",async()=>{
  const request=new Request("https://portal.example.test/api/value-actions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({storeId:"store-1",actionId:1,operation:"approve"})});
  const response=await exports.PATCH(request);
  assert.equal(response.status,401);
});
