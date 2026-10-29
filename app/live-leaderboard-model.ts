export function weekBounds(now=new Date(),offset=-1){
 const local=new Date(now.getTime()+8*3600000);
 const monday=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()));
 monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7)+offset*7);
 const end=new Date(monday);end.setUTCDate(end.getUTCDate()+6);
 return {start:monday.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
export function validWeek(start:string){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(start))return false;
 const d=new Date(start+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===start&&d.getUTCDay()===1&&start<=weekBounds(new Date(),0).start;
}
export function publicLeaderboard(row:Record<string,unknown>){
 const observed=row.observed_shops,missing=row.missing_shops;
 if(row.currency!=='MYR'||!['partial','complete'].includes(String(row.status))||!Array.isArray(observed)||!Array.isArray(missing)||observed.length+missing.length!==8||((row.status==='complete')!== (missing.length===0)))throw Error('Invalid snapshot');
 const seen=new Set<string>();let total=0;
 const username=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||seen.has(v))throw Error('Invalid shop');seen.add(v);return v;};
 const shops=observed.map((shop)=>{
  const name=username(shop?.shop_username),cents=shop?.sales_cents;
  if(!Number.isSafeInteger(cents)||cents<0)throw Error('Invalid sales');total+=cents;
  return {name,salesCents:cents};
 }).sort((a,b)=>b.salesCents-a.salesCents||a.name.localeCompare(b.name));
 const pending=missing.map(shop=>({name:username(shop?.shop_username)}));
 if(!Number.isSafeInteger(total)||String(total)!==String(row.observed_sales_cents))throw Error('Invalid total');
 let rank=0;const ranked=shops.map((shop,index)=>{if(index===0||shop.salesCents!==shops[index-1].salesCents)rank=index+1;return {...shop,rank};});
 const updated=typeof row.synced_at==='string'&&Number.isFinite(Date.parse(row.synced_at))?row.synced_at:null;
 return {status:row.status,currency:'MYR',shops:ranked,pending,totalCents:total,updated};
}
