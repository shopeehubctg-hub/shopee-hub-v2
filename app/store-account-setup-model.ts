import {MARKET_CONFIG,isMarket,type MarketCode} from './markets';
import type {AccountFeeRule} from './account-contract';
import {validateFeeRule} from './account-settings-model';
import {currentPlanVersions,planForMonth,type FeePlan} from './fee-plan-model';
export type StoreMarket=MarketCode;
export type AccountSetupDraft={legalEntity:string;effectiveMonth:string;clientType:''|'Internal'|'External';planId:string;planVersion:number|null;fxPolicy:''|'fixed'|'bnm-service-average';type:AccountFeeRule['type'];basis:AccountFeeRule['basis']|'';basisLabel:string;fixedAmount:string;percent:string;tiers:Array<{from:string;percent:string;cap?:string}>;minimum:string;cap:string};
export type AccountSetupPayload={version:2;legalEntity:string;effectiveMonth:string;clientType:'Internal'|'External';rateCard:{id:string;version:number}|null;feeRule:AccountFeeRule;inputCurrency:'MYR'|'SGD'|'THB'|'PHP';billingCurrency:'MYR';fxPolicy:'none'|'fixed'|'bnm-service-average';fxRate?:'3.2'};
export function malaysiaMonth(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit'}).formatToParts(new Date());return `${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}`;}
export function emptyAccountSetup():AccountSetupDraft{return {legalEntity:'',effectiveMonth:malaysiaMonth(),clientType:'',planId:'',planVersion:null,fxPolicy:'',type:'fixed',basis:'',basisLabel:'',fixedAmount:'',percent:'',tiers:[{from:'0',percent:''}],minimum:'',cap:''};}
export function accountPlanFields(rule:AccountFeeRule):Partial<AccountSetupDraft>{return {type:rule.type,basis:rule.basis,basisLabel:rule.basisLabel??'',fixedAmount:rule.fixedAmount??'',percent:rule.percent??'',tiers:rule.tiers?.map(tier=>({...tier}))??[{from:'0',percent:''}],minimum:rule.minimum??'',cap:rule.cap??''};}
export function availableAccountRateCards(plans:FeePlan[],draft:AccountSetupDraft){return currentPlanVersions(plans,draft.effectiveMonth).filter(plan=>!plan.archivedAt&&plan.currency==='MYR'&&plan.clientType===draft.clientType);}
export function selectAccountRateCard(draft:AccountSetupDraft,id:string,plans:FeePlan[]):AccountSetupDraft{
 const plan=availableAccountRateCards(plans,draft).find(card=>card.id===id);
 return plan?{...draft,...accountPlanFields(plan.rule),planId:plan.id,planVersion:plan.version}:{...draft,planId:'',planVersion:null};
}
/** Market/type changes discard incompatible rates and FX choices, preserving company and Invoice Month. */
export function resetAccountSetupSelection(draft:AccountSetupDraft,market:StoreMarket,clientType:AccountSetupDraft['clientType']=draft.clientType):AccountSetupDraft{return {...emptyAccountSetup(),legalEntity:draft.legalEntity,effectiveMonth:draft.effectiveMonth,clientType,fxPolicy:market==='TH'||market==='PH'?'bnm-service-average':market==='SG'&&clientType==='Internal'?'fixed':''};}
export function changeAccountSetupMonth(draft:AccountSetupDraft,month:string,plans:FeePlan[]):AccountSetupDraft{
 const next={...draft,effectiveMonth:month};return draft.planId&&draft.planId!=='custom'?selectAccountRateCard(next,draft.planId,plans):next;
}
export function feeRuleFromDraft(draft:AccountSetupDraft,market:StoreMarket):AccountFeeRule{
 if(!isMarket(market))throw Error('Choose a store market.');
 const rule:AccountFeeRule={type:draft.type,currency:'MYR',basis:draft.type==='fixed'?'fixed_monthly':draft.basis as AccountFeeRule['basis']};
 if(draft.type==='fixed')rule.fixedAmount=draft.fixedAmount.trim();else{if(draft.basis==='custom')rule.basisLabel=draft.basisLabel.trim();if(draft.type==='percent')rule.percent=draft.percent.trim();else rule.tiers=draft.tiers.map(tier=>({from:tier.from.trim(),percent:tier.percent.trim(),...(tier.cap?.trim()?{cap:tier.cap.trim()}:{})}));}
 if(draft.minimum.trim())rule.minimum=draft.minimum.trim();if(draft.cap.trim())rule.cap=draft.cap.trim();return rule;
}
export function accountSetupPayload(draft:AccountSetupDraft,market:StoreMarket,plans:FeePlan[],minimumMonth=malaysiaMonth()):AccountSetupPayload{
 if(!draft.legalEntity.trim()||draft.legalEntity.trim().length>240)throw Error('Enter the legal company / entity name.');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(draft.effectiveMonth)||draft.effectiveMonth<minimumMonth)throw Error('Choose the current or a future invoice month.');
 if(!['Internal','External'].includes(draft.clientType))throw Error('Choose a client type.');
 let feeRule:AccountFeeRule;let rateCard:AccountSetupPayload['rateCard']=null;
 if(draft.planId==='custom')feeRule=validateFeeRule(feeRuleFromDraft(draft,market),'MYR');else{
  const plan=planForMonth(plans,draft.planId,draft.effectiveMonth);
  if(!plan||plan.archivedAt||plan.currency!=='MYR'||plan.clientType!==draft.clientType)throw Error('Choose an available MYR rate card for this client type.');
  if(plan.version!==draft.planVersion)throw Error('This rate card changed. Select it again to review the latest version.');
  feeRule=validateFeeRule(plan.rule,'MYR');rateCard={id:plan.id,version:plan.version};
 }
 let fxPolicy:AccountSetupPayload['fxPolicy']='none';
 if(market==='TH'||market==='PH')fxPolicy='bnm-service-average';
 if(market==='SG'){fxPolicy=draft.clientType==='Internal'?'fixed':draft.fxPolicy||'none';if(!['fixed','bnm-service-average'].includes(fxPolicy))throw Error('Choose the SGD to MYR exchange rate policy.');}
 if(!isMarket(market))throw Error('Choose a store market.');
 return {version:2,legalEntity:draft.legalEntity.trim(),effectiveMonth:draft.effectiveMonth,clientType:draft.clientType as 'Internal'|'External',rateCard,feeRule,inputCurrency:MARKET_CONFIG[market].currency,billingCurrency:'MYR',fxPolicy,...(fxPolicy==='fixed'?{fxRate:'3.2'}:{})};
}
export function accountSetupError(draft:AccountSetupDraft,market:StoreMarket,plans:FeePlan[]=[]){try{accountSetupPayload(draft,market,plans);return '';}catch(error){return error instanceof Error?error.message:'Check Account setup.';}}
export function accountRateSummary(rule:AccountFeeRule){if(rule.type==='fixed')return `MYR ${rule.fixedAmount||'—'} / month`;if(rule.type==='percent')return `${rule.percent||'—'}% · ${rule.basisLabel||rule.basis.replaceAll('_',' ')}`;return `Whole-month tiers · ${rule.tiers?.map(tier=>`${tier.percent}%${tier.cap?` (cap MYR ${tier.cap})`:''}`).join(' / ')||'Set tier rates'}`;}
