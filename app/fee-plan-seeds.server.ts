import "server-only";
import type { AccountCurrency, AccountFeeRule } from "./account-contract";
import { PREVIEW_BASIS, type ClientType, type FeePlan } from "./fee-plan-model";

const percentRule=(currency:AccountCurrency,percent:string):AccountFeeRule=>({type:'percent',currency,basis:'custom',basisLabel:PREVIEW_BASIS,percent});
export function seedFeePlans(month='2026-10'):FeePlan[]{
 const make=(id:string,name:string,clientType:ClientType,rule:AccountFeeRule):FeePlan=>({id,name,clientType,currency:rule.currency,version:1,effectiveMonth:month,rule});
 return [
  ...['5','9.7','10','11'].map(rate=>make(`external-${rate}` ,`External ${rate}%`,'External',percentRule('MYR',rate))),
  make('berlanco-tier','Berlanco Tier','External',{type:'tiers',currency:'MYR',basis:'custom',basisLabel:PREVIEW_BASIS,tiers:[{from:'0',percent:'9'},{from:'150000',percent:'8'},{from:'300000',percent:'7'}]}),
  make('internal-new','Internal NEW','Internal',{type:'tiers',currency:'MYR',basis:'custom',basisLabel:'Shopee Sales',tiers:[{from:'0',percent:'4'},{from:'10000',percent:'3.5'},{from:'100000',percent:'3'},{from:'150000',percent:'2.5'},{from:'200000',percent:'2',cap:'4000'}]}),
  make('internal-3','Internal 3%','Internal',percentRule('MYR','3')),
  make('internal-fixed','Internal Fixed','Internal',{type:'fixed',currency:'MYR',basis:'fixed_monthly',fixedAmount:''}),
  make('internal-tier','Internal Tier','Internal',{type:'tiers',currency:'MYR',basis:'custom',basisLabel:PREVIEW_BASIS,tiers:[]}),
 ];
}
