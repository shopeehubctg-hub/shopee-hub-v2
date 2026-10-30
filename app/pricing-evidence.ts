import {calculatorSnapshots} from './package-history';
import type {CalculatorSnapshot} from './calculator-types';
export type ExportSnapshot={id:string;requestId:string;name:string;normal:number;campaign:number;scenarios:CalculatorSnapshot[];createdAt?:string};
export type PricingEvidence={source:'Calculator'|'Manual Excel Upload';exportId?:string;exportedAt?:string;exportedBy?:string;scenarios:CalculatorSnapshot[];originalPrices?:{MY:{normal:number;campaign:number}};finalPrices:unknown;adjustmentReason:string;recordedBy:string;recordedAt:string};
export function exportSnapshots(value:unknown):CalculatorSnapshot[]{
 const input=(value as {scenarios?:unknown})?.scenarios;
 if(!Array.isArray(input)||input.length!==2)throw Error('Complete both Normal and Campaign Calculator settings before exporting.');
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
  const keys=['source','packageName','category','cashbackProgramme','customCommission','serviceScenario','pricingGoal','discountUnit','discountValue','preorderListing','markupCustomized','facebookPricePerUnit','customerPricePerUnit',...numeric];
  s.push(Object.fromEntries(keys.map(key=>[key,item[key]])) as CalculatorSnapshot);
 }
 if(new Set(s.map(v=>v.serviceScenario)).size!==2)throw Error('Complete both Normal and Campaign Calculator settings before exporting.');
 return s;
}
export function adjustedPrices(prices:Partial<Record<string,{normal:string;campaign:string}>>,snapshot?:Pick<ExportSnapshot,'normal'|'campaign'>){const my=prices.MY;return !!snapshot&&!!my&&(Math.abs(Number(my.normal)-snapshot.normal)>0.005||Math.abs(Number(my.campaign||my.normal)-snapshot.campaign)>0.005);}
