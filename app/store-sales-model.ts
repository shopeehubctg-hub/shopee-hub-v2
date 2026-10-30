export type StoreSale={report_date:string;marketplace:string;currency:string;gross_revenue:string|number;canceled_orders:number;canceled_sales:string|number;synced_at:string};
const cents=(v:unknown)=>{const s=String(v);if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw Error('Invalid amount');const amount=Math.round(Number(s)*100);if(!Number.isSafeInteger(amount))throw Error('Invalid amount');return amount;};
export function summarizeStoreSales(rows:StoreSale[],month:string){
 const seen=new Set<string>();let gross=0,canceled=0,orders=0;
 const days=[...rows].sort((a,b)=>a.report_date.localeCompare(b.report_date)).map(row=>{
  const date=new Date(row.report_date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.report_date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.report_date||!row.report_date.startsWith(month+'-')||seen.has(row.report_date)||row.currency!=='MYR'||row.marketplace!=='Shopee')throw Error('Review store data');
  seen.add(row.report_date);const sales=cents(row.gross_revenue),loss=cents(row.canceled_sales);
  if(!Number.isSafeInteger(row.canceled_orders)||row.canceled_orders<0||loss<0||!Number.isFinite(Date.parse(row.synced_at)))throw Error('Review store data');
  gross+=sales;canceled+=loss;orders+=row.canceled_orders;
  if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(canceled)||!Number.isSafeInteger(orders))throw Error('Invalid total');
  return {date:row.report_date,salesCents:sales,canceledCents:loss,canceledOrders:row.canceled_orders,mtdCents:gross};
 });
 const latest=days.at(-1)?.date??null,coveredDays=days.length,elapsedDays=latest?Number(latest.slice(-2)):0;
 return {days,latest,coveredDays,elapsedDays,complete:coveredDays>0&&coveredDays===elapsedDays,totals:{salesCents:gross,canceledCents:canceled,canceledOrders:orders},updated:rows.map(r=>r.synced_at).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null};
}
