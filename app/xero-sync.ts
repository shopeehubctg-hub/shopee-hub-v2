import 'server-only';
import {extractXeroStoreNames} from './xero-store-name-evidence';
import {bootstrapXeroScope,buildXeroReport,type XeroInvoiceInput,type XeroProjectScope} from './xero-model';
import {xeroReadPage,type XeroTokens} from './xero-client';
import type {XeroConfig} from './xero-security';
function text(value:unknown,max=240):string{if(typeof value!=='string'||!value||value.length>max)throw Error('XERO_INVALID_SOURCE');return value;}
function money(value:unknown):string{if(typeof value!=='string'||!/^\d{1,24}(?:\.\d{1,2})?$/.test(value))throw Error('XERO_INVALID_SOURCE');return value;}
function optionalText(value:unknown,max=240){return value===undefined||value===null?undefined:text(value,max);}
type Category={TrackingCategoryID:string;Name:string;Options:Array<{TrackingOptionID:string;Name:string}>};
export function xeroCategories(raw:Record<string,unknown>[]):Category[]{return raw.map(category=>({TrackingCategoryID:text(category.TrackingCategoryID),Name:text(category.Name),Options:Array.isArray(category.Options)?category.Options.map(option=>({TrackingOptionID:text(option.TrackingOptionID),Name:text(option.Name)})):[]}));}
/** Current authoritative option names resolve to stable IDs; ambiguous/renamed names remain pending. */
export function normalizeXeroInvoices(raw:Record<string,unknown>[],payments:Record<string,unknown>[],categories:Category[],scope:XeroProjectScope,period?:{month:string;today:string}):XeroInvoiceInput[]{
 const category=categories.find(row=>row.TrackingCategoryID===scope.categoryId);if(!category)throw Error('XERO_INVALID_SCOPE');
 const paymentIds=new Set<string>();for(const payment of payments){const id=text(payment.PaymentID);if(paymentIds.has(id))throw Error('XERO_DUPLICATE_PAYMENT');paymentIds.add(id);}
 return raw.map(invoice=>{
  const id=text(invoice.InvoiceID);const lines=Array.isArray(invoice.LineItems)?invoice.LineItems:[];
  const result:XeroInvoiceInput={InvoiceID:id,InvoiceNumber:optionalText(invoice.InvoiceNumber),Type:text(invoice.Type),Status:text(invoice.Status),CurrencyCode:text(invoice.CurrencyCode),Date:optionalText(invoice.DateString??invoice.Date),DueDate:optionalText(invoice.DueDateString??invoice.DueDate),SubTotal:money(invoice.SubTotal),TotalTax:money(invoice.TotalTax),Total:money(invoice.Total),AmountPaid:money(invoice.AmountPaid),AmountDue:money(invoice.AmountDue),AmountCredited:money(invoice.AmountCredited??'0'),LineItems:lines.map(line=>({...((typeof line.Description==='string')?{Description:line.Description}:{}),Tracking:Array.isArray(line.Tracking)?line.Tracking.map((tracking:Record<string,unknown>)=>{
   const categoryId=optionalText(tracking.TrackingCategoryID);let optionId=optionalText(tracking.TrackingOptionID);
   if(categoryId===scope.categoryId){const matches=category.Options.filter(option=>option.Name===tracking.Option);if(!optionId&&matches.length===1)optionId=matches[0].TrackingOptionID;else if(optionId&&!category.Options.some(option=>option.TrackingOptionID===optionId&&option.Name===tracking.Option))optionId=undefined;}
   return {TrackingCategoryID:categoryId,TrackingOptionID:optionId};
  }):[]}))};
  const contact=invoice.Contact as Record<string,unknown>|undefined;if(contact?.ContactID)result.Contact={ContactID:text(contact.ContactID).toLowerCase(),...(optionalText(contact.Name)?{Name:optionalText(contact.Name)}:{})};
  const linked=payments.filter(payment=>(payment.Invoice as Record<string,unknown>|undefined)?.InvoiceID===id);
  const embedded=Array.isArray(invoice.Payments)?invoice.Payments:[];
  // A paid invoice with no independently verified payment rows is unknown, never a false cash zero.
  const missing=embedded.some(payment=>!linked.some(item=>item.PaymentID===payment.PaymentID));
  if(period){result.PaymentsComplete=false;result.PeriodPaymentsComplete={...period};}
  if(period||!missing&&(linked.length||result.AmountPaid==='0'||result.AmountPaid==='0.00'))result.Payments=linked.map(payment=>({PaymentID:text(payment.PaymentID),Amount:money(payment.Amount),Status:text(payment.Status),PaymentType:text(payment.PaymentType),Date:optionalText(payment.Date)}));
  return result;
 });
}
type QueryBudget={calls:number;ids:Set<string>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function day(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const legacy=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);
 const date=legacy?new Date(Number(legacy[1])):new Date(/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10)+'T00:00:00Z':'invalid');
 if(!Number.isFinite(date.getTime()))return null;const iso=date.toISOString().slice(0,10);
 return legacy||value.slice(0,10)===iso?iso:null;
}
function dateTime(value:string){const [year,month,date]=value.split('-').map(Number);return `DateTime(${year},${month},${date})`;}
function nextDay(value:string){return new Date(new Date(value+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);}
function monthRange(month:string){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('XERO_INVALID_SOURCE');const start=month+'-01';const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10);return {start,end};}
function rangeWhere(start:string,end:string){return `Date>=${dateTime(start)} AND Date<${dateTime(end)}`;}
/** Compare only financially/materially relevant fields, not contacts' personal metadata. */
function fingerprint(row:Record<string,unknown>,resource:'Invoices'|'Payments'){
 const value=resource==='Invoices'?{id:row.InvoiceID,type:row.Type,status:row.Status,currency:row.CurrencyCode,date:row.DateString??row.Date,due:row.DueDateString??row.DueDate,subtotal:row.SubTotal,tax:row.TotalTax,total:row.Total,paid:row.AmountPaid,dueAmount:row.AmountDue,credited:row.AmountCredited??'0',contactId:(row.Contact as Record<string,unknown>|undefined)?.ContactID,companyName:(row.Contact as Record<string,unknown>|undefined)?.Name,tracking:(Array.isArray(row.LineItems)?row.LineItems:[]).map(line=>line.Tracking??[]),storeNames:extractXeroStoreNames((Array.isArray(row.LineItems)?row.LineItems:[]).flatMap(line=>typeof line.Description==='string'?[line.Description]:[]))}:{id:row.PaymentID,invoice:(row.Invoice as Record<string,unknown>|undefined)?.InvoiceID,amount:row.Amount,status:row.Status,type:row.PaymentType,date:row.Date};
 function canonical(input:unknown):unknown{if(Array.isArray(input))return input.map(canonical);if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return input;}
 return JSON.stringify(canonical(value));
}
function mergeRows(target:Map<string,Record<string,unknown>>,rows:Record<string,unknown>[],resource:'Invoices'|'Payments'){
 const field=resource==='Invoices'?'InvoiceID':'PaymentID';
 for(const row of rows){const id=text(row[field]);const prior=target.get(id);if(prior&&fingerprint(prior,resource)!==fingerprint(row,resource))throw Error('XERO_UNION_CONFLICT');if(!prior)target.set(id,row);}
}
async function allPages(tokens:XeroTokens,org:string,resource:'Invoices'|'Payments',query:Record<string,string>,budget:QueryBudget,fetcher:typeof fetch){
 const all:Record<string,unknown>[]=[];const streamIds=new Set<string>();
 for(let page=1;;page++){
  if(budget.calls>=20)throw Error('XERO_SYNC_LIMIT');budget.calls++;
  const rows=await xeroReadPage(tokens,org,resource,{...query,page:String(page),pageSize:'100'},fetcher);
  if(rows.length>100)throw Error('XERO_INVALID_SOURCE');
  for(const row of rows){const id=text(row[resource==='Invoices'?'InvoiceID':'PaymentID']);if(streamIds.has(id))throw Error('XERO_PAGINATION_CHANGED');streamIds.add(id);budget.ids.add(id);if(budget.ids.size>2000)throw Error('XERO_SYNC_LIMIT');all.push(row);}
  if(rows.length<100)return all;
 }
}
type SyncPhase='tracking_read'|'scope_validation'|'invoice_read'|'payment_read'|'source_validation'|'report_validation';
async function inPhase<T>(phase:SyncPhase,operation:()=>Promise<T>|T):Promise<T>{try{return await operation();}catch(error){if(error instanceof Error)Object.defineProperty(error,'xeroPhase',{value:phase,configurable:true});throw error;}}
export async function collectXeroSnapshot(tokens:XeroTokens,config:XeroConfig,month:string,today:string,fetcher:typeof fetch=fetch){
 const range=monthRange(month);if(day(today)!==today)throw Error('XERO_INVALID_SOURCE');
 const categories=await inPhase('tracking_read',async()=>xeroCategories(await xeroReadPage(tokens,config.organisationId,'TrackingCategories',{},fetcher)));
 const scope=await inPhase('scope_validation',()=>bootstrapXeroScope(categories));
 const invoiceBudget:QueryBudget={calls:0,ids:new Set()},paymentBudget:QueryBudget={calls:0,ids:new Set()};
 const paymentRows=new Map<string,Record<string,unknown>>();const invoiceRows=new Map<string,Record<string,unknown>>();
 await inPhase('payment_read',async()=>{
  const windows=[range];if(!today.startsWith(month))windows.push({start:today,end:nextDay(today)});
  for(const window of windows){
   const rows=await allPages(tokens,config.organisationId,'Payments',{where:`PaymentType=="ACCRECPAYMENT" AND Status=="AUTHORISED" AND ${rangeWhere(window.start,window.end)}`},paymentBudget,fetcher);
   for(const row of rows){if(row.PaymentType!=='ACCRECPAYMENT'||row.Status!=='AUTHORISED')throw Error('XERO_INVALID_SOURCE');const date=day(row.Date);if(date&&(date<window.start||date>=window.end))throw Error('XERO_INVALID_SOURCE');}
   mergeRows(paymentRows,rows,'Payments');
  }
 });
 await inPhase('invoice_read',async()=>{
  const common={Statuses:'AUTHORISED,PAID',summaryOnly:'false'};
  for(const where of [`Type=="ACCREC" AND ${rangeWhere(range.start,range.end)}`,'Type=="ACCREC" AND AmountDue>0']){
   mergeRows(invoiceRows,await allPages(tokens,config.organisationId,'Invoices',{...common,where},invoiceBudget,fetcher),'Invoices');
  }
  const referenced=new Set<string>();for(const payment of paymentRows.values()){const id=(payment.Invoice as Record<string,unknown>|undefined)?.InvoiceID;if(typeof id!=='string'||!uuid.test(id))throw Error('XERO_INVALID_SOURCE');referenced.add(id);}
  const missing=[...referenced].filter(id=>!invoiceRows.has(id));
  for(let start=0;start<missing.length;start+=50){const requested=missing.slice(start,start+50);const rows=await allPages(tokens,config.organisationId,'Invoices',{...common,IDs:requested.join(',')},invoiceBudget,fetcher);if(rows.some(row=>!requested.includes(String(row.InvoiceID))))throw Error('XERO_INVALID_SOURCE');mergeRows(invoiceRows,rows,'Invoices');}
  if([...referenced].some(id=>!invoiceRows.has(id)))throw Error('XERO_MISSING_PAYMENT_INVOICE');
 });
 const approved=new Set(scope.options.map(option=>option.id));
 const invoices=await inPhase('source_validation',()=>normalizeXeroInvoices([...invoiceRows.values()],[...paymentRows.values()],categories,scope,{month,today}).filter(invoice=>invoice.LineItems.some(line=>(line.Tracking??[]).some(tracking=>tracking.TrackingCategoryID===scope.categoryId&&tracking.TrackingOptionID&&approved.has(tracking.TrackingOptionID)))));
 const baseReport=await inPhase('report_validation',()=>buildXeroReport(invoices,scope,month,today));
 const namesByInvoice=new Map(invoices.map(invoice=>[invoice.InvoiceID,extractXeroStoreNames(invoice.LineItems.flatMap(line=>typeof line.Description==='string'?[line.Description]:[]))]));
 const withStoreNames=<T extends {invoiceId:string;state:string}>(row:T)=>row.state==='eligible'?{...row,storeNames:namesByInvoice.get(row.invoiceId)??[]}:row;
 const report={...baseReport,rows:baseReport.rows.map(withStoreNames),invoices:baseReport.invoices.map(withStoreNames)};
 // Coverage is intermediate only. Retain no raw responses or unrelated department documents.
 const companies=new Map<string,{contactId:string;companyName:string;categoryId:string;optionId:string;project:string}>();
 for(const invoice of invoices){
  const row=report.rows.find(item=>item.invoiceId===invoice.InvoiceID&&item.state==='eligible');
  // Source company labels are matching evidence only; no contacts API or personal metadata is retained.
  if(!row||!row.project||!invoice.Contact?.ContactID||!invoice.Contact.Name)continue;
  const option=scope.options.find(item=>item.project===row.project);if(!option)continue;
  const identity={contactId:invoice.Contact.ContactID,companyName:invoice.Contact.Name,categoryId:scope.categoryId,optionId:option.id,project:option.project};
  const key=identity.contactId+':'+identity.optionId;const prior=companies.get(key);
  if(prior&&prior.companyName!==identity.companyName)throw Error('XERO_UNION_CONFLICT');companies.set(key,identity);
 }
 return {month,today,scope,report,companies:[...companies.values()]};
}
