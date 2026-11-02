import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['app/xero-store-name-evidence.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {extractXeroStoreNames}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('explicit store label extracts BONLIFE without following PICKUP instructions',()=>{assert.deepEqual(extractXeroStoreNames(['STORE NAME: BONLIFE\nPICKUP: warehouse']),['BONLIFE']);assert.deepEqual(extractXeroStoreNames(['Store Name: BONLIFE PICKUP: warehouse']),['BONLIFE']);});
test('unlabelled text and company/currency never infer a store',()=>{assert.deepEqual(extractXeroStoreNames(['BONLIFE SGD MY Company','Company Name: BONLIFE']),[]);});
test('distinct labels remain distinct and duplicate labels normalize safely',()=>{assert.deepEqual(extractXeroStoreNames(['STORE NAME: BONLIFE\nSTORE NAME: Goherb SG','store name: bonlife']),['bonlife','Goherb SG']);});
test('malformed oversized and unsafe labels remain unresolved',()=>{for(const value of ['', 'x'.repeat(121),'https://example.com','user@example.com'])assert.deepEqual(extractXeroStoreNames([`STORE NAME: ${value}`]),[]);assert.deepEqual(extractXeroStoreNames(Array.from({length:9},(_,i)=>`STORE NAME: Store ${i}`)),[]);});

test('a valid label plus any invalid explicit label never becomes a confident unique match',()=>{assert.deepEqual(extractXeroStoreNames(['STORE NAME: Store A','STORE NAME: https://example.com']),[]);assert.deepEqual(extractXeroStoreNames(['STORE NAME: Store A\nSTORE NAME:']),[]);});
