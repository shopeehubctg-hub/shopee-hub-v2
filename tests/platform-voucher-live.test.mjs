import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='node_modules/.voucher-live-tests';await mkdir(dir,{recursive:true});
await build({entryPoints:['app/platform-voucher.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {platformVoucherFromRow}=await import('../'+dir+'/platform-voucher.js');
test('database percentages are already percentages; late zero stays distinct from unknown',()=>{
 assert.deepEqual(platformVoucherFromRow({non_campaign_average:'5.55',campaign_average:'17.89',late_month_average:'0',source_updated_at:'2026-11-05T06:00:00Z'}),{early:5.55,campaign:17.89,late:0,updatedAt:'2026-11-05T06:00:00Z'});
 assert.equal(platformVoucherFromRow({non_campaign_average:'16',campaign_average:'22',late_month_average:null,source_updated_at:'old'}).late,null);
});
let calls=[],answer=[];
await build({entryPoints:['app/platform-voucher-server.ts'],outfile:dir+'/server.js',bundle:true,platform:'node',format:'esm',plugins:[{name:'mock-server',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export {};',loader:'js'}));b.onResolve({filter:/supabase-rest$/},()=>({path:'rest',namespace:'rest'}));b.onLoad({filter:/.*/,namespace:'rest'},()=>({contents:'export const supabaseRest=(...args)=>globalThis.__voucherRest(...args);',loader:'js'}));}}],logLevel:'silent'});
globalThis.__voucherRest=async path=>{calls.push(path);if(answer instanceof Error)throw answer;return answer;};
const {readPlatformVoucher}=await import('../'+dir+'/server.js');
test('server reads only the authorized store and tenant; DB changes are visible on the next read',async()=>{
 const row={non_campaign_average:17.14,campaign_average:22,late_month_average:8,source_updated_at:'2026-11-05'};answer=[row];
 assert.equal((await readPlatformVoucher('shop A','tenant B')).late,8);
 const q=new URLSearchParams(calls.at(-1).split('?')[1]);assert.equal(q.get('store_id'),'eq.shop A');assert.equal(q.get('tenant_id'),'eq.tenant B');assert.equal(q.get('limit'),'1');
 answer=[{...row,late_month_average:9}];assert.equal((await readPlatformVoucher('shop A','tenant B')).late,9);
 answer=new Error('temporary outage');assert.equal(await readPlatformVoucher('shop A','tenant B'),null);
 answer=[];assert.equal(await readPlatformVoucher('shop A','tenant B'),null);
});
