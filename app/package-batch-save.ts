import {batchIssues,monthRange,sameBatchPrice,type BatchPackage,type BatchMarket} from './package-batch-model';
import {defaultRecurringEvent,recurringEventWindow,type RecurringCampaignRule} from './recurring-campaign';

export function batchCreatePayload(row:BatchPackage,storeId:string,storeName:string,clientRequestId:string){
 if(!storeId||!clientRequestId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientRequestId))throw Error('Missing store or stable save request ID.');
 const errors=batchIssues(row,[row]);if(errors.length)throw Error(errors.join(' '));
 const d=row.dates!,same=sameBatchPrice(row),markets=Object.keys(row.prices) as BatchMarket[];
 const normal=d.normal.mode==='months'?[...new Set(d.normal.months)].sort().map(m=>({...monthRange(m),promotionType:'monthly' as const})):[{from:d.normal.start,to:d.normal.mode==='long'?null:d.normal.end,promotionType:'custom' as const}];
 const campaign=same?normal:d.campaign.mode==='long'?[{from:d.campaign.start,to:null,promotionType:'custom' as const}]:Object.entries(d.campaign.months).sort(([a],[b])=>a.localeCompare(b)).flatMap(([m,events])=>events.map(e=>({...recurringEventWindow(m,defaultRecurringEvent(e)),promotionType:'custom' as const})));
 const priceSchedules=markets.flatMap(m=>{
  const p=row.prices[m]!;
  return [...normal.map(w=>({market:m,priceType:'non_campaign' as const,originalPrice:Number(p.original),sellingPrice:Number(p.normal),promotionType:w.promotionType,effectiveFrom:w.from,effectiveTo:w.to})),...campaign.map(w=>({market:m,priceType:'campaign' as const,originalPrice:Number(p.original),sellingPrice:Number(p.campaign||p.normal),promotionType:w.promotionType,effectiveFrom:w.from,effectiveTo:w.to}))];
 });
 const recurringCampaign:RecurringCampaignRule|null=!same&&d.campaign.mode==='long'?{schema:1,startDate:d.campaign.start,endDate:null,events:d.campaign.events.map(e=>({...defaultRecurringEvent(e),prices:Object.fromEntries(markets.map(m=>[m,{originalPrice:Number(row.prices[m]!.original),sellingPrice:Number(row.prices[m]!.campaign||row.prices[m]!.normal)}]))}))}:null;
 return {exportId:row.exportId,priceAdjustmentReason:row.priceAdjustmentReason,batchUpload:true,mode:'publish' as const,clientRequestId,storeId,storeName,name:row.name.trim(),markets,priceSchedules,samePricing:same,longTerm:d.normal.mode==='long',campaignLongTerm:campaign.every(w=>w.to===null),recurringCampaign,
  platforms:Object.entries(row.skus).filter(([,sku])=>sku.trim()).map(([platform,sku])=>({platform:platform==='TikTok'?'TikTok Shop':platform,packageSku:sku.trim()})),
  components:row.items.filter(i=>i.sku||i.quantity).map(i=>({inventorySku:i.sku.trim(),name:i.name?.trim()||i.sku.trim(),quantity:Number(i.quantity),kind:'product'})),changeNote:'Created from Batch Upload'};
}
export type BatchSaveResult={kind:'created'|'draft'|'failed'|'rejected'|'ready';message:string;packageId?:string};
export type BatchSaveJournal={storeId:string;storeName:string;rows:BatchPackage[];requests:Record<string,string>;results:Record<string,BatchSaveResult>;active:boolean};
export async function submitBatch(journal:BatchSaveJournal,persist:(journal:BatchSaveJournal)=>void,send:typeof fetch=fetch){
 let next=structuredClone(journal);
 for(const row of next.rows){
  if(next.results[row.id]&&!['failed','ready'].includes(next.results[row.id].kind))continue;
  try{
   const response=await send('/api/packages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batchCreatePayload(row,next.storeId,next.storeName,next.requests[row.id])),signal:AbortSignal.timeout(65000)});
   const data=await response.json();
   next.results[row.id]=data.packageId&&(data.ok||data.savedAsDraft)?{kind:data.savedAsDraft?'draft':'created',packageId:data.packageId,message:data.savedAsDraft?(data.error||'Saved as draft. Retry publishing from the package card.'):'Created successfully'}:response.status===409&&data.code==='BATCH_SKU_CONFLICT'&&!data.packageId?{kind:'rejected',message:data.error||'SKU already exists. Edit this package before submitting again.'}:{kind:'failed',message:data.error||`Could not confirm creation (${response.status}). Retry with the same request.`};
  }catch(error){next.results[row.id]={kind:'failed',message:error instanceof Error?error.message:'Could not confirm creation. Retry safely.'};}
  persist(structuredClone(next));
 }
 return next;
}
