import { cents, previousMonth } from './account-ledger';
import type { AccountFeeRule, AccountResponse } from './account-contract';
export type AccountSetting = {id:string;roster_key:string;roster_project:string;legal_entity:string;currency:'MYR'|'SGD';change_action:'mapping'|'fee_rule';version:string;effective_month:string;store_id:string|null;fee_rule:AccountFeeRule|null;created_at:string};
const money=/^\d{1,16}(?:\.\d{1,2})?$/;
export function validateFeeRule(value:unknown,currency:'MYR'|'SGD'):AccountFeeRule {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Choose a monthly fee rule');
  const r=value as Record<string,unknown>;
  if(r.currency!==currency) throw new Error(`Fee currency must be ${currency}`);
  if(!['fixed','percent','tiers'].includes(String(r.type))) throw new Error('Choose fixed, percentage or tiered fee');
  if(!['fixed_monthly','merchandise_subtotal','net_gmv','statement_amount','custom'].includes(String(r.basis))) throw new Error('Choose the fee calculation basis');
  const rule:AccountFeeRule={type:r.type as AccountFeeRule['type'],currency,basis:r.basis as AccountFeeRule['basis']};
  if(r.basis==='custom') { if(typeof r.basisLabel!=='string'||!r.basisLabel.trim()||r.basisLabel.length>120) throw new Error('Describe the custom fee basis'); rule.basisLabel=r.basisLabel.trim(); }
  const decimal=(v:unknown,label:string)=>{if(typeof v!=='string'||!money.test(v))throw new Error(`${label} must be an exact amount with up to 2 decimals`);return `${cents(v)/BigInt(100)}.${String(cents(v)%BigInt(100)).padStart(2,'0')}`;};
  const percentage=(v:unknown)=>{if(typeof v!=='string'||!/^\d{1,3}(?:\.\d{1,6})?$/.test(v)||Number(v)>100) throw new Error('Percentage must be between 0 and 100');return v;};
  if(r.type==='fixed') {if(r.basis!=='fixed_monthly')throw new Error('Fixed fee requires a monthly fixed basis');rule.fixedAmount=decimal(r.fixedAmount,'Monthly fee');}
  else {if(r.basis==='fixed_monthly')throw new Error('Percentage fees require a statement basis');if(r.type==='percent')rule.percent=percentage(r.percent);else{
    if(!Array.isArray(r.tiers)||!r.tiers.length||r.tiers.length>20)throw new Error('Add between 1 and 20 fee tiers');
    let previous=BigInt(-1);
    rule.tiers=r.tiers.map((entry,index)=>{if(!entry||typeof entry!=='object')throw new Error('Invalid fee tier');const from=decimal(entry.from,'Tier start');const amount=cents(from);if(index===0&&amount!==BigInt(0)||amount<=previous)throw new Error('Tiers must start at 0 and increase');previous=amount;return {from,percent:percentage(entry.percent)};});
  }}
  if(r.minimum!==undefined&&r.minimum!=='')rule.minimum=decimal(r.minimum,'Minimum fee');
  if(r.cap!==undefined&&r.cap!=='')rule.cap=decimal(r.cap,'Fee cap');
  if(rule.minimum&&rule.cap&&cents(rule.minimum)>cents(rule.cap))throw new Error('Minimum fee cannot exceed the cap');
  return rule;
}
export function applyAccountSettings(account:AccountResponse,settings:AccountSetting[],storeNames:Map<string,string>):AccountResponse {
  const represented=new Set(account.stores.map(row=>row.rosterKey));
  const units=new Map<string,AccountSetting>();
  for(const setting of settings.filter(s=>s.effective_month.slice(0,7)<=account.invoiceMonth).sort((a,b)=>a.effective_month.localeCompare(b.effective_month)||(BigInt(a.version)<BigInt(b.version)?-1:1)))units.set(setting.roster_key,setting);
  for(const setting of units.values())if(!represented.has(setting.roster_key)){account.stores.push({id:setting.roster_key,rosterKey:setting.roster_key,project:setting.roster_project,entity:setting.legal_entity,market:setting.currency==='MYR'?'MY':'SG',storeId:null,storeName:setting.roster_project,currency:setting.currency,statementMonth:previousMonth(account.invoiceMonth),invoiceMonth:account.invoiceMonth,servicePeriodStart:null,servicePeriodEnd:null,status:'pending_terms',expectedNetFee:null,billed:null,collected:null,outstanding:null});}
  for(const row of account.stores) {
    const history=settings.filter(s=>s.roster_key===row.rosterKey).sort((a,b)=>BigInt(a.version)<BigInt(b.version)?-1:1);
    const applicable=history.filter(s=>s.effective_month.slice(0,7)<=account.invoiceMonth).sort((a,b)=>a.effective_month.localeCompare(b.effective_month)||(BigInt(a.version)<BigInt(b.version)?-1:1));
    const currentMapping=applicable.filter(s=>s.change_action==='mapping').at(-1);
    const currentRule=applicable.filter(s=>s.change_action==='fee_rule').at(-1);
    const current=currentRule??currentMapping;
    row.latestSettingsVersion=history.at(-1)?.version??'0';row.appliedSettingsVersion=current?.version??null;row.settingsEffectiveMonth=current?.effective_month.slice(0,7)??null;
    row.rateHistory=history.filter(s=>s.change_action==='fee_rule').map(s=>({action:'fee_rule',version:s.version,effectiveMonth:s.effective_month.slice(0,7),rule:s.fee_rule,storeId:s.store_id,changedAt:s.created_at}));
    row.mappingEffectiveMonth=currentMapping?.effective_month.slice(0,7)??null;row.rateEffectiveMonth=currentRule?.effective_month.slice(0,7)??null;
    row.rateRule=currentRule?.fee_rule??null;row.calculatedFee=null;
    row.calculationStatus=row.rateRule?'pending_statement':'pending_rule';
    if(currentMapping?.store_id&&storeNames.has(currentMapping.store_id)) { row.storeId=currentMapping.store_id;row.storeName=storeNames.get(currentMapping.store_id)!;row.mappingStatus='resolved';row.mappingReason='Manually selected by Super Admin';row.candidates=[{mappingId:'',username:'',storeId:currentMapping.store_id,storeName:row.storeName}];if(row.status==='pending_mapping')row.status=row.rateRule?'pending_statement':'pending_terms'; }
  }
  for(const summary of account.summaries){summary.pendingStores=account.stores.filter(row=>row.currency===summary.currency&&row.expectedNetFee===null).length;if(summary.pendingStores)summary.expectedNetFee=null;}
  return account;
}
