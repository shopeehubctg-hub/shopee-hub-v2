import {readNormalMonthlyRule,type NormalMonthlyRule,type PricingMode} from '../../pricing-periods';
import {sql} from 'drizzle-orm';
import type {getDb} from '../../../db';
import {calculatorSnapshots} from '../../package-history';
import {exportSnapshots,snapshotAmounts,type ExportSnapshot,type PricingEvidence} from '../../pricing-evidence';
type DB=Pick<Awaited<ReturnType<typeof getDb>>,'execute'>;
export async function findExport(db:DB,tenantId:string,storeId:string,id:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid Calculator reference. Export a fresh file.');
 const row=Array.from(await db.execute(sql`select id,actor,created_at,payload from public.calculator_export_snapshots where id=${id}::uuid and tenant_id=${tenantId} and store_id=${storeId}`))[0] as {id:string;actor:string;created_at:string;payload:Omit<ExportSnapshot,'id'>}|undefined;
 if(!row)throw Error('The Calculator record is unavailable for this store. Upload it under the original store or export again.');
 return {...row.payload,id:row.id,createdAt:String(row.created_at),actor:row.actor};
}
export async function resolvePricingEvidence(db:DB,context:{tenantId:string;storeId:string;actor:string},input:{exportId?:string;batchUpload?:boolean;priceAdjustmentReason?:string;calculatorSettings?:Record<string,unknown>|null;pricingMode?:PricingMode;normalMonthlyRule?:NormalMonthlyRule|null},schedules:{market:string;priceType:string;sellingPrice:number;originalPrice:number;effectiveFrom:string;effectiveTo:string|null}[],previous?:Record<string,unknown>|null):Promise<PricingEvidence|null>{
 const old=previous?._pricingEvidence as PricingEvidence|undefined;
 if(old?.exportId&&input.exportId&&old.exportId!==input.exportId)throw Error('The original Calculator record cannot be replaced.');
 const exportId=input.exportId||old?.exportId;
 const saved=exportId?await findExport(db,context.tenantId,context.storeId,exportId):undefined;
 if(saved?.pricingMode&&input.pricingMode!==saved.pricingMode)throw Error('The pricing mode differs from the linked Calculator export. Recalculate with the selected mode first.');
 const scenarios=(old?.scenarioReferences||old?.periodReferences?old.scenarios:saved?.scenarios)??old?.scenarios??(input.batchUpload?[]:calculatorSnapshots(input.calculatorSettings??null));
 if(!input.batchUpload&&!saved&&!old&&!scenarios.length)return null;
 const direct=!old&&!saved&&!input.batchUpload?calculatorSnapshots(input.calculatorSettings??null):[];
 const directAmounts=direct.length>=2?snapshotAmounts(exportSnapshots({scenarios:direct})):undefined;
 if(directAmounts?.pricingMode&&input.pricingMode!==directAmounts.pricingMode)throw Error('The pricing mode differs from the Calculator. Recalculate with the selected mode first.');
 const original=old?.scenarioReferences||old?.periodReferences?old.originalPrices?.MY:saved?{normal:saved.normal,campaign:saved.campaign,normalLate:saved.normalLate}:old?.originalPrices?.MY??directAmounts;
 const late=input.normalMonthlyRule?.prices.MY?.late;
 const lateChanged=late&&original&&Math.abs(late.sellingPrice-(original.normalLate??original.normal))>0.005;
 const priorLate=readNormalMonthlyRule(previous)?.prices.MY?.late;
 const inheritedLate=!!old&&!!priorLate&&!!late&&priorLate.originalPrice===late.originalPrice&&priorLate.sellingPrice===late.sellingPrice;
 const adjusted=original&&schedules.some(p=>p.market==='MY'&&Math.abs(p.sellingPrice/100-(p.priceType==='campaign'?original.campaign:original.normal))>0.005);
 const reason=(input.priceAdjustmentReason??old?.adjustmentReason??'').trim();
 if(reason.length>1000)throw Error('Use up to 1,000 characters for the price change reason.');
 // A partial recalculation may inherit a legacy manual price without a recorded reason.
 // Preserve that discrepancy, but do not exempt a newly changed value or period ambiguity.
 const inherited=(p:typeof schedules[number])=>{
  if(!(old?.scenarioReferences||old?.periodReferences)||!Array.isArray(old.finalPrices))return false;
  const prior=old.finalPrices.filter((row:unknown):row is {market:string;priceType:string;sellingPrice:number;effectiveFrom:string;effectiveTo:string|null}=>!!row&&typeof row==='object'&&'market' in row&&row.market==='MY'&&'priceType' in row&&row.priceType===p.priceType&&(!('pricingPeriod' in row)||row.pricingPeriod!=='normal_16_end')&&(!('effectiveFrom' in row)||row.effectiveFrom!=='monthly')&&'sellingPrice' in row&&typeof row.sellingPrice==='number'&&Number.isFinite(row.sellingPrice));
  const exact=prior.filter(row=>row.effectiveFrom===p.effectiveFrom&&row.effectiveTo===p.effectiveTo);
  const candidates=exact.length?exact:prior;
  return candidates.length>0&&candidates.every(row=>Math.round(row.sellingPrice*100)===p.sellingPrice);
 };
 if(lateChanged&&!reason&&!inheritedLate)throw Error('Enter a reason for changing the late-month Calculator price.');
 if(adjusted&&!reason&&schedules.some(p=>p.market==='MY'&&Math.abs(p.sellingPrice/100-(p.priceType==='campaign'?original!.campaign:original!.normal))>0.005&&!inherited(p)))throw Error('Enter a reason for changing the Calculator price.');
 return {source:scenarios.length?'Calculator':'Manual Excel Upload',...(saved?{exportId:saved.id,exportedAt:saved.createdAt,exportedBy:saved.actor}:{}),scenarios,...(old?.scenarioReferences?{scenarioReferences:old.scenarioReferences}:{}),...(old?.periodReferences?{periodReferences:old.periodReferences}:{}),...(original?{originalPrices:{MY:original}}:{}),finalPrices:[...schedules.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),...(late?[{market:'MY',priceType:'non_campaign',pricingPeriod:'normal_16_end',sellingPrice:late.sellingPrice,originalPrice:late.originalPrice,effectiveFrom:'monthly',effectiveTo:null}]:[])],adjustmentReason:reason,recordedBy:context.actor,recordedAt:new Date().toISOString()};
}
