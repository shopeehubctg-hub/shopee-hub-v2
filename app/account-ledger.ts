import type { AccountCurrency, AccountResponse, AccountStoreRow } from './account-contract';
export type Cycle = { id:string; statement_month:string; invoice_month:string; service_period_start:string|null; service_period_end:string|null; updated_at:string };
export type Term = { id:string; roster_key:string; roster_project:string; store_id:string|null; currency:AccountCurrency; confirmed:boolean; effective_from:string; effective_to:string|null; updated_at:string };
export type Assessment = { id:string; cycle_id:string; term_id:string; expected_net_fee:string|null; status:string; updated_at:string };
export type Invoice = { id:string; assessment_id:string; gross_amount:string; credit_amount:string; status:string; updated_at:string };
export type Receipt = { id:string; collection_date:string; currency:AccountCurrency; amount:string; kind:'receipt'|'refund'; status:string; updated_at:string };
export type Allocation = { invoice_id:string; receipt_id:string; amount:string; updated_at:string };
export type Ledger = { cycles:Cycle[]; terms:Term[]; assessments:Assessment[]; invoices:Invoice[]; receipts:Receipt[]; allocations:Allocation[]; storeNames:Map<string,string> };
export function cents(value:string):bigint {
  if(!/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid ledger amount');
  const [whole,fraction='']=value.split('.'); return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
}
export function decimal(value:bigint):string {
  const negative=value<BigInt(0); const absolute=negative?-value:value;
  return `${negative?'-':''}${absolute/BigInt(100)}.${String(absolute%BigInt(100)).padStart(2,'0')}`;
}
export function malaysiaDate(now=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function previousMonth(month:string) { const [year,m]=month.split('-').map(Number); return `${m===1?year-1:year}-${String(m===1?12:m-1).padStart(2,'0')}`; }
function moneySum(values:string[]) { return values.length?decimal(values.reduce((sum,value)=>sum+cents(value),BigInt(0))):null; }
export function emptyAccount(invoiceMonth:string,today:string,status:AccountResponse['status']='ready'):AccountResponse {
  return {invoiceMonth,statementMonth:previousMonth(invoiceMonth),today,timezone:'Asia/Kuala_Lumpur',status,updatedAt:null,
    summaries:(['MYR','SGD'] as const).map(currency=>({currency,expectedNetFee:null,billed:null,collected:null,outstanding:null,overpaid:null,todayCollected:null,monthCollected:null,pendingStores:0})),stores:[]};
}
export function buildAccount(ledger:Ledger,invoiceMonth:string,today:string):AccountResponse {
  const result=emptyAccount(invoiceMonth,today);
  const cycles=new Map(ledger.cycles.map(c=>[c.id,c])); const terms=new Map(ledger.terms.map(t=>[t.id,t]));
  const assessments=new Map(ledger.assessments.map(a=>[a.id,a]));
  const invoices=new Map(ledger.invoices.filter(i=>i.status==='issued').map(i=>[i.id,i]));
  const receipts=new Map(ledger.receipts.filter(r=>r.status==='verified').map(r=>[r.id,r]));
  const allocated=new Map<string,bigint>(); const receiptTotals=new Map<string,bigint>();
  for(const allocation of ledger.allocations) {
    const receipt=receipts.get(allocation.receipt_id); const invoice=invoices.get(allocation.invoice_id);
    if(!receipt) continue;
    const amount=cents(allocation.amount);
    receiptTotals.set(receipt.id,(receiptTotals.get(receipt.id)??BigInt(0))+amount);
    if(!invoice) continue;
    const assessment=assessments.get(invoice.assessment_id); const term=assessment&&terms.get(assessment.term_id);
    if(!term || term.currency!==receipt.currency) throw new Error('Receipt currency does not match invoice');
    if(receipt.collection_date>today) continue;
    allocated.set(invoice.id,(allocated.get(invoice.id)??BigInt(0))+(receipt.kind==='refund'?-amount:amount));
  }
  for(const [id,total] of receiptTotals) if(total>cents(receipts.get(id)!.amount)) throw new Error('Receipt is over-allocated');
  const relevantTerms=ledger.terms.filter(t=>t.effective_from<=`${invoiceMonth}-31`&&(!t.effective_to||t.effective_to>=`${invoiceMonth}-01`));
  const allUpdates=[...ledger.cycles,...ledger.terms,...ledger.assessments,...ledger.invoices,...ledger.receipts,...ledger.allocations].map(r=>r.updated_at).filter(Boolean).sort();
  result.updatedAt=allUpdates.at(-1)??null;
  const termOverpaid=new Map<string,bigint>();
  for(const term of relevantTerms) {
    const termAssessments=ledger.assessments.filter(a=>a.term_id===term.id&&cycles.get(a.cycle_id)?.invoice_month.startsWith(invoiceMonth));
    const assessment=termAssessments[0]; const cycle=assessment&&cycles.get(assessment.cycle_id);
    if(termAssessments.length>1) throw new Error('Multiple statement cycles require separate billing rows');
    const termInvoices=assessment?ledger.invoices.filter(i=>i.assessment_id===assessment.id&&i.status==='issued'):[];
    const verified=term.confirmed&&term.store_id&&assessment?.status==='verified';
    const balance=termInvoices.reduce((s,i)=>{const open=cents(i.gross_amount)-cents(i.credit_amount)-(allocated.get(i.id)??BigInt(0)); return s+(open>BigInt(0)?open:BigInt(0));},BigInt(0));
    termOverpaid.set(term.id,termInvoices.reduce((s,i)=>{const excess=(allocated.get(i.id)??BigInt(0))-cents(i.gross_amount)+cents(i.credit_amount);return s+(excess>BigInt(0)?excess:BigInt(0));},BigInt(0)));
    const collected=termInvoices.reduce((s,i)=>s+(allocated.get(i.id)??BigInt(0)),BigInt(0));
    const row:AccountStoreRow={id:term.id,rosterKey:term.roster_key,storeId:term.store_id,storeName:term.store_id?(ledger.storeNames.get(term.store_id)??term.roster_project):term.roster_project,
      project:term.roster_project,currency:term.currency,statementMonth:cycle?.statement_month.slice(0,7)??previousMonth(invoiceMonth),invoiceMonth,
      servicePeriodStart:cycle?.service_period_start??null,servicePeriodEnd:cycle?.service_period_end??null,
      status:!term.store_id?'pending_mapping':!term.confirmed?'pending_terms':termInvoices.length?'invoiced':verified?'assessed':'pending_statement',
      expectedNetFee:verified&&assessment.expected_net_fee!==null?decimal(cents(assessment.expected_net_fee)):null,
      billed:moneySum(termInvoices.map(i=>decimal(cents(i.gross_amount)-cents(i.credit_amount)))),
      collected:termInvoices.length?decimal(collected):null,outstanding:termInvoices.length?decimal(balance>BigInt(0)?balance:BigInt(0)):null};
    result.stores.push(row);
  }
  for(const summary of result.summaries) {
    const rows=result.stores.filter(s=>s.currency===summary.currency);
    summary.pendingStores=rows.filter(s=>s.expectedNetFee===null).length;
    summary.expectedNetFee=rows.length&&rows.every(s=>s.expectedNetFee!==null)?moneySum(rows.map(s=>s.expectedNetFee!)):null;
    summary.billed=moneySum(rows.flatMap(s=>s.billed===null?[]:[s.billed]));
    const billedRows=rows.filter(s=>s.billed!==null);
    summary.collected=billedRows.length?decimal(billedRows.reduce((s,r)=>s+signedCents(r.collected!),BigInt(0))):null;
    summary.outstanding=moneySum(billedRows.map(r=>r.outstanding!));
    summary.overpaid=billedRows.length?decimal(billedRows.reduce((s,r)=>s+(termOverpaid.get(r.id)??BigInt(0)),BigInt(0))):null;
    const cash=[...receipts.values()].filter(r=>r.currency===summary.currency&&r.collection_date<=today);
    const total=(items:Receipt[])=>items.length?decimal(items.reduce((s,r)=>s+(r.kind==='refund'?-cents(r.amount):cents(r.amount)),BigInt(0))):null;
    summary.todayCollected=total(cash.filter(r=>r.collection_date===today));
    summary.monthCollected=total(cash.filter(r=>r.collection_date.startsWith(today.slice(0,7))));
  }
  result.stores.sort((a,b)=>a.storeName.localeCompare(b.storeName)); return result;
}
function signedCents(value:string) { return value.startsWith('-')?-cents(value.slice(1)):cents(value); }
