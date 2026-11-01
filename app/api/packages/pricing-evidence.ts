import {sql} from 'drizzle-orm';
import type {getDb} from '../../../db';
import {calculatorSnapshots} from '../../package-history';
import type {ExportSnapshot,PricingEvidence} from '../../pricing-evidence';
type DB=Pick<Awaited<ReturnType<typeof getDb>>,'execute'>;
export async function findExport(db:DB,tenantId:string,storeId:string,id:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid Calculator reference. Export a fresh file.');
 const row=Array.from(await db.execute(sql`select id,actor,created_at,payload from public.calculator_export_snapshots where id=${id}::uuid and tenant_id=${tenantId} and store_id=${storeId}`))[0] as {id:string;actor:string;created_at:string;payload:Omit<ExportSnapshot,'id'>}|undefined;
 if(!row)throw Error('The Calculator record is unavailable for this store. Upload it under the original store or export again.');
 return {...row.payload,id:row.id,createdAt:String(row.created_at),actor:row.actor};
}
export async function resolvePricingEvidence(db:DB,context:{tenantId:string;storeId:string;actor:string},input:{exportId?:string;batchUpload?:boolean;priceAdjustmentReason?:string;calculatorSettings?:Record<string,unknown>|null},schedules:{market:string;priceType:string;sellingPrice:number;originalPrice:number;effectiveFrom:string;effectiveTo:string|null}[],previous?:Record<string,unknown>|null):Promise<PricingEvidence|null>{
 const old=previous?._pricingEvidence as PricingEvidence|undefined;
 if(old?.exportId&&input.exportId&&old.exportId!==input.exportId)throw Error('The original Calculator record cannot be replaced.');
 const exportId=input.exportId||old?.exportId;
 const saved=exportId?await findExport(db,context.tenantId,context.storeId,exportId):undefined;
 const scenarios=saved?.scenarios??old?.scenarios??(input.batchUpload?[]:calculatorSnapshots(input.calculatorSettings??null));
 if(!input.batchUpload&&!saved&&!old&&!scenarios.length)return null;
 const original=saved?{normal:saved.normal,campaign:saved.campaign}:old?.originalPrices?.MY;
 const adjusted=original&&schedules.some(p=>p.market==='MY'&&Math.abs(p.sellingPrice/100-(p.priceType==='campaign'?original.campaign:original.normal))>0.005);
 const reason=(input.priceAdjustmentReason??old?.adjustmentReason??'').trim();
 if(reason.length>1000)throw Error('Use up to 1,000 characters for the price change reason.');
 if(adjusted&&!reason)throw Error('Enter a reason for changing the Calculator price.');
 return {source:scenarios.length?'Calculator':'Manual Excel Upload',...(saved?{exportId:saved.id,exportedAt:saved.createdAt,exportedBy:saved.actor}:{}),scenarios,...(original?{originalPrices:{MY:original}}:{}),finalPrices:schedules.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),adjustmentReason:reason,recordedBy:context.actor,recordedAt:new Date().toISOString()};
}
