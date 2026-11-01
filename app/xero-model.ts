/** Xero read model. Adapters must preserve money as decimal strings before JSON parsing loses precision. */
export const XERO_PROJECT_NAMES = ['Shopee Hub','Shopee Hub Internal','Tik Tok Hub','Lazada Hub'] as const;
export type XeroProjectName = typeof XERO_PROJECT_NAMES[number];
type Tracking = {TrackingCategoryID?:string;TrackingOptionID?:string;Name?:string;Option?:string};
export type XeroProjectScope = {categoryId:string;options:Array<{id:string;project:XeroProjectName}>};
export type XeroInvoiceInput = {
  InvoiceID:string;InvoiceNumber?:string;Type:string;Status:string;CurrencyCode:string;
  Contact?:{ContactID?:string;Name?:string};Date?:string;DueDate?:string;
  SubTotal:string;TotalTax:string;Total:string;AmountPaid:string;AmountDue:string;AmountCredited?:string;
  LineItems:Array<{LineItemID?:string;Description?:string;Tracking?:Tracking[]}>;
  Payments?:Array<{PaymentID:string;Amount:string;Status?:string;PaymentType?:string;Date?:string}>;
};
export function xeroMoney(value:string):bigint {
  if(typeof value!=='string'||!/^\d{1,24}(?:\.\d{1,2})?$/.test(value))throw Error('Invalid Xero money');
  const [whole,fraction='']=value.split('.');return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
}
export function xeroDecimal(value:bigint):string{return `${value/BigInt(100)}.${String(value%BigInt(100)).padStart(2,'0')}`;}
function normalized(value:string){return value.trim().replace(/\s+/g,' ').toLowerCase();}
/** Name matching is ONLY for an operator-reviewed initial ID binding, never ongoing invoice authorisation. */
export function bootstrapXeroScope(categories:Array<{TrackingCategoryID:string;Name:string;Options:Array<{TrackingOptionID:string;Name:string}>}>):XeroProjectScope {
  const matches=categories.filter(c=>normalized(c.Name)==='projects');
  if(matches.length!==1)throw Error('Projects category must resolve uniquely');
  const category=matches[0];
  const options=XERO_PROJECT_NAMES.map(project=>{
    const rows=category.Options.filter(o=>normalized(o.Name)===normalized(project));
    if(rows.length!==1)throw Error(`Project must resolve uniquely: ${project}`);
    return {id:rows[0].TrackingOptionID,project};
  });
  const scope={categoryId:category.TrackingCategoryID,options};validateScope(scope);return scope;
}
function validateScope(scope:XeroProjectScope){
  if(!scope.categoryId||scope.options.length!==4||scope.options.some(o=>!o.id||!XERO_PROJECT_NAMES.includes(o.project))||new Set(scope.options.map(o=>o.id)).size!==4||new Set(scope.options.map(o=>o.project)).size!==4)throw Error('Invalid project scope');
}
export function classifyXeroInvoice(invoice:XeroInvoiceInput,scope:XeroProjectScope){
  validateScope(scope);
  if(!invoice.InvoiceID)throw Error('InvoiceID required');
  const base={invoiceId:invoice.InvoiceID,invoiceNumber:invoice.InvoiceNumber??null,contactId:invoice.Contact?.ContactID??null,currency:invoice.CurrencyCode};
  if(invoice.Type!=='ACCREC'||!['AUTHORISED','PAID'].includes(invoice.Status))return {...base,state:'excluded' as const,reason:'not_posted_receivable',project:null};
  const allowed=new Map(scope.options.map(o=>[o.id,o.project]));
  const projects=new Set<XeroProjectName>();let outside=false,unknown=false;
  if(!invoice.LineItems.length)unknown=true;
  for(const line of invoice.LineItems){
    const tracking=(line.Tracking??[]).filter(t=>t.TrackingCategoryID===scope.categoryId);
    if(tracking.length!==1||!tracking[0].TrackingOptionID){unknown=true;continue;}
    const project=allowed.get(tracking[0].TrackingOptionID);
    if(project)projects.add(project);else outside=true;
  }
  if(!projects.size&&!unknown)return {...base,state:'excluded' as const,reason:'outside_projects',project:null};
  if(outside||unknown||projects.size!==1)return {...base,state:'pending' as const,reason:outside?'mixed_projects':unknown?'missing_tracking':'multiple_projects',project:null};
  if(!/^[A-Z]{3}$/.test(invoice.CurrencyCode))throw Error('Invalid currency');
  const subtotal=xeroMoney(invoice.SubTotal),tax=xeroMoney(invoice.TotalTax),gross=xeroMoney(invoice.Total),paid=xeroMoney(invoice.AmountPaid),due=xeroMoney(invoice.AmountDue),credited=xeroMoney(invoice.AmountCredited??'0');
  if(subtotal+tax!==gross||paid+due+credited!==gross)throw Error('Invoice amounts do not reconcile');
  const paymentIds=new Set<string>();let cash=BigInt(0);
  for(const payment of invoice.Payments??[]){
    if(!payment.PaymentID||paymentIds.has(payment.PaymentID))throw Error('Duplicate or missing PaymentID');
    paymentIds.add(payment.PaymentID);
    if(payment.Status==='DELETED')continue;
    // No credit/prepayment/overpayment allocations can masquerade as cash receipts.
    if(payment.PaymentType!=='ACCRECPAYMENT'||payment.Status!=='AUTHORISED')continue;
    cash+=xeroMoney(payment.Amount);
  }
  if(cash>paid)throw Error('Cash receipts exceed invoice AmountPaid');
  return {...base,state:'eligible' as const,reason:null,project:[...projects][0],subtotal:xeroDecimal(subtotal),tax:xeroDecimal(tax),gross:xeroDecimal(gross),amountPaid:xeroDecimal(paid),amountDue:xeroDecimal(due),amountCredited:xeroDecimal(credited),cashReceived:invoice.Payments===undefined?null:xeroDecimal(cash),date:invoice.Date??null,dueDate:invoice.DueDate??null};
}
export function summarizeXeroInvoices(invoices:XeroInvoiceInput[],scope:XeroProjectScope){
  const ids=new Set<string>();const rows=invoices.map(invoice=>{if(ids.has(invoice.InvoiceID))throw Error('Duplicate InvoiceID');ids.add(invoice.InvoiceID);return classifyXeroInvoice(invoice,scope);});
  const totals=new Map<string,{currency:string;gross:bigint;tax:bigint;amountPaid:bigint;amountDue:bigint;amountCredited:bigint;cashReceived:bigint|null}>();
  for(const row of rows){if(row.state!=='eligible')continue;const total=totals.get(row.currency)??{currency:row.currency,gross:BigInt(0),tax:BigInt(0),amountPaid:BigInt(0),amountDue:BigInt(0),amountCredited:BigInt(0),cashReceived:BigInt(0)};
    for(const key of ['gross','tax','amountPaid','amountDue','amountCredited'] as const)total[key]+=xeroMoney(row[key]);
    total.cashReceived=total.cashReceived===null||row.cashReceived===null?null:total.cashReceived+xeroMoney(row.cashReceived);totals.set(row.currency,total);
  }
  return {rows,totals:[...totals.values()].map(t=>({currency:t.currency,gross:xeroDecimal(t.gross),tax:xeroDecimal(t.tax),amountPaid:xeroDecimal(t.amountPaid),amountDue:xeroDecimal(t.amountDue),amountCredited:xeroDecimal(t.amountCredited),cashReceived:t.cashReceived===null?null:xeroDecimal(t.cashReceived)}))};
}

/** Invoice dates drive invoicing totals. Payment dates independently drive cash collection. */
export function buildXeroReport(invoices:XeroInvoiceInput[],scope:XeroProjectScope,month:string,today:string){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||!/^20\d{2}-\d{2}-\d{2}$/.test(today))throw Error('Invalid report date');
 const all=summarizeXeroInvoices(invoices,scope);
 const date=(value:string|undefined|null)=>{if(!value)return null;const legacy=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);if(legacy)return new Date(Number(legacy[1])).toISOString().slice(0,10);return /^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):null;};
 const selected=invoices.filter(i=>date(i.Date)?.startsWith(month));
 const report=summarizeXeroInvoices(selected,scope);
 const cash=new Map<string,{month:bigint;today:bigint;known:boolean}>();
 const ids=new Set<string>();
 const payments:Array<{paymentId:string;invoiceId:string;invoiceNumber:string|null;project:XeroProjectName;currency:string;amount:string;date:string}>=[];
 for(let index=0;index<invoices.length;index++){
  const input=invoices[index],row=all.rows[index];if(row.state!=='eligible')continue;
  const value=cash.get(row.currency)??{month:BigInt(0),today:BigInt(0),known:true};
  if(input.Payments===undefined)value.known=false;
  for(const p of input.Payments??[]){
   if(ids.has(p.PaymentID))throw Error('Duplicate PaymentID across invoices');ids.add(p.PaymentID);
   if(p.Status!=='AUTHORISED'||p.PaymentType!=='ACCRECPAYMENT')continue;
   const day=date(p.Date);if(!day){value.known=false;continue;}if(day>today)continue;
   if(day.startsWith(month)){value.month+=xeroMoney(p.Amount);payments.push({paymentId:p.PaymentID,invoiceId:row.invoiceId,invoiceNumber:row.invoiceNumber,project:row.project,currency:row.currency,amount:xeroDecimal(xeroMoney(p.Amount)),date:day});}if(day===today)value.today+=xeroMoney(p.Amount);
  }
  cash.set(row.currency,value);
 }
 return {...report,rows:report.rows.filter(r=>r.state!=='excluded'),month,today,payments,invoiceCount:report.rows.filter(r=>r.state==='eligible').length,pendingCount:report.rows.filter(r=>r.state==='pending').length,
  collections:[...cash].map(([currency,c])=>({currency,monthCollected:c.known?xeroDecimal(c.month):null,todayCollected:c.known?xeroDecimal(c.today):null})),
  outstanding:all.totals.map(t=>({currency:t.currency,amountDue:t.amountDue})),
  invoices:report.rows.filter(r=>r.state!=='excluded').map(r=>({...r,xeroUrl:`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(r.invoiceId)}`}))};
}
