import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({stdin:{contents:`export {compactPackageQuery,readCompactPackageRows} from './app/api/packages/compact-read'; export {PgDialect} from 'drizzle-orm/pg-core';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {compactPackageQuery,readCompactPackageRows,PgDialect}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
test('compact query uses one snapshot and keeps parameters and child package scope',async()=>{
 const hostile="x'); drop table packages; --";
 const query=new PgDialect().sqlToQuery(compactPackageQuery([hostile]));
 assert.ok(!query.sql.includes(hostile));assert.equal(query.params[0],hostile);
 assert.match(query.sql,/sheet_sync_status='synced'/);
 assert.match(query.sql,/version<l.version/);
 assert.match(query.sql,/calculator_settings->'_packageEnded'='true'::jsonb/);
 for(const table of ['package_versions','package_prices','package_platform_skus'])assert.match(query.sql,new RegExp('"'+table+'"\\."package_id" in \\(select package_id from scope\\)'));
 let calls=0;const rows={versions:[],prices:[],platforms:[]};
 const result=await readCompactPackageRows({execute:async()=>{calls++;return [rows];}},['p']);
 assert.equal(calls,1);assert.deepEqual(result,[[],[],[]]);
 assert.throws(()=>compactPackageQuery([]),/authorized scope/);
 await assert.rejects(()=>readCompactPackageRows({execute:async()=>[]},['p']),/no result/);
});
