import type {AccountStoreRow} from './account-contract';
import {XERO_PROJECT_NAMES,xeroMoney,xeroDecimal,type XeroProjectName,type XeroProjectScope} from './xero-model';

export type AccountXeroCompany={contactId:string;companyName:string;categoryId:string;optionId:string;project:XeroProjectName};
/** Tenant, connection and organisation are checked by the server before calling this pure model. */
export type AccountXeroMappingVersion={contactId:string;categoryId:string;optionId:string;unitKey:string;effectiveMonth:string;version:string;invoiceId?:string|null};
export type AccountXeroInvoice={invoiceId:string;invoiceNumber:string|null;contactId:string|null;project:XeroProjectName|null;currency:string;state:string;reason?:string|null;gross?:string;amountPaid?:string;amountDue?:string;tax?:string;amountCredited?:string;date?:string|null;dueDate?:string|null;xeroUrl?:string;storeNames?:string[]};
export type AccountXeroSnapshot={month:string;today?:string;scope:XeroProjectScope;companies?:AccountXeroCompany[];report:{rows:AccountXeroInvoice[];pendingCount?:number}};
export type AccountXeroCurrency={currency:string;invoiced:string;received:string;outstanding:string;tax:string;credits:string};
export type AccountXeroActuals={status:'mapped'|'unmapped'|'pending'|'not_synced'|'conflict';invoiceMonth:string;lastSyncedAt:string|null;byCurrency:AccountXeroCurrency[];invoices:AccountXeroInvoice[]};
export type AccountXeroStoreEvidence={state:'matched'|'missing'|'ambiguous'|'conflict'|'needs_sync';storeNames:string[];candidateUnitKeys:string[];suggestedUnitKey:string|null;reason:string};
export type AccountXeroInvoiceChoice={invoiceId:string;invoiceNumber:string|null;currency:string;invoiced:string;received:string;outstanding:string;tax:string;credits:string;date:string|null;dueDate:string|null;xeroUrl:string;mappedUnitKey:string|null;appliedVersion:string|null;effectiveMonth:string|null;status:'mapped'|'missing'|'conflict';storeEvidence:AccountXeroStoreEvidence;suggestedUnitKey:string|null};
export type AccountXeroGroup={groupKey:string;contactId:string;categoryId:string;optionId:string;project:XeroProjectName;companyName:string|null;status:'mapped'|'candidate'|'ambiguous'|'missing'|'conflict'|'partial'|'split';mappedUnitKey:string|null;suggestedUnitKey:string|null;candidateUnitKeys:string[];expectedVersion:string;appliedVersion:string|null;effectiveMonth:string|null;invoiceCount:number;mappedInvoiceCount:number;invoiceChoices:AccountXeroInvoiceChoice[]};
export type AccountXeroTarget={unitKey:string;name:string;entity:string;billingEntity?:string|null;storeName:string;storeId:string|null;market?:string};
function canonicalId(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():value;}
export function xeroSourceKey(contactId:string,categoryId:string,optionId:string){return JSON.stringify([contactId,categoryId,optionId].map(canonicalId));}
function normalized(value:string|undefined|null){return (value??'').normalize('NFKC').toLowerCase().replace(/[\p{P}\s]+/gu,'');}
function validMonth(value:string){return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);}
function monthOf(value:string|null|undefined){if(!value)return null;const legacy=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);if(legacy)return new Date(Number(legacy[1])).toISOString().slice(0,7);return /^20\d{2}-(0[1-9]|1[0-2])-\d{2}/.test(value)?value.slice(0,7):null;}
export function accountXeroTargets(rows:AccountStoreRow[]):AccountXeroTarget[]{
 const seen=new Set<string>();return rows.map(row=>{const unitKey=row.rosterKey??row.id;if(!unitKey||seen.has(unitKey))throw Error('Duplicate billing unit');seen.add(unitKey);const candidates=[...new Map((row.candidates??[]).filter(candidate=>candidate.storeId).map(candidate=>[candidate.storeId!,candidate])).values()];return {unitKey,market:row.market,name:row.project||row.storeName,entity:row.entity??'',billingEntity:row.billingEntity??null,storeName:row.storeName,storeId:row.storeId??(candidates.length===1?candidates[0].storeId:null)};});
}
export function accountXeroStoreEvidence(invoice:AccountXeroInvoice,targets:AccountXeroTarget[]):AccountXeroStoreEvidence{
 const result=(state:AccountXeroStoreEvidence['state'],storeNames:string[],candidateUnitKeys:string[],reason:string):AccountXeroStoreEvidence=>({state,storeNames,candidateUnitKeys,suggestedUnitKey:state==='matched'?candidateUnitKeys[0]:null,reason});
 if(invoice.storeNames===undefined)return result('needs_sync',[],[],'Refresh invoices to inspect STORE NAME.');
 if(!Array.isArray(invoice.storeNames)||invoice.storeNames.length>8||invoice.storeNames.some(name=>typeof name!=='string'||!name.trim()||name.length>120||/[\u0000-\u001f\u007f]|https?:\/\/|www\.|@/iu.test(name)))throw Error('Invalid store-name evidence');
 const names=[...new Map(invoice.storeNames.map(name=>[normalized(name),name.trim()])).values()];
 if(!names.length)return result('missing',[],[],'Invoice has no STORE NAME.');
 if(names.length!==1)return result('ambiguous',names,[],'Invoice contains multiple STORE NAME labels.');
 const source=names[0],hasMY=/(?:^|[\s(\[\-])(?:MY|MALAYSIA)(?:$|[\s)\]])/iu.test(source),hasSG=/(?:^|[\s(\[\-])(?:SG|SINGAPORE)(?:$|[\s)\]])/iu.test(source);
 if(hasMY&&hasSG)return result('ambiguous',names,[],'STORE NAME contains conflicting MY and SG markers.');
 const marker=hasMY?'MY':hasSG?'SG':null;
 const key=normalized(source),bare=normalized(source.replace(/(?:^|\s)(?:MY|SG|MALAYSIA|SINGAPORE)(?=$|\s)/giu,' '));
 const matches=targets.filter(target=>!marker||target.market===marker).filter(target=>[target.name,target.storeName].some(name=>normalized(name)===key)||(key==='bonlife'&&['bonlifeofficialstore','bonlifeofficialstoresg'].includes(normalized(target.storeName)))||(marker&&[target.name,target.storeName].some(name=>normalized(name)===bare)));
 const keys=[...new Set(matches.map(target=>target.unitKey))];return result(keys.length===1?'matched':keys.length?'ambiguous':'missing',names,keys,keys.length===1?'Exact STORE NAME match.':keys.length?'STORE NAME matches multiple clients.':'STORE NAME does not match a client.');
}
function totals(rows:AccountXeroInvoice[]):AccountXeroCurrency[]{
 const currencies=new Map<string,Record<'invoiced'|'received'|'outstanding'|'tax'|'credits',bigint>>();
 for(const row of rows){
  if(row.state!=='eligible'||!row.gross||!row.amountPaid||!row.amountDue||!row.tax)throw Error('Incomplete eligible invoice');
  if(!/^[A-Z]{3}$/.test(row.currency))throw Error('Invalid invoice currency');
  const amount={invoiced:xeroMoney(row.gross),received:xeroMoney(row.amountPaid),outstanding:xeroMoney(row.amountDue),tax:xeroMoney(row.tax),credits:xeroMoney(row.amountCredited??'0')};
  if(amount.invoiced!==amount.received+amount.outstanding+amount.credits)throw Error('Invoice does not reconcile');
  const current=currencies.get(row.currency)??{invoiced:BigInt(0),received:BigInt(0),outstanding:BigInt(0),tax:BigInt(0),credits:BigInt(0)};
  for(const key of ['invoiced','received','outstanding','tax','credits'] as const)current[key]+=amount[key];currencies.set(row.currency,current);
 }
 return [...currencies].sort(([a],[b])=>a.localeCompare(b)).map(([currency,current])=>({currency,invoiced:xeroDecimal(current.invoiced),received:xeroDecimal(current.received),outstanding:xeroDecimal(current.outstanding),tax:xeroDecimal(current.tax),credits:xeroDecimal(current.credits)}));
}
/** Source-authoritative projection. Legacy ledger amounts and fee/store configuration are never overwritten or added. */
export function buildAccountXeroProjection({rows,snapshot,mappings,month,lastSyncedAt=null}:{rows:AccountStoreRow[];snapshot:AccountXeroSnapshot|null|undefined;mappings:AccountXeroMappingVersion[];month:string;lastSyncedAt?:string|null}){
 if(!validMonth(month))throw Error('Invalid invoice month');
 const targets=accountXeroTargets(rows),targetByKey=new Map(targets.map(target=>[target.unitKey,target]));
 const byUnit:Record<string,AccountXeroActuals>=Object.fromEntries(targets.map(target=>[target.unitKey,{status:'not_synced',invoiceMonth:month,lastSyncedAt,byCurrency:[],invoices:[]} as AccountXeroActuals]));
 if(!snapshot||snapshot.month!==month)return {groups:[] as AccountXeroGroup[],targets,byUnit,unmappedInvoiceCount:0,unmappedTotals:[] as AccountXeroCurrency[],needsIdentitySync:true};
 const scope={categoryId:canonicalId(snapshot.scope.categoryId),options:snapshot.scope.options.map(option=>({...option,id:canonicalId(option.id)}))};
 if(!scope.categoryId||scope.options.length!==4||new Set(scope.options.map(option=>option.id)).size!==4||new Set(scope.options.map(option=>option.project)).size!==4||scope.options.some(option=>!XERO_PROJECT_NAMES.includes(option.project)))throw Error('Invalid project scope');
 const projectOptions=new Map(scope.options.map(option=>[option.project,option.id]));
 const companies=new Map<string,AccountXeroCompany>();
 for(const company of snapshot.companies??[]){
  if(canonicalId(company.categoryId)!==scope.categoryId||projectOptions.get(company.project)!==canonicalId(company.optionId)||!company.contactId||!company.companyName.trim()||company.companyName.length>240)throw Error('Invalid company identity');
  const key=xeroSourceKey(company.contactId,company.categoryId,company.optionId);
  if(companies.has(key))throw Error('Duplicate company identity');companies.set(key,company);
 }
 const groupInvoices=new Map<string,AccountXeroInvoice[]>(),groups=new Map<string,AccountXeroGroup>();
 const ensure=(contactId:string,optionId:string,project:XeroProjectName)=>{
  contactId=canonicalId(contactId);optionId=canonicalId(optionId);
  const key=xeroSourceKey(contactId,scope.categoryId,optionId);let group=groups.get(key);
  if(!group){group={groupKey:key,contactId,categoryId:scope.categoryId,optionId,project,companyName:companies.get(key)?.companyName??null,status:'missing',mappedUnitKey:null,suggestedUnitKey:null,candidateUnitKeys:[],expectedVersion:'0',appliedVersion:null,effectiveMonth:null,invoiceCount:0,mappedInvoiceCount:0,invoiceChoices:[]};groups.set(key,group);}return group;
 };
 for(const company of companies.values())ensure(company.contactId,company.optionId,company.project);
 const invoiceIds=new Set<string>();let pending=false;const unassigned:AccountXeroInvoice[]=[];
 for(const invoice of snapshot.report.rows){
  if(!invoice.invoiceId||invoiceIds.has(canonicalId(invoice.invoiceId)))throw Error('Duplicate invoice ID');invoiceIds.add(canonicalId(invoice.invoiceId));
  if(invoice.state==='pending'){pending=true;continue;}if(invoice.state!=='eligible')continue;
  if(monthOf(invoice.date)!==month)throw Error('Wrong invoice month');
  const optionId=invoice.project&&projectOptions.get(invoice.project);
  if(!optionId)throw Error('Out-of-scope invoice');
  if(!invoice.contactId){unassigned.push(invoice);continue;}
  const group=ensure(invoice.contactId,optionId,invoice.project!);group.invoiceCount++;
  const list=groupInvoices.get(group.groupKey)??[];list.push(invoice);groupInvoices.set(group.groupKey,list);
 }
 const versionsByKey=new Map<string,AccountXeroMappingVersion[]>();
 for(const mapping of mappings){
  if(mapping.invoiceId!==undefined&&mapping.invoiceId!==null&&(!mapping.invoiceId||typeof mapping.invoiceId!=='string'))throw Error('Invalid invoice override');
  if(!mapping.contactId||canonicalId(mapping.categoryId)!==scope.categoryId||!scope.options.some(option=>option.id===canonicalId(mapping.optionId))||!validMonth(mapping.effectiveMonth)||!/^\d{1,18}$/.test(mapping.version)||BigInt(mapping.version)<BigInt(1))throw Error('Invalid mapping version');
  const key=xeroSourceKey(mapping.contactId,mapping.categoryId,mapping.optionId),versions=versionsByKey.get(key)??[];
  if(versions.some(version=>version.version===mapping.version))throw Error('Duplicate mapping version');versions.push(mapping);versionsByKey.set(key,versions);
  const option=scope.options.find(option=>option.id===canonicalId(mapping.optionId))!;ensure(mapping.contactId,mapping.optionId,option.project);
 }
 const assigned=new Map<string,AccountXeroInvoice[]>();
 const appliedFor=(versions:AccountXeroMappingVersion[],invoiceId:string|null)=>versions.filter(version=>version.effectiveMonth<=month&&(version.invoiceId?canonicalId(version.invoiceId):null)===invoiceId).sort((a,b)=>b.effectiveMonth.localeCompare(a.effectiveMonth)||(BigInt(a.version)>BigInt(b.version)?-1:1))[0];
 for(const group of groups.values()){
  const versions=versionsByKey.get(group.groupKey)??[];
  const latest=[...versions].sort((a,b)=>BigInt(a.version)>BigInt(b.version)?-1:1)[0];group.expectedVersion=latest?.version??'0';
  if(group.companyName){const name=normalized(group.companyName);group.candidateUnitKeys=targets.filter(target=>Boolean(name)&&(target.billingEntity?[target.billingEntity]:[target.entity,target.name,target.storeName]).some(value=>Boolean(value)&&normalized(value)===name)).map(target=>target.unitKey);}
  const inspected=(groupInvoices.get(group.groupKey)??[]).some(invoice=>invoice.storeNames!==undefined);
  if(inspected)group.candidateUnitKeys=[...new Set((groupInvoices.get(group.groupKey)??[]).flatMap(invoice=>accountXeroStoreEvidence(invoice,targets).candidateUnitKeys))];
  if(group.candidateUnitKeys.length===1){group.status='candidate';group.suggestedUnitKey=group.candidateUnitKeys[0];}else if(group.candidateUnitKeys.length>1)group.status='ambiguous';
  const groupDefault=appliedFor(versions,null);
  // Shared or unrecognized multi-invoice companies require evidence for each invoice.
  const requiresInvoices=group.candidateUnitKeys.length>1||group.invoiceCount>1&&group.candidateUnitKeys.length!==1;
  const allowedDefault=requiresInvoices?undefined:groupDefault;
  group.appliedVersion=allowedDefault?.version??null;group.effectiveMonth=allowedDefault?.effectiveMonth??null;
  const invoices=groupInvoices.get(group.groupKey)??[];
  for(const invoice of invoices){
   const applied=appliedFor(versions,canonicalId(invoice.invoiceId))??allowedDefault;
   const evidence=accountXeroStoreEvidence(invoice,targets);
   const savedUnitKey=applied&&targetByKey.has(applied.unitKey)?applied.unitKey:null;
   if(savedUnitKey&&applied?.invoiceId&&evidence.state==='ambiguous'&&evidence.storeNames.length===1&&evidence.candidateUnitKeys.includes(savedUnitKey)){evidence.state='matched';evidence.suggestedUnitKey=savedUnitKey;evidence.reason='Saved invoice mapping confirms STORE NAME country ambiguity.';}
   const disagreement=Boolean(savedUnitKey&&evidence.state==='matched'&&evidence.suggestedUnitKey!==savedUnitKey);
   if(disagreement){evidence.state='conflict';evidence.reason='Saved mapping conflicts with invoice STORE NAME.';evidence.suggestedUnitKey=null;}
   const unitKey=savedUnitKey&&evidence.state==='matched'?savedUnitKey:null;
   const choice:AccountXeroInvoiceChoice={invoiceId:invoice.invoiceId,invoiceNumber:invoice.invoiceNumber,currency:invoice.currency,invoiced:invoice.gross!,received:invoice.amountPaid!,outstanding:invoice.amountDue!,tax:invoice.tax!,credits:invoice.amountCredited??'0',date:invoice.date??null,dueDate:invoice.dueDate??null,xeroUrl:`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoice.invoiceId)}`,mappedUnitKey:unitKey,appliedVersion:applied?.version??null,effectiveMonth:applied?.effectiveMonth??null,status:unitKey?'mapped':applied?'conflict':'missing',storeEvidence:evidence,suggestedUnitKey:evidence.suggestedUnitKey};
   group.invoiceChoices.push(choice);
   if(unitKey){const list=assigned.get(unitKey)??[];list.push(invoice);assigned.set(unitKey,list);group.mappedInvoiceCount++;}else unassigned.push(invoice);
  }
  const mappedKeys=[...new Set(group.invoiceChoices.flatMap(choice=>choice.mappedUnitKey?[choice.mappedUnitKey]:[]))];
  if(invoices.length&&group.mappedInvoiceCount===invoices.length){group.status=mappedKeys.length===1?'mapped':'split';group.mappedUnitKey=mappedKeys.length===1?mappedKeys[0]:null;}
  else if(group.mappedInvoiceCount){group.status='partial';}
  else if(group.invoiceChoices.some(choice=>choice.status==='conflict'))group.status='conflict';
  else if(!invoices.length&&allowedDefault){if(targetByKey.has(allowedDefault.unitKey)){group.status='mapped';group.mappedUnitKey=allowedDefault.unitKey;}else group.status='conflict';}
 }
 for(const target of targets){
  const related=[...groups.values()].filter(group=>group.mappedUnitKey===target.unitKey||group.invoiceChoices.some(choice=>choice.mappedUnitKey===target.unitKey||choice.appliedVersion&&versionsByKey.get(group.groupKey)?.some(version=>version.version===choice.appliedVersion&&version.unitKey===target.unitKey))||(group.mappedInvoiceCount<group.invoiceCount||['candidate','ambiguous','missing'].includes(group.status))&&group.candidateUnitKeys.includes(target.unitKey));
  const invoices=assigned.get(target.unitKey)??[];const mapped=invoices.length>0||related.some(group=>group.status==='mapped'&&group.mappedUnitKey===target.unitKey);const incomplete=related.some(group=>group.mappedInvoiceCount<group.invoiceCount);
  byUnit[target.unitKey]={status:related.some(group=>group.status==='conflict')?'conflict':pending||mapped&&incomplete?'pending':mapped?'mapped':related.length?'unmapped':'not_synced',invoiceMonth:month,lastSyncedAt,byCurrency:totals(invoices),invoices:invoices.map(invoice=>({...invoice,xeroUrl:`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoice.invoiceId)}`}))};
 }
 return {groups:[...groups.values()].sort((a,b)=>(a.companyName??a.contactId).localeCompare(b.companyName??b.contactId)||a.project.localeCompare(b.project)),targets,byUnit,unmappedInvoiceCount:unassigned.length,unmappedTotals:totals(unassigned),needsIdentitySync:snapshot.companies===undefined||snapshot.report.rows.some(invoice=>invoice.state==='eligible'&&invoice.storeNames===undefined)};
}
