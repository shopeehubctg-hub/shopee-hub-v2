import 'server-only';
import {bootstrapXeroScope,buildXeroReport,type XeroInvoiceInput,type XeroProjectScope} from './xero-model';
import {xeroReadPage,type XeroTokens} from './xero-client';
import type {XeroConfig} from './xero-security';
function text(value:unknown,max=240):string{if(typeof value!=='string'||!value||value.length>max)throw Error('XERO_INVALID_SOURCE');return value;}
function money(value:unknown):string{if(typeof value!=='string'||!/^\d{1,24}(?:\.\d{1,2})?$/.test(value))throw Error('XERO_INVALID_SOURCE');return value;}
function optionalText(value:unknown,max=240){return value===undefined||value===null?undefined:text(value,max);}
type Category={TrackingCategoryID:string;Name:string;Options:Array<{TrackingOptionID:string;Name:string}>};
export function xeroCategories(raw:Record<string,unknown>[]):Category[]{return raw.map(category=>({TrackingCategoryID:text(category.TrackingCategoryID),Name:text(category.Name),Options:Array.isArray(category.Options)?category.Options.map(option=>({TrackingOptionID:text(option.TrackingOptionID),Name:text(option.Name)})):[]}));}
/** Current authoritative option names resolve to stable IDs; ambiguous/renamed names remain pending. */
export function normalizeXeroInvoices(raw:Record<string,unknown>[],payments:Record<string,unknown>[],categories:Category[],scope:XeroProjectScope):XeroInvoiceInput[]{
 const category=categories.find(row=>row.TrackingCategoryID===scope.categoryId);if(!category)throw Error('XERO_INVALID_SCOPE');
 const paymentIds=new Set<string>();for(const payment of payments){const id=text(payment.PaymentID);if(paymentIds.has(id))throw Error('XERO_DUPLICATE_PAYMENT');paymentIds.add(id);}
 return raw.map(invoice=>{
  const id=text(invoice.InvoiceID);const lines=Array.isArray(invoice.LineItems)?invoice.LineItems:[];
  const result:XeroInvoiceInput={InvoiceID:id,InvoiceNumber:optionalText(invoice.InvoiceNumber),Type:text(invoice.Type),Status:text(invoice.Status),CurrencyCode:text(invoice.CurrencyCode),Date:optionalText(invoice.DateString??invoice.Date),DueDate:optionalText(invoice.DueDateString??invoice.DueDate),SubTotal:money(invoice.SubTotal),TotalTax:money(invoice.TotalTax),Total:money(invoice.Total),AmountPaid:money(invoice.AmountPaid),AmountDue:money(invoice.AmountDue),AmountCredited:money(invoice.AmountCredited??'0'),LineItems:lines.map(line=>({Tracking:Array.isArray(line.Tracking)?line.Tracking.map((tracking:Record<string,unknown>)=>{
   const categoryId=optionalText(tracking.TrackingCategoryID);let optionId=optionalText(tracking.TrackingOptionID);
   if(categoryId===scope.categoryId){const matches=category.Options.filter(option=>option.Name===tracking.Option);if(!optionId&&matches.length===1)optionId=matches[0].TrackingOptionID;else if(optionId&&!category.Options.some(option=>option.TrackingOptionID===optionId&&option.Name===tracking.Option))optionId=undefined;}
   return {TrackingCategoryID:categoryId,TrackingOptionID:optionId};
  }):[]}))};
  const contact=invoice.Contact as Record<string,unknown>|undefined;if(contact?.ContactID)result.Contact={ContactID:text(contact.ContactID)};
  const linked=payments.filter(payment=>(payment.Invoice as Record<string,unknown>|undefined)?.InvoiceID===id);
  const embedded=Array.isArray(invoice.Payments)?invoice.Payments:[];
  // A paid invoice with no independently verified payment rows is unknown, never a false cash zero.
  const missing=embedded.some(payment=>!linked.some(item=>item.PaymentID===payment.PaymentID));
  if(!missing&&(linked.length||result.AmountPaid==='0'||result.AmountPaid==='0.00'))result.Payments=linked.map(payment=>({PaymentID:text(payment.PaymentID),Amount:money(payment.Amount),Status:text(payment.Status),PaymentType:text(payment.PaymentType),Date:optionalText(payment.Date)}));
  return result;
 });
}
async function allPages(tokens:XeroTokens,org:string,resource:'Invoices'|'Payments',fetcher:typeof fetch){const all:Record<string,unknown>[]=[];const ids=new Set<string>();for(let page=1;page<=20;page++){const rows=await xeroReadPage(tokens,org,resource,{page:String(page),pageSize:'100',...(resource==='Invoices'?{where:'Type=="ACCREC"',Statuses:'AUTHORISED,PAID',summaryOnly:'false'}:{})},fetcher);for(const row of rows){const id=text(row[resource==='Invoices'?'InvoiceID':'PaymentID']);if(ids.has(id))throw Error('XERO_PAGINATION_CHANGED');ids.add(id);all.push(row);}if(rows.length<100)return all;}throw Error('XERO_SYNC_LIMIT');}
export async function collectXeroSnapshot(tokens:XeroTokens,config:XeroConfig,month:string,today:string,fetcher:typeof fetch=fetch){
 const categories=xeroCategories(await xeroReadPage(tokens,config.organisationId,'TrackingCategories',{},fetcher));const scope=bootstrapXeroScope(categories);
 const [rawInvoices,payments]=await Promise.all([allPages(tokens,config.organisationId,'Invoices',fetcher),allPages(tokens,config.organisationId,'Payments',fetcher)]);
 const approved=new Set(scope.options.map(option=>option.id));
 const invoices=normalizeXeroInvoices(rawInvoices,payments,categories,scope).filter(invoice=>invoice.LineItems.some(line=>(line.Tracking??[]).some(tracking=>tracking.TrackingCategoryID===scope.categoryId&&tracking.TrackingOptionID&&approved.has(tracking.TrackingOptionID))));
 const report=buildXeroReport(invoices,scope,month,today);
 // Never retain raw Xero responses or unrelated department documents.
 return {month,today,scope,report};
}
