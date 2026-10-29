import type { AccountCurrency, AccountFeeRule } from './account-contract';
import { validateFeeRule } from './account-settings-model';
import { cents, decimal } from './account-ledger';
export type ClientType = 'Internal' | 'External';
export type FeePlan = {id:string;name:string;clientType:ClientType;currency:AccountCurrency;version:number;effectiveMonth:string;rule:AccountFeeRule;archivedAt?:string};
export type FeePlanDraft = Omit<FeePlan,'version'|'archivedAt'>;
export type FeeCalculation = {fee:string;rateLabel:string;tierLabel:string;basisLabel:string};
export const PREVIEW_BASIS='Billing amount (preview)';
export function validatePlan(draft:FeePlanDraft):FeePlanDraft{
 if(!draft.id||!draft.name.trim()||draft.name.trim().length>120)throw Error('Enter a plan name (up to 120 characters).');
 if(!['Internal','External'].includes(draft.clientType)||!['MYR','SGD'].includes(draft.currency))throw Error('Choose client type and currency.');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(draft.effectiveMonth))throw Error('Choose an effective invoice month.');
 return {...draft,name:draft.name.trim(),rule:validateFeeRule(draft.rule,draft.currency)};
}
export function planForMonth(plans:FeePlan[],id:string,month:string):FeePlan|undefined{
 return plans.filter(p=>p.id===id&&p.effectiveMonth<=month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)||a.version-b.version).at(-1);
}
export function currentPlanVersions(plans:FeePlan[],month:string):FeePlan[]{
 return [...new Set(plans.map(p=>p.id))].flatMap(id=>{const p=planForMonth(plans,id,month);return p?[p]:[];});
}
export function feeBasisLabel(rule:AccountFeeRule):string{
 return rule.basis==='fixed_monthly'?'Fixed monthly fee':rule.basis==='custom'?rule.basisLabel||'Other amount':({net_gmv:'Net GMV',merchandise_subtotal:'Merchandise subtotal',statement_amount:'Statement amount'}[rule.basis]);
}
/** Whole-month bracket: select one rate then apply it to the ENTIRE amount. Round once, half up to cents. */
export function calculateFee(rawRule:AccountFeeRule,amount:string):FeeCalculation{
 const rule=validateFeeRule(rawRule,rawRule.currency);
 if(rule.type==='fixed'){let fee=cents(rule.fixedAmount!);if(rule.minimum&&fee<cents(rule.minimum))fee=cents(rule.minimum);if(rule.cap&&fee>cents(rule.cap))fee=cents(rule.cap);return {fee:decimal(fee),rateLabel:'Fixed',tierLabel:'Fixed monthly fee',basisLabel:feeBasisLabel(rule)};}
 const value=cents(amount);let rate=rule.percent!;let tierLabel='Flat percentage';let tierCap:string|undefined;
 if(rule.type==='tiers'){
  const tiers=rule.tiers!;let index=0;
  for(let i=0;i<tiers.length;i++)if(value>=cents(tiers[i].from))index=i;
  rate=tiers[index].percent;tierCap=tiers[index].cap;
  tierLabel=tiers[index+1]?`${tiers[index].from} to < ${tiers[index+1].from}`:`${tiers[index].from} and above`;
 }
 const [whole,fraction='']=rate.split('.');const rateUnits=BigInt(whole)*BigInt(1000000)+BigInt(fraction.padEnd(6,'0'));
 let fee=(value*rateUnits+BigInt(50000000))/BigInt(100000000);
 if(rule.minimum&&fee<cents(rule.minimum))fee=cents(rule.minimum);
 if(rule.cap&&fee>cents(rule.cap))fee=cents(rule.cap);
 if(tierCap!==undefined){if(fee>cents(tierCap))fee=cents(tierCap);tierLabel+=` · cap ${rule.currency} ${tierCap}`;}
 return {fee:decimal(fee),rateLabel:`${rate}%`,tierLabel,basisLabel:feeBasisLabel(rule)};
}

/** Session archive keeps every version available to existing assignments and locked history. */
export function archiveRateCard(plans:FeePlan[],id:string,archivedAt:string):FeePlan[]{
 if(!plans.some(plan=>plan.id===id))throw Error('This rate card is no longer available.');
 if(!Number.isFinite(Date.parse(archivedAt)))throw Error('Invalid rate card deletion time.');
 if(plans.some(plan=>plan.id===id&&plan.archivedAt))return plans;
 return plans.map(plan=>plan.id===id?{...plan,archivedAt}:plan);
}
