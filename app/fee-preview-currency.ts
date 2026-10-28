import type {AccountCurrency,AccountStoreRow} from './account-contract';
import {cents,decimal,previousMonth} from './account-ledger';
import {calculateFee,type FeeCalculation,type FeePlan} from './fee-plan-model';
import sourceData from './account-rate-mapping-preview.json';
export type FxPolicy='fixed'|'bnm-service-average'|'pending';
export type SourceRateMapping={rosterKey:string;project:string;currency:AccountCurrency;market?:'MY'|'SG'|'TH'|'PH';clientType:string;planId:string;effectiveMonth:string;fxPolicy?:FxPolicy;fxRate?:string};
export type PreviewRateSource={records:SourceRateMapping[];fxRates?:Array<{serviceMonth:string;rate:string;policy:'bnm-service-average';verified:boolean;reference:string}>};
const source=sourceData as PreviewRateSource;
export function sourceProjectRate(row:AccountStoreRow,month:string,data:PreviewRateSource=source){
 if(row.previewRateDefaultsEligible!==true)return undefined;
 const matches=data.records.filter(record=>record.rosterKey===row.rosterKey&&record.project===row.project&&record.currency===row.currency&&(!row.market||record.market===row.market)&&record.effectiveMonth<=month&&(row.currency==='MYR'||record.market==='SG'));
 return matches.length===1?matches[0]:undefined;
}
export function projectSalesCurrency(row:AccountStoreRow):AccountCurrency{return row.salesCurrency??row.currency;}
function bnmStore(row:AccountStoreRow){return row.previewMarketFxEligible===true&&((row.market==='TH'&&projectSalesCurrency(row)==='THB')||(row.market==='PH'&&projectSalesCurrency(row)==='PHP'));}
export function projectFeeCurrency(row:AccountStoreRow,month:string,data:PreviewRateSource=source):AccountCurrency{return bnmStore(row)||row.currency==='SGD'&&sourceProjectRate(row,month,data)?.market==='SG'?'MYR':row.currency;}
/** Convert cents using an exact decimal rate; round half up once to MYR cents. */
export function convertCurrencyToMyr(amount:string,rate:string){
 if(!/^\d{1,4}(?:\.\d{1,8})?$/.test(rate))throw Error('A verified positive source-currency to MYR rate is required.');
 const [whole,fraction='']=rate.split('.');const scale=BigInt(100000000);const units=BigInt(whole)*scale+BigInt(fraction.padEnd(8,'0'));
 if(units===BigInt(0))throw Error('A verified positive source-currency to MYR rate is required.');
 return decimal((cents(amount)*units+scale/BigInt(2))/scale);
}
/** Backward compatible SGD conversion helper. */
export const convertSgdToMyr=convertCurrencyToMyr;
export type ProjectFeePreview={inputCurrency:AccountCurrency;outputCurrency:AccountCurrency;serviceMonth:string;fxPolicy?:FxPolicy;fxRate?:string;fxReference?:string;fxCurrency?:AccountCurrency;quotationUnit?:1;convertedAmount?:string;status:'ready'|'pending_fx'|'pending_amount';calculation?:FeeCalculation};
export function calculateProjectPreview(row:AccountStoreRow,month:string,plan:FeePlan,amount:string,data:PreviewRateSource=source):ProjectFeePreview{
 const outputCurrency=projectFeeCurrency(row,month,data);const base={inputCurrency:projectSalesCurrency(row),outputCurrency,serviceMonth:previousMonth(month)};
 if(plan.currency!==outputCurrency)throw Error('Choose a rate card matching the billing currency.');
 if(plan.rule.type==='fixed')return {...base,status:'ready',calculation:calculateFee(plan.rule,'')};
 if(amount!=='')cents(amount);
 if(base.inputCurrency===outputCurrency){return amount!==''?{...base,status:'ready',calculation:calculateFee(plan.rule,amount)}:{...base,status:'pending_amount'};}
 const mapping=sourceProjectRate(row,month,data);const fxPolicy=bnmStore(row)?'bnm-service-average':mapping?.fxPolicy??'pending';let fxRate:string|undefined;let fxReference:string|undefined;
 if(fxPolicy==='fixed')fxRate=mapping?.fxRate;
 if(fxPolicy==='bnm-service-average'){
  const provided=row.previewServiceFxRate;
  const providedMatches=provided?.policy==='bnm-service-average'&&provided.serviceMonth===base.serviceMonth&&provided.verified===true&&Boolean(provided.reference)&&(bnmStore(row)?provided.currency===base.inputCurrency&&provided.quotationUnit===1:(!provided.currency||provided.currency===base.inputCurrency)&&(!provided.quotationUnit||provided.quotationUnit===1));
  const verified=providedMatches?[provided]:bnmStore(row)?[]:(data.fxRates??[]).filter(rate=>rate.policy==='bnm-service-average'&&rate.serviceMonth===base.serviceMonth&&rate.verified===true&&Boolean(rate.reference));
  if(verified.length===1){fxRate=verified[0].rate;fxReference=verified[0].reference;}
 }
 const fx={...base,fxPolicy,fxRate,fxReference,...(fxRate?{fxCurrency:base.inputCurrency,quotationUnit:1 as const}:{})};
 if(!fxRate)return {...fx,status:'pending_fx'};
 // Validate the FX rate even when the manual amount has not been entered.
 const convertedAmount=convertCurrencyToMyr(amount||'0',fxRate);
 if(amount==='')return {...fx,status:'pending_amount'};
 return {...fx,convertedAmount,status:'ready',calculation:calculateFee(plan.rule,convertedAmount)};
}
