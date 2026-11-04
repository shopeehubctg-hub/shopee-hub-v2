import {readNormalMonthlyRule,pricingMode,snapshotPeriod,type NormalMonthlyRule,type PricingPeriod} from './pricing-periods';
import {priceMarket} from "./markets";
import {calculatorSnapshots} from './package-history';
import type {PricingEvidence} from './pricing-evidence';
import type {CalculatorSnapshot} from './calculator-types';

export type RepriceType='non_campaign'|'campaign'|'normal_early'|'normal_late';
export type RepriceTarget={id:string;storeId:string;name:string;packageSku:string;version:number;status:string;pendingVersion?:number|null;sheetSyncStatus?:string;calculatorSettings?:Record<string,unknown>|null;priceSchedules?:{market:string;priceType:string;originalPrice:number;sellingPrice:number;effectiveFrom:string;effectiveTo:string|null}[]};
export type RepriceRow={id:string;name:string;targetId?:string;scenarios:CalculatorSnapshot[]};
export const scenarioName=(type:RepriceType)=>type==='campaign'?'Campaign Day':'Non-Campaign Day';
export function eligibleRepriceTarget(target:RepriceTarget){return ['active','scheduled'].includes(target.status)&&!target.pendingVersion&&target.sheetSyncStatus==='synced'&&target.priceSchedules?.some(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY');}
export function repricedState<T extends {currency?:string;market:string;priceType:string;originalPrice:number;sellingPrice:number}>(prices:T[],settings:Record<string,unknown>|null,types:RepriceType[],amounts:{normal:number;campaign:number;normalLate?:number;pricingMode?:unknown}){
 const rule=readNormalMonthlyRule(settings),mode=pricingMode(settings?._pricingMode);
 if(pricingMode(amounts.pricingMode)!==mode)throw Error('Pricing modes do not match. Recalculate with this package’s saved pricing mode.');
 if(mode==='uniform'&&amounts.pricingMode!=='uniform')throw Error('Choose Same Price All Month in Calculator for this package.');
 if(amounts.pricingMode==='split_normal'&&!rule||rule&&amounts.pricingMode!=='split_normal')throw Error('Pricing modes do not match. Select a package with the same pricing mode, or change it in Edit / Modify first.');
 if(!types.length||types.length>3||new Set(types).size!==types.length||types.some(t=>!(rule?['normal_early','normal_late','campaign']:['non_campaign','campaign']).includes(t)))throw Error('Choose Normal Day, Campaign Day, or both.');
 const value=(type:string)=>Math.round((type==='campaign'?amounts.campaign:type==='normal_late'?amounts.normalLate??NaN:amounts.normal)*100);
 const normalRule:NormalMonthlyRule|null=rule?structuredClone(rule):null;
 if(normalRule){for(const type of types.filter(t=>t!=='campaign')){const pair=normalRule.prices.MY;if(!pair)throw Error('MY monthly Normal prices are missing.');const part=type==='normal_late'?'late':'early';if(!Number.isSafeInteger(value(type))||value(type)<=0||value(type)>Math.round(pair[part].originalPrice*100))throw Error('Normal price exceeds Original Price. Adjust Original Price in Edit / Modify first.');pair[part].sellingPrice=value(type)/100;}}
 const actualTypes:RepriceType[]=types.map(t=>t==='normal_early'?'non_campaign':t).filter(t=>t!=='normal_late');
 for(const type of actualTypes){
  const matches=prices.filter(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&p.priceType===type);
  if(!matches.length)throw Error(`${type==='campaign'?'Campaign':'Normal'} Day has no saved period. Set it in Edit / Modify first.`);
  if(!Number.isSafeInteger(value(type))||value(type)<=0)throw Error('Enter a valid Calculator price.');
  if(matches.some(p=>value(type)>p.originalPrice))throw Error(`${type==='campaign'?'Campaign':'Normal'} Day price exceeds Original Price. Adjust Original Price in Edit / Modify first.`);
 }
 const next=prices.map(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&actualTypes.includes(p.priceType as RepriceType)?{...p,sellingPrice:value(p.priceType)}:{...p});
 const recurring=settings?._recurringCampaign ? structuredClone(settings._recurringCampaign) as {events:{prices:Record<string,{originalPrice:number;sellingPrice:number}>}[]} : null;
 if(recurring&&types.includes('campaign'))for(const event of recurring.events){const price=event.prices.MY;if(price){if(amounts.campaign>price.originalPrice)throw Error('Campaign price exceeds a saved event Original Price. Adjust it in Edit / Modify first.');price.sellingPrice=amounts.campaign;}}
 const same=Boolean(settings?._samePricing)&&[...new Set(next.map(p=>p.market))].every(m=>new Set(next.filter(p=>p.market===m).map(p=>p.sellingPrice)).size<=1);
 if(mode==='uniform'&&new Set(next.filter(p=>p.market==='MY').map(p=>p.sellingPrice)).size!==1)throw Error('Update both Normal and Campaign to retain Same Price All Month.');
 return {prices:next,recurring,normalRule,samePricing:same};
}
export function replacementEvidence(previous:Record<string,unknown>|null,scenarios:CalculatorSnapshot[],types:RepriceType[],reference:{id:string;createdAt:string;actor:string;normal:number;campaign:number;normalLate?:number;pricingMode?:unknown},prices:{market:string;priceType:string;sellingPrice:number;originalPrice:number}[],actor:string):PricingEvidence{
 const old=previous?._pricingEvidence as PricingEvidence|undefined;
 if(previous?._pricingMode==='uniform'){return {source:'Calculator',exportId:reference.id,scenarios,periodReferences:Object.fromEntries(scenarios.map(s=>[snapshotPeriod(s),{exportId:reference.id,recordedBy:reference.actor,recordedAt:reference.createdAt}])),originalPrices:{MY:{normal:reference.normal,campaign:reference.campaign}},finalPrices:prices.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),adjustmentReason:'',recordedBy:actor,recordedAt:new Date().toISOString()};}
 if(readNormalMonthlyRule(previous)){
  const periodFor=(t:RepriceType):PricingPeriod=>t==='campaign'?'campaign':t==='normal_late'?'normal_16_end':'normal_1_15';
  const rule=readNormalMonthlyRule(previous)!;
  const merged=calculatorSnapshots(previous),refs={...old?.periodReferences},originals={normal:rule.prices.MY!.early.sellingPrice,campaign:(prices.find(p=>p.market==='MY'&&p.priceType==='campaign')?.sellingPrice??0)/100,normalLate:rule.prices.MY!.late.sellingPrice,...old?.originalPrices?.MY} as {normal:number;campaign:number;normalLate?:number};
  for(const period of ['normal_1_15','campaign','normal_16_end'] as const)refs[period]??={recordedBy:old?.recordedBy??'Not recorded',recordedAt:old?.recordedAt??'',source:'Manual / Not Recorded'};
  for(const type of types){const period=periodFor(type),snapshot=scenarios.find(s=>snapshotPeriod(s)===period);if(!snapshot)throw Error('A pricing period is missing Calculator settings.');const index=merged.findIndex(s=>snapshotPeriod(s)===period);if(index>=0)merged[index]=snapshot;else merged.push(snapshot);refs[period]={exportId:reference.id,recordedBy:reference.actor,recordedAt:reference.createdAt};originals[type==='campaign'?'campaign':type==='normal_late'?'normalLate':'normal']=snapshot.suggestedShopeePrice;}
  return {source:'Calculator',scenarios:merged,periodReferences:refs,originalPrices:{MY:originals},finalPrices:[...prices.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),...Object.entries(rule.prices).map(([market,p])=>({market,priceType:'non_campaign',pricingPeriod:'normal_16_end',originalPrice:p!.late.originalPrice,sellingPrice:market==='MY'&&types.includes('normal_late')?reference.normalLate:p!.late.sellingPrice,effectiveFrom:'monthly',effectiveTo:null}))],adjustmentReason:old?.adjustmentReason??'',recordedBy:actor,recordedAt:new Date().toISOString()};
 }

 const originals={...old?.originalPrices?.MY} as {normal:number;campaign:number};
 const refs={...old?.scenarioReferences};
 const merged=calculatorSnapshots(previous);
 for(const type of types){const name=scenarioName(type),snapshot=scenarios.find(s=>s.serviceScenario===name);if(!snapshot)throw Error('Calculator settings are incomplete. Recalculate this package.');const index=merged.findIndex(s=>s.serviceScenario===name);if(index<0)merged.push(snapshot);else merged[index]=snapshot;originals[type==='campaign'?'campaign':'normal']=type==='campaign'?reference.campaign:reference.normal;refs[type as 'non_campaign'|'campaign']={exportId:reference.id,recordedBy:reference.actor,recordedAt:reference.createdAt};}
 for(const type of ['non_campaign','campaign'] as const){const key=type==='campaign'?'campaign':'normal';if(!types.includes(type)&&!refs[type])refs[type]={...(old?.exportId?{exportId:old.exportId}:{}),recordedBy:old?.recordedBy??'Not recorded',recordedAt:old?.recordedAt??'',source:merged.some(s=>s.serviceScenario===scenarioName(type))?'Calculator':'Manual / Not Recorded'};if(originals[key]===undefined)originals[key]=merged.find(s=>s.serviceScenario===scenarioName(type))?.suggestedShopeePrice??(prices.find(p=>priceMarket(p.market,'currency' in p?p.currency:undefined)==='MY'&&p.priceType===type)?.sellingPrice??0)/100;}
 return {source:'Calculator',exportId:reference.id,exportedAt:reference.createdAt,exportedBy:reference.actor,scenarios:merged,scenarioReferences:refs,originalPrices:{MY:originals},finalPrices:prices.map(p=>({...p,sellingPrice:p.sellingPrice/100,originalPrice:p.originalPrice/100})),adjustmentReason:types.length===1?(old?.adjustmentReason??''):'',recordedBy:actor,recordedAt:new Date().toISOString()};
}
