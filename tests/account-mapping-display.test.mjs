import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/account-mapping-display.ts','--bundle','--format=esm','--platform=node','--target=node20']);
const {accountMappingDisplay}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
test('unique current selector matches do not require a persisted financial binding to clear the Client warning',()=>{
 const candidate={storeId:'store-a',storeName:'Current store',mappingId:'',username:''};
 const row={storeId:null,storeName:'Billing project',candidates:[candidate]};const before=structuredClone(row);
 assert.equal(accountMappingDisplay(row).needsReview,false);
 assert.equal(accountMappingDisplay({...row,candidates:[candidate,{...candidate,mappingId:'other alias'}]}).needsReview,false);
 assert.equal(accountMappingDisplay({...row,candidates:[candidate,{...candidate,storeId:'store-b'}]}).needsReview,true);
 assert.equal(accountMappingDisplay({...row,candidates:[{...candidate,storeId:null}]}).needsReview,true);
 assert.equal(accountMappingDisplay({...row,candidates:[]}).needsReview,true);
 assert.equal(accountMappingDisplay({...row,storeId:'saved-store',storeName:'Saved store',candidates:[]}).needsReview,false);
 assert.deepEqual(row,before);assert.equal(row.storeId,null);
});
