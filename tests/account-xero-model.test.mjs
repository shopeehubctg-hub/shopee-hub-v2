import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
function load(source,imports={}){const out={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>{if(!(name in imports))throw Error(name);return imports[name];});return out;}
const money=load(await readFile(new URL('../app/xero-model.ts',import.meta.url),'utf8'));
const {buildAccountXeroProjection:project,xeroSourceKey}=load(await readFile(new URL('../app/account-xero-model.ts',import.meta.url),'utf8'),{'./xero-model':money});
const names=['Shopee Hub','Shopee Hub Internal','Tik Tok Hub','Lazada Hub'];
const scope={categoryId:'category',options:names.map((project,i)=>({id:`p${i}`,project}))};
const row=(key,extra={})=>({id:key,rosterKey:key,storeId:`store-${key}`,storeName:`Store ${key}`,project:`Client ${key}`,entity:`Company ${key}`,currency:'MYR',invoiceMonth:'2026-10',billed:'999.00',collected:'99.00',outstanding:'900.00',...extra});
const invoice=(id='i1',extra={})=>({invoiceId:id,invoiceNumber:'INV/001',contactId:'contact',currency:'MYR',state:'eligible',project:'Shopee Hub',gross:'108.00',amountPaid:'40.00',amountDue:'48.00',amountCredited:'20.00',tax:'8.00',date:'2026-10-01',dueDate:'2026-10-30',...extra});
const company=(extra={})=>({contactId:'contact',companyName:'Company a',categoryId:'category',optionId:'p0',project:'Shopee Hub',...extra});
const mapping=(extra={})=>({contactId:'contact',categoryId:'category',optionId:'p0',unitKey:'a',effectiveMonth:'2026-10',version:'1',...extra});
const snapshot=(invoices=[invoice()],companies=[company()])=>({month:'2026-10',scope,companies,report:{rows:invoices}});
const run=(extra={})=>project({rows:[row('a')],snapshot:snapshot(),mappings:[],month:'2026-10',...extra});
test('unique exact company match is only a candidate until stable ID mapping is saved',()=>{
 const rows=[row('a')],before=structuredClone(rows);const result=run({rows,snapshot:snapshot([invoice()],[company({companyName:'  COMPANY   A '})])});
 assert.equal(result.groups[0].status,'candidate');assert.equal(result.groups[0].suggestedUnitKey,'a');assert.equal(result.groups[0].expectedVersion,'0');assert.equal(result.byUnit.a.status,'unmapped');assert.deepEqual(result.byUnit.a.byCurrency,[]);assert.equal(result.unmappedTotals[0].invoiced,'108.00');assert.deepEqual(rows,before);
 const mapped=run({rows,mappings:[mapping()]});assert.equal(mapped.groups[0].status,'mapped');assert.equal(mapped.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(mapped.unmappedInvoiceCount,0);
});
test('company shared by multiple clients is ambiguous; no fuzzy match or arbitrary financial allocation',()=>{
 const result=run({rows:[row('a'),row('b',{entity:'Company a'})]});assert.equal(result.groups[0].status,'ambiguous');assert.deepEqual(result.groups[0].candidateUnitKeys,['a','b']);assert.equal(result.groups[0].suggestedUnitKey,null);assert.equal(result.unmappedInvoiceCount,1);assert.deepEqual(result.byUnit.a.byCurrency,[]);
 assert.equal(run({snapshot:snapshot([invoice()],[company({companyName:'Company A Sdn Bhd'})])}).groups[0].status,'missing');
});
test('two Projects sharing a Contact ID require distinct stable source mappings',()=>{
 const invoices=[invoice('i1'),invoice('i2',{project:'Shopee Hub Internal',gross:'50',tax:'0',amountPaid:'10',amountDue:'40',amountCredited:'0'})];
 const companies=[company(),company({optionId:'p1',project:'Shopee Hub Internal'})];
 const result=run({rows:[row('a'),row('b')],snapshot:snapshot(invoices,companies),mappings:[mapping(),mapping({optionId:'p1',unitKey:'b'})]});
 assert.equal(result.groups.length,2);assert.notEqual(result.groups[0].groupKey,result.groups[1].groupKey);assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(result.byUnit.b.byCurrency[0].invoiced,'50.00');
});
test('MYR actuals in SG client do not relabel ledger currency or add legacy financial values',()=>{
 const rows=[row('a',{currency:'SGD',market:'SG',billed:'999.00'})];const result=run({rows,mappings:[mapping()]});assert.equal(rows[0].currency,'SGD');assert.equal(rows[0].billed,'999.00');assert.equal(result.byUnit.a.byCurrency[0].currency,'MYR');assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');
});
test('cash, AmountPaid and credits remain distinct and money uses exact BigInt aggregation',()=>{
 const result=run({mappings:[mapping()]});assert.deepEqual(result.byUnit.a.byCurrency,[{currency:'MYR',invoiced:'108.00',received:'40.00',outstanding:'48.00',tax:'8.00',credits:'20.00'}]);
 const large=invoice('large',{gross:'999999999999999999.99',amountPaid:'0',amountDue:'999999999999999999.99',amountCredited:'0',tax:'0'});assert.equal(run({snapshot:snapshot([large]),mappings:[mapping()]}).byUnit.a.byCurrency[0].invoiced,'999999999999999999.99');
 assert.throws(()=>run({snapshot:snapshot([invoice('wrong',{amountDue:'100'})]),mappings:[mapping()]}),/reconcile/);
});
test('effective month selects applicable assignment while expectedVersion uses all future versions',()=>{
 const maps=[mapping(),mapping({unitKey:'b',effectiveMonth:'2026-11',version:'2'})];
 const result=run({rows:[row('a'),row('b')],mappings:maps});assert.equal(result.groups[0].mappedUnitKey,'a');assert.equal(result.groups[0].expectedVersion,'2');assert.equal(result.groups[0].appliedVersion,'1');
 const next=snapshot();next.month='2026-11';next.report.rows[0].date='2026-11-01';const november=run({month:'2026-11',snapshot:next,rows:[row('a'),row('b')],mappings:maps});assert.equal(november.groups[0].mappedUnitKey,'b');assert.equal(november.byUnit.b.byCurrency[0].invoiced,'108.00');
});
test('old snapshot missing company names does not infer name bindings but saved stable IDs still resolve',()=>{
 const old=snapshot();delete old.companies;const result=run({snapshot:old});assert.equal(result.needsIdentitySync,true);assert.equal(result.groups[0].companyName,null);assert.equal(result.groups[0].status,'missing');assert.equal(run({snapshot:old,mappings:[mapping()]}).byUnit.a.byCurrency[0].invoiced,'108.00');
});
test('pending mixed tracking stays unallocated and marks financial completeness pending',()=>{
 const pending={invoiceId:'mixed',contactId:'contact',project:null,currency:'MYR',state:'pending',reason:'mixed_projects'};const result=run({snapshot:snapshot([invoice(),pending]),mappings:[mapping()]});assert.equal(result.byUnit.a.status,'pending');assert.equal(result.byUnit.a.invoices.length,1);assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');
});
test('zeros require real complete mapped invoice evidence, not an unmatched client or absent currency',()=>{
 const zero=invoice('zero',{gross:'0',tax:'0',amountPaid:'0',amountDue:'0',amountCredited:'0'});assert.equal(run({snapshot:snapshot([zero]),mappings:[mapping()]}).byUnit.a.byCurrency[0].invoiced,'0.00');assert.deepEqual(run({snapshot:snapshot([]),mappings:[mapping()]}).byUnit.a.byCurrency,[]);assert.equal(run({snapshot:null}).byUnit.a.status,'not_synced');assert.deepEqual(run({snapshot:null}).byUnit.a.byCurrency,[]);
});
test('duplicates, wrong scope/month and invalid targets fail closed without double counting',()=>{
 assert.throws(()=>run({snapshot:snapshot([invoice(),invoice()]),mappings:[mapping()]}),/Duplicate invoice/);
 assert.throws(()=>run({mappings:[mapping(),mapping()]}),/Duplicate mapping/);
 assert.throws(()=>run({rows:[row('a'),row('a')]}),/Duplicate billing/);
 assert.throws(()=>run({snapshot:snapshot([invoice('older',{date:'2026-09-01'})])}),/Wrong invoice month/);
 assert.throws(()=>run({snapshot:snapshot([invoice('outside',{project:'Other'})])}),/scope/);
 assert.throws(()=>run({snapshot:snapshot([invoice()],[company({optionId:'outside'})])}),/identity/);
 const conflict=run({mappings:[mapping({unitKey:'unknown'})]});assert.equal(conflict.groups[0].status,'conflict');assert.equal(conflict.unmappedInvoiceCount,1);assert.deepEqual(conflict.byUnit.a.byCurrency,[]);
 assert.equal(xeroSourceKey('a','b','c'),JSON.stringify(['a','b','c']));
});
test('multiple stable source pairs can aggregate one client once without mutating original invoices',()=>{
 const invoices=[invoice(),invoice('i2',{contactId:'second',currency:'SGD'})],before=structuredClone(invoices);const result=run({snapshot:snapshot(invoices,[company(),company({contactId:'second'})]),mappings:[mapping(),mapping({contactId:'second'})]});assert.equal(result.byUnit.a.invoices.length,2);assert.equal(result.byUnit.a.byCurrency.length,2);assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(result.byUnit.a.byCurrency[1].invoiced,'108.00');assert.deepEqual(invoices,before);
});

test('an additional unresolved source group keeps an already mapped client subtotal explicitly pending',()=>{
 const invoices=[invoice(),invoice('i2',{contactId:'second'})],companies=[company(),company({contactId:'second'})];
 const result=run({snapshot:snapshot(invoices,companies),mappings:[mapping()]});
 assert.equal(result.byUnit.a.status,'pending');assert.equal(result.byUnit.a.invoices.length,1);assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(result.unmappedInvoiceCount,1);
 assert.equal(result.groups.find(group=>group.contactId==='second').status,'candidate');
});
test('UUID case changes cannot split a stable source key or evade duplicate identity checks',()=>{
 const contact='ABCDEF01-2345-4678-8ABC-0123456789AB',category='ABCDEF02-2345-4678-8ABC-0123456789AB',option='ABCDEF03-2345-4678-8ABC-0123456789AB';
 assert.equal(xeroSourceKey(contact,category,option),xeroSourceKey(contact.toLowerCase(),category.toLowerCase(),option.toLowerCase()));
 const data=snapshot([invoice('i1',{contactId:contact})],[company({contactId:contact.toLowerCase(),categoryId:category.toLowerCase(),optionId:option.toLowerCase()})]);
 data.scope={categoryId:category,options:scope.options.map((entry,index)=>index?entry:{...entry,id:option})};
 const result=run({snapshot:data,mappings:[mapping({contactId:contact.toLowerCase(),categoryId:category.toLowerCase(),optionId:option.toLowerCase()})]});
 assert.equal(result.groups.length,1);assert.equal(result.groups[0].contactId,contact.toLowerCase());assert.equal(result.groups[0].status,'mapped');assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');
 data.companies.push(company({contactId:contact,categoryId:category,optionId:option}));assert.throws(()=>run({snapshot:data}),/Duplicate company/);
});

test('one audited live store candidate is a target proposal only; distinct candidates stay unresolved',()=>{
 const candidate={mappingId:'audited',username:'source',storeId:'canonical-live-store',storeName:'Live Store'};
 const rows=[row('a',{storeId:null,candidates:[candidate,{...candidate,mappingId:'duplicate-alias'}]})];const result=run({rows});
 assert.equal(result.targets[0].storeId,'canonical-live-store');assert.equal(rows[0].storeId,null);assert.equal(result.groups[0].status,'candidate');assert.deepEqual(result.byUnit.a.byCurrency,[]);
 assert.equal(run({rows:[row('a',{storeId:null,candidates:[candidate,{...candidate,storeId:'other'}]})]}).targets[0].storeId,null);
 assert.equal(run({rows:[row('a',{storeId:'saved-store',candidates:[candidate]})]}).targets[0].storeId,'saved-store');
});

test('ambiguous same-company invoices split to different clients only through explicit invoice overrides',()=>{
 const rows=[row('a'),row('b',{entity:'Company a'})],data=snapshot([invoice('i1'),invoice('i2',{gross:'50',tax:'0',amountPaid:'0',amountDue:'50',amountCredited:'0'})]);
 const broad=run({rows,snapshot:data,mappings:[mapping()]});assert.equal(broad.groups[0].status,'ambiguous');assert.equal(broad.unmappedInvoiceCount,2);assert.deepEqual(broad.byUnit.a.byCurrency,[]);
 const partial=run({rows,snapshot:data,mappings:[mapping({invoiceId:'i1'})]});assert.equal(partial.groups[0].status,'partial');assert.equal(partial.groups[0].mappedInvoiceCount,1);assert.equal(partial.byUnit.a.status,'pending');assert.equal(partial.unmappedInvoiceCount,1);
 const result=run({rows,snapshot:data,mappings:[mapping({invoiceId:'i1'}),mapping({invoiceId:'i2',unitKey:'b',version:'2'})]});assert.equal(result.groups[0].status,'split');assert.equal(result.groups[0].expectedVersion,'2');assert.equal(result.groups[0].mappedInvoiceCount,2);assert.equal(result.unmappedInvoiceCount,0);assert.equal(result.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(result.byUnit.b.byCurrency[0].invoiced,'50.00');assert.equal(result.byUnit.a.status,'mapped');assert.equal(result.byUnit.b.status,'mapped');assert.deepEqual(result.groups[0].invoiceChoices.map(choice=>[choice.invoiceId,choice.mappedUnitKey]),[['i1','a'],['i2','b']]);
});
test('invoice override wins over group default without double counting and future overrides do not rewrite selected month',()=>{
 const data=snapshot([invoice('i1'),invoice('i2')]),rows=[row('a'),row('b')];const mappings=[mapping(),mapping({invoiceId:'i1',unitKey:'b',version:'2'}),mapping({invoiceId:'i1',unitKey:'a',version:'3',effectiveMonth:'2026-11'})];
 const result=run({rows,snapshot:data,mappings});assert.equal(result.groups[0].expectedVersion,'3');assert.equal(result.groups[0].status,'split');assert.equal(result.byUnit.a.invoices.length,1);assert.equal(result.byUnit.b.invoices.length,1);assert.equal(result.byUnit.a.invoices[0].invoiceId,'i2');assert.equal(result.byUnit.b.invoices[0].invoiceId,'i1');assert.equal(result.groups[0].invoiceChoices[0].appliedVersion,'2');assert.equal(result.unmappedInvoiceCount,0);
});
test('punctuation-normalized legal names reveal ambiguous clients without removing legal suffixes or using fuzzy matches',()=>{
 const rows=[row('bonlife',{entity:'BONLIFE(M)SDNBHD'}),row('goherb',{entity:'Bonlife (M) Sdn Bhd.'})];const data=snapshot([invoice()],[company({companyName:'BONLIFE (M) SDN. BHD.'})]);const result=run({rows,snapshot:data,mappings:[mapping({unitKey:'bonlife'})]});assert.equal(result.groups[0].status,'ambiguous');assert.deepEqual(result.groups[0].candidateUnitKeys,['bonlife','goherb']);assert.deepEqual(result.byUnit.bonlife.byCurrency,[]);
 assert.equal(run({rows:[row('a',{entity:'DRSMILE SDN BHD'})],snapshot:snapshot([invoice()],[company({companyName:'Drsmile Sdn.Bhd.'})])}).groups[0].status,'candidate');
 assert.equal(run({rows:[row('a',{entity:'BONLIFE'})],snapshot:data}).groups[0].status,'missing');
});

test('unrecognized company with several invoices cannot use a whole-company mapping',()=>{
 const data=snapshot([invoice('i1'),invoice('i2'),invoice('i3')],[company({companyName:'Unrecognized company'})]);
 const broad=run({snapshot:data,mappings:[mapping()]});assert.equal(broad.groups[0].candidateUnitKeys.length,0);assert.equal(broad.unmappedInvoiceCount,3);assert.deepEqual(broad.byUnit.a.byCurrency,[]);
 const scoped=run({snapshot:data,mappings:[mapping(),mapping({invoiceId:'i1',version:'2'})]});assert.equal(scoped.groups[0].status,'partial');assert.equal(scoped.byUnit.a.invoices.length,1);assert.equal(scoped.byUnit.a.byCurrency[0].invoiced,'108.00');assert.equal(scoped.unmappedInvoiceCount,2);
});
