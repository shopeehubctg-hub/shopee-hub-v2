import {pricingMode,pricingPeriods,snapshotPeriod,type PricingMode,type PricingPeriod,type PriceApplication} from './pricing-periods';
import {calculatorSnapshots} from './package-history';
import type {CalculatorSnapshot} from './calculator-types';
export type ExportSnapshot={id:string;requestId:string;name:string;normal:number;campaign:number;normalLate?:number;pricingMode?:PricingMode;pricingSchemaVersion?:2;scenarios:CalculatorSnapshot[];createdAt?:string};
export type PricingEvidence={recommendations?:CalculatorSnapshot[];priceSelection?:{normalSourcePeriod?:'normal_1_15'|'normal_16_end';uniformSourcePeriod?:'normal_1_15'|'campaign'|'normal_16_end'};priceApplication?:PriceApplication;source:'Calculator'|'Manual Excel Upload';exportId?:string;exportedAt?:string;exportedBy?:string;scenarios:CalculatorSnapshot[];scenarioReferences?:Partial<Record<'non_campaign'|'campaign',{exportId?:string;recordedBy:string;recordedAt:string;source?:string}>>;periodReferences?:Partial<Record<PricingPeriod,{exportId?:string;recordedBy:string;recordedAt:string;source?:string}>>;originalPrices?:{MY:{normal:number;campaign:number;normalLate?:number}};finalPrices:unknown;adjustmentReason:string;recordedBy:string;recordedAt:string};
export function exportSnapshots(value:unknown):CalculatorSnapshot[]{
 const input=(value as {scenarios?:unknown})?.scenarios;
 if(!Array.isArray(input)||input.length<2||input.length>3)throw Error('Complete every pricing period before exporting.');
 const modern=input.some(s=>s?.pricingSchemaVersion!=null||s?.pricingPeriod!=null||s?.pricingMode!=null);
 const mode=modern?pricingMode(input[0]?.pricingMode):'normal_campaign';
 if(modern&&input.some(s=>s?.pricingSchemaVersion!==2||s?.pricingMode!==mode||!pricingPeriods(mode).includes(s?.pricingPeriod)))throw Error('Calculator pricing periods are incomplete or inconsistent.');
 if(input.length!==pricingPeriods(mode).length||new Set(input.map(s=>modern?s.pricingPeriod:s.serviceScenario)).size!==input.length)throw Error('Each Calculator pricing period must occur exactly once.');
 if(input.some(s=>s?.calculationKind!=null)&&(!modern||mode!=='split_normal'||input.some(s=>s?.calculationKind!=='three_period_recommendations')))throw Error('Invalid three-period Calculator record.');
 const numeric=['commissionRate','transactionRate','serviceRate','serviceCap','preorderRate','platformSupportFee','shopeeVoucherRate','sellerVoucher','cofundVoucher','autoTopUpRate','sellerShipping','facebookShipping','extraProfit','facebookPrice','mainProductQuantity','suggestedShopeePrice','customerVoucherPrice','markupRate','markupAmount','systemSuggestedMarkupRate','systemSuggestedShopeePrice','targetPayout','actualPayout'] as const;
 const rates=new Set(['commissionRate','transactionRate','serviceRate','preorderRate','shopeeVoucherRate','autoTopUpRate']);
 const signed=new Set(['markupRate','markupAmount','systemSuggestedMarkupRate','targetPayout','actualPayout']);
 const s:CalculatorSnapshot[]=[];
 for(const item of input){
  if(!item||typeof item!=='object'||Array.isArray(item)||item.source!=='Shopee Pricing Calculator'||!['Non-Campaign Day','Campaign Day'].includes(item.serviceScenario))throw Error('Invalid Calculator scenario.');
  for(const key of ['packageName','category'])if(typeof item[key]!=='string'||!item[key].trim()||item[key].length>300)throw Error('Complete the Calculator package name and category.');
  for(const key of ['cashbackProgramme','preorderListing','markupCustomized'])if(typeof item[key]!=='boolean')throw Error('Calculator settings are incomplete. Export a fresh file.');
  for(const key of numeric){const n=item[key];if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e9||(!signed.has(key)&&n<0)||(rates.has(key)&&n>100))throw Error(`Invalid Calculator value: ${key}.`);}
  for(const key of ['facebookPricePerUnit','customerPricePerUnit','customCommission'])if(item[key]!==null&&(typeof item[key]!=='number'||!Number.isFinite(item[key])||item[key]<0||item[key]>1e9))throw Error(`Invalid Calculator value: ${key}.`);
  if(item.customCommission!==null&&item.customCommission>100||item.suggestedShopeePrice<=0||item.facebookPrice<=0||!['facebookPayout','sameCustomerPrice','cheaperCustomerPrice'].includes(item.pricingGoal)||!['rm','percent'].includes(item.discountUnit)||typeof item.discountValue!=='number'||!Number.isFinite(item.discountValue)||item.discountValue<0||item.discountValue>1e9)throw Error('Calculator pricing goal or amount is invalid.');
  if(modern&&((item.pricingPeriod==='campaign')!==(item.serviceScenario==='Campaign Day')))throw Error('Calculator period and fee scenario do not match.');
  const keys=[...(item.calculationKind?['calculationKind']:[]),...(modern?['pricingSchemaVersion','pricingMode','pricingPeriod']:[]),'source','packageName','category','cashbackProgramme','customCommission','serviceScenario','pricingGoal','discountUnit','discountValue','preorderListing','markupCustomized','facebookPricePerUnit','customerPricePerUnit',...numeric];
  s.push(Object.fromEntries(keys.map(key=>[key,item[key]])) as CalculatorSnapshot);
 }
 if(!modern&&new Set(s.map(v=>v.serviceScenario)).size!==2)throw Error('Complete both Normal and Campaign Calculator settings before exporting.');
 if(mode==='uniform'&&new Set(s.map(v=>Math.round(v.suggestedShopeePrice*100))).size!==1)throw Error('Same Price All Month must use one selling price.');
 return s;
}
export function adjustedPrices(prices:Partial<Record<string,{normal:string;campaign:string;normalLate?:string}>>,snapshot?:Pick<ExportSnapshot,'normal'|'campaign'|'normalLate'>,application?:PriceApplication){const chosen=application?({normal_1_15:snapshot?.normal,campaign:snapshot?.campaign,normal_16_end:snapshot?.normalLate}[application.sourcePeriod]):undefined;if(chosen!==undefined)snapshot={normal:chosen,campaign:chosen};const my=prices.MY;return !!snapshot&&!!my&&(Math.abs(Number(my.normal)-snapshot.normal)>0.005||Math.abs(Number(my.campaign||my.normal)-snapshot.campaign)>0.005||snapshot.normalLate!==undefined&&Math.abs(Number(my.normalLate)-snapshot.normalLate)>0.005);}

export function snapshotAmounts(scenarios:CalculatorSnapshot[]){const mode=pricingMode(scenarios[0]?.pricingMode);const at=(p:PricingPeriod)=>scenarios.find(s=>snapshotPeriod(s)===p)?.suggestedShopeePrice;return {normal:Number((at(mode!=='normal_campaign'?'normal_1_15':'normal_all')??0).toFixed(2)),campaign:Number((at('campaign')??0).toFixed(2)),...(mode==='split_normal'?{normalLate:Number((at('normal_16_end')??0).toFixed(2))}:{}),...(scenarios[0]?.pricingSchemaVersion===2?{pricingMode:mode,pricingSchemaVersion:2 as const}:{})};}
