import {priceMarket} from "./markets";
import {calculatorSnapshots} from './package-history';
import type {PricingEvidence} from './pricing-evidence';
import type {CalculatorSnapshot} from './calculator-types';

export type RepriceType='non_campaign'|'campaign';
export type RepriceTarget={id:string;storeId:string;name:string;packageSku:string;version:number;status:string;pendingVersion?:number|null;sheetSyncStatus?:string;calculatorSettings?:Record<string,unknown>|null;priceSchedules?:{market:string;priceType:string;originalPrice:number;sellingPrice:number;effectiveFrom:string;effectiveTo:string|null}[]};
export type RepriceRow={id:string;name:string;targetId?:string;scenarios:CalculatorSnapshot[]};
export const scenarioName=(type:RepriceType)=>type==='campaign'?'Campaign Day':'Non-Campaign Day';
export function eligibleRepriceTarget(target:RepriceTarget){return ['active','scheduled'].includes(target.status)&&!target.pendingVersion&&target.sheetSyncStatus==='synced'&&target.priceSchedules?.some(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY');}
export function repricedState<T extends {currency?:string;market:string;priceType:string;originalPrice:number;sellingPrice:number}>(prices:T[],settings:Record<string,unknown>|null,types:RepriceType[],amounts:{normal:number;campaign:number}){
 if(!types.length||types.length>2||new Set(types).size!==types.length||types.some(t=>!['non_campaign','campaign'].includes(t)))throw Error('Choose Normal Day, Campaign Day, or both.');
 const value=(type:string)=>Math.round((type==='campaign'?amounts.campaign:amounts.normal)*100);
 for(const type of types){
  const matches=prices.filter(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&p.priceType===type);
  if(!matches.length)throw Error(`${type==='campaign'?'Campaign':'Normal'} Day has no saved period. Set it in Edit / Modify first.`);
  if(!Number.isSafeInteger(value(type))||value(type)<=0)throw Error('Enter a valid Calculator price.');
  if(matches.some(p=>value(type)>p.originalPrice))throw Error(`${type==='campaign'?'Campaign':'Normal'} Day price exceeds Original Price. Adjust Original Price in Edit / Modify first.`);
 }
 const next=prices.map(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&types.includes(p.priceType as RepriceType)?{...p,sellingPrice:value(p.priceType)}:{...p});
 const recurring=settings?._recurringCampaign ? structuredClone(settings._recurringCampaign) as {events:{prices:Record<string,{originalPrice:number;sellingPrice:number}>}[]} : null;
 if(recurring&&types.includes('campaign'))for(const event of recurring.events){const price=event.prices.MY;if(price){if(amounts.campaign>price.originalPrice)throw Error('Campaign price exceeds a saved event Original Price. Adjust it in Edit / Modify first.');price.sellingPrice=amounts.campaign;}}
 const same=Boolean(settings?._samePricing)&&[...new Set(next.map(p=>p.market))].every(m=>new Set(next.filter(p=>p.market===m).map(p=>p.sellingPrice)).size<=1);
 return {prices:next,recurring,samePricing:same};
}
export function replacementEvidence(previous:Record<string,unknown>|null,scenarios:CalculatorSnapshot[],types:RepriceType[],reference:{id:string;createdAt:string;actor:string;normal:number;campaign:number},prices:{market:string;priceType:string;sellingPrice:number;originalPrice:number}[],actor:string):PricingEvidence{
 const old=previous?._pricingEvidence as PricingEvidence|undefined;
 const originals={...old?.originalPrices?.MY} as {normal:number;campaign:number};
 const refs={...old?.scenarioReferences};
 const merged=calculatorSnapshots(previous);
 for(const type of types){const name=scenarioName(type),snapshot=scenarios.find(s=>s.serviceScenario===name);if(!snapshot)throw Error('Calculator settings are incomplete. Recalculate this package.');const index=merged.findIndex(s=>s.serviceScenario===name);if(index<0)merged.push(snapshot);else merged[index]=snapshot;originals[type==='campaign'?'campaign':'normal']=type==='campaign'?reference.campaign:reference.normal;refs[type]={exportId:reference.id,recordedBy:reference.actor,recordedAt:reference.createdAt};}
 for(const type of ['non_campaign','campaign'] as const){const key=type==='campaign'?'campaign':'normal';if(!types.includes(type)&&!refs[type])refs[type]={...(old?.exportId?{exportId:old.exportId}:{}),recordedBy:old?.recordedBy??'Not recorded',recordedAt:old?.recordedAt??'',source:merged.some(s=>s.serviceScenario===scenarioName(type))?'Calculator':'Manual / Not Recorded'};if(originals[key]===undefined)originals[key]=merged.find(s=>s.serviceScenario===scenarioName(type))?.suggestedShopeePrice??(prices.find(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&p.priceType===type)?.sellingPrice??0)/100;}
 return {source:'Calculator',exportId:reference.id,exportedAt:reference.createdAt,exportedBy:reference.actor,scenarios:merged,scenarioReferences:refs,originalPrices:{MY:originals},finalPrices:prices.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),adjustmentReason:types.length===1?(old?.adjustmentReason??''):'',recordedBy:actor,recordedAt:new Date().toISOString()};
}
