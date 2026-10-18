import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=ts.transpileModule(readFileSync('app/chatgpt-auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(vercel,cookie){
  const exports={};
  const environment={env:{VERCEL:vercel,SUPABASE_SECRET_KEY:'test-only-session-secret'}};
  const headers=new Headers({'oai-authenticated-user-email':'forged-admin@example.test'});
  const mockedRequire=name=>name==='next/headers'?{headers:async()=>headers,cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})}:name==='next/navigation'?{redirect:()=>{throw Error('redirect')}}:require(name);
  new Function('require','exports','process',source)(mockedRequire,exports,environment);
  return exports;
}
test('public Vercel identity headers do not authenticate a caller without a signed session',async()=>{
  assert.equal(await fixture('1').getChatGPTUser(),null);
  assert.equal(await fixture('1','invalid.signature').getChatGPTUser(),null);
});
test('a valid portal session authenticates its owner and ignores a conflicting identity header',async()=>{
  const seed=fixture('1');const cookie=seed.createPortalSession('owner@example.test');
  const user=await fixture('1',cookie).getChatGPTUser();
  assert.equal(user.email,'owner@example.test');
});
test('the non-Vercel authenticated proxy keeps its existing identity flow',async()=>{
  assert.equal((await fixture(undefined).getChatGPTUser()).email,'forged-admin@example.test');
});
