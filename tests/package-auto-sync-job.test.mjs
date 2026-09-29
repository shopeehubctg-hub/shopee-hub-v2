import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validSyncJobSignature } from '../app/api/packages/sync-job-auth.ts';

test('job authentication rejects altered bodies, old requests, missing keys and forged signatures', () => {
  const time = String(Date.now());
  const body = '{"action":"pull"}';
  const signature = createHmac('sha256','test-key').update(`package-sheet-sync\n${time}\n${body}`).digest('hex');
  assert.equal(validSyncJobSignature(body,time,signature,'test-key'),true);
  assert.equal(validSyncJobSignature('{"action":"confirm"}',time,signature,'test-key'),false);
  assert.equal(validSyncJobSignature(body,time,signature,'test-key',Number(time)+300001),false);
  assert.equal(validSyncJobSignature(body,time,signature,undefined),false);
  assert.equal(validSyncJobSignature(body,time,'a'.repeat(64),'test-key'),false);
});

const source = readFileSync(new URL('../integrations/PackageSheetAutoSync.gs',import.meta.url),'utf8');
function scriptFixture(rows = [['Timestamp','Change ID','Owner','Store','Package','Version']]) {
  const properties = new Map([['HISTORY_SECRET','test-key'],['PACKAGE_SYNC_ENABLED','true']]);
  const payload = {changeId:'example-package-v2',store:'Example Store',packageName:'Example Package',version:2,timestamp:'2026-09-29T08:00:00Z'};
  let pending = true;
  let loseConfirmation = true;
  const alerts=[];
  const sheet={getLastRow:()=>rows.length,getRange:(_row,start,_count,width)=>({getDisplayValues:()=>rows.map(row=>row.slice(start-1,start-1+width).map(v=>String(v ?? '')))}),appendRow:row=>rows.push(row)};
  const props={getProperty:key=>properties.get(key)??null,setProperty:(key,value)=>properties.set(key,value),setProperties:values=>Object.entries(values).forEach(([k,v])=>properties.set(k,v)),deleteProperty:key=>properties.delete(key)};
  const lock=()=>({tryLock:()=>true,waitLock:()=>{},releaseLock:()=>{}});
  const context=vm.createContext({SPREADSHEET_ID:'example-sheet',HISTORY_SHEET:'Package History',console:{log:()=>{}},
    PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:lock,getUserLock:lock},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    Utilities:{computeHmacSha256Signature:(value,key)=>[...createHmac('sha256',key).update(value).digest()].map(n=>n>127?n-256:n)},
    MailApp:{getRemainingDailyQuota:()=>100,sendEmail:(...args)=>alerts.push(args)},
    UrlFetchApp:{fetch:(_url,options)=>{
      assert.equal(validSyncJobSignature(options.payload,options.headers['x-package-sync-time'],options.headers['x-package-sync-signature'],'test-key'),true);
      const request=JSON.parse(options.payload);
      if(request.action==='confirm'&&loseConfirmation){loseConfirmation=false;throw new Error('Response lost');}
      if(request.action==='confirm')pending=false;
      const response=request.action==='pull'?{ok:true,entries:pending?[{versionId:'example-version',payload}]:[]}:{ok:true,confirmed:['example-version']};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)};
    }},
  });
  vm.runInContext(source,context);
  return {context,rows,properties,alerts};
}

test('a lost acknowledgement retries the same Change ID without another Sheet row', () => {
  const f=scriptFixture();
  assert.throws(()=>f.context.checkPackageSheetAutoSync(),/Response lost/);
  assert.equal(f.rows.length,2);
  f.context.checkPackageSheetAutoSync();
  assert.equal(f.rows.length,2);
  assert.deepEqual(JSON.parse(f.properties.get('PACKAGE_SYNC_LAST_RESULT')),{queued:1,added:0,confirmed:1});
  f.context.checkPackageSheetAutoSync();
  assert.equal(f.rows.length,2);
  assert.deepEqual(JSON.parse(f.properties.get('PACKAGE_SYNC_LAST_RESULT')),{queued:0,added:0,confirmed:0});
});

test('duplicate or inconsistent history records are not acknowledged or overwritten', () => {
  const row=['date','example-package-v2','owner','Example Store','Example Package','2'];
  const duplicated=scriptFixture([row,row]);
  assert.throws(()=>duplicated.context.checkPackageSheetAutoSync(),/Duplicate Change ID/);
  assert.equal(duplicated.rows.length,2);
  const mismatched=scriptFixture([['date','example-package-v2','owner','Other Store','Example Package','2']]);
  assert.throws(()=>mismatched.context.checkPackageSheetAutoSync(),/differs from/);
  assert.equal(mismatched.rows.length,1);
});
