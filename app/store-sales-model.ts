export type StoreSale={report_date:string;marketplace:string;currency:string;gross_revenue:string|number;canceled_orders:number;canceled_sales:string|number;synced_at:string};
export type AccessibleStoreSale=Pick<StoreSale,'report_date'|'marketplace'|'currency'|'gross_revenue'|'synced_at'>&{store_id:string};
const cents=(v:unknown)=>{
 const s=String(v);if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw Error('Invalid amount');
 const negative=s.startsWith('-'),[whole,fraction='']=(negative?s.slice(1):s).split('.');
 const value=(BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0')))*(negative?-BigInt(1):BigInt(1));
 if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Invalid amount');
 return Number(value);
};
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

export function summarizeAccessibleStoreSales(rows:AccessibleStoreSale[],month:string){
 const seen=new Set<string>(),byDate=new Map<string,{shopee:number;lazada:number;tiktok:number;syncedAt:string}>();
 for(const row of rows){
  const date=new Date(row.report_date+'T00:00:00Z'),platform=row.marketplace.toLowerCase();
  if(!row.store_id||!/^\d{4}-\d{2}-\d{2}$/.test(row.report_date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row.report_date||!row.report_date.startsWith(month+'-')||row.currency!=='MYR'||!['shopee','lazada','tiktok'].includes(platform)||!Number.isFinite(Date.parse(row.synced_at)))throw Error('Review store data');
  const key=`${row.store_id}|${row.report_date}|${platform}`;if(seen.has(key))throw Error('Review store data');seen.add(key);
  const current=byDate.get(row.report_date)??{shopee:0,lazada:0,tiktok:0,syncedAt:row.synced_at},value=cents(row.gross_revenue);
  current[platform as 'shopee'|'lazada'|'tiktok']+=value;
  if(!Number.isSafeInteger(current[platform as 'shopee'|'lazada'|'tiktok']))throw Error('Invalid total');
  if(Date.parse(row.synced_at)>Date.parse(current.syncedAt))current.syncedAt=row.synced_at;byDate.set(row.report_date,current);
 }
 let mtdShopee=0,mtdLazada=0,mtdTiktok=0;
 const summary=[...byDate.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([report_date,row])=>{
  mtdShopee+=row.shopee;mtdLazada+=row.lazada;mtdTiktok+=row.tiktok;
  const dayAll=row.shopee+row.lazada+row.tiktok,mtdAll=mtdShopee+mtdLazada+mtdTiktok;
  if(![dayAll,mtdAll,mtdShopee,mtdLazada,mtdTiktok].every(Number.isSafeInteger))throw Error('Invalid total');
  return {report_date,day_all:dayAll/100,day_shopee:row.shopee/100,day_lazada:row.lazada/100,day_tiktok:row.tiktok/100,mtd_all:mtdAll/100,mtd_shopee:mtdShopee/100,mtd_lazada:mtdLazada/100,mtd_tiktok:mtdTiktok/100,synced_at:row.syncedAt,target:null,days_remaining:null,estimated_monthly:null,sales_difference:null,daily_sales_target:null,target_progress_pct:null};
 });
 return {rows:summary,latestDate:summary.at(-1)?.report_date??null};
}
