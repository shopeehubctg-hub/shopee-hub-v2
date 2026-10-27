"use client";
import {useState} from 'react';
import type {AccountFeeRule} from './account-contract';
import {useFeePlans} from './fee-plan-context';
import {accountPlanFields,accountRateSummary,availableAccountRateCards,changeAccountSetupMonth,feeRuleFromDraft,malaysiaMonth,resetAccountSetupSelection,selectAccountRateCard,type AccountSetupDraft,type StoreMarket} from './store-account-setup-model';
export {accountSetupError,accountSetupPayload,emptyAccountSetup,feeRuleFromDraft,malaysiaMonth,resetAccountSetupSelection} from './store-account-setup-model';
export type {AccountSetupDraft,AccountSetupPayload} from './store-account-setup-model';

export function AccountSetupFields({draft,market,update}:{draft:AccountSetupDraft;market:StoreMarket;update:(patch:Partial<AccountSetupDraft>)=>void}){
 const {plans}=useFeePlans();const [customOpen,setCustomOpen]=useState(false);
 const cards=availableAccountRateCards(plans,draft);const selected=cards.find(card=>card.id===draft.planId&&card.version===draft.planVersion);
 const updateCustom=(patch:Partial<AccountSetupDraft>)=>update({...patch,planId:'custom',planVersion:null});
 const monthChanged=(month:string)=>{if(month!==draft.effectiveMonth)update(changeAccountSetupMonth(draft,month,plans));};
 const customRule=feeRuleFromDraft(draft,market);
 return <fieldset className="account-rate-fields">
  <legend>Account setup</legend>
  <label className="account-field-wide">Company name<input maxLength={240} required value={draft.legalEntity} onChange={event=>update({legalEntity:event.currentTarget.value})}/></label>
  <label>Effective Invoice Month<input aria-label="Account Effective Invoice Month" name="accountEffectiveInvoiceMonth" type="month" min={malaysiaMonth()} required value={draft.effectiveMonth} onInput={event=>monthChanged(event.currentTarget.value)} onChange={event=>monthChanged(event.currentTarget.value)}/></label>
  <label>Client type<select aria-label="Account client type" value={draft.clientType} onChange={event=>{setCustomOpen(false);update(resetAccountSetupSelection(draft,market,event.currentTarget.value as AccountSetupDraft['clientType']));}} required><option value="">Choose client type</option><option>Internal</option><option>External</option></select></label>
  <label className="account-field-wide">Rate card<select aria-label="Account rate card" value={draft.planId==='custom'?'custom':selected?.id??''} disabled={!draft.clientType} onChange={event=>{setCustomOpen(false);update(selectAccountRateCard(draft,event.currentTarget.value,plans));}} required><option value="">Choose rate card</option>{draft.planId==='custom'&&<option value="custom">Custom rate</option>}{cards.map(card=><option value={card.id} key={card.id}>{card.name} · v{card.version}</option>)}</select></label>
  {selected&&<p className="store-access-note account-field-wide" aria-label="Selected rate card summary">{accountRateSummary(selected.rule)} · excl. SST</p>}
  <p className="store-access-note account-field-wide">Sales currency: {market==='SG'?'SGD':'MYR'} · Fee currency: MYR</p>
  {market==='SG'&&(draft.clientType==='Internal'?<p className="store-access-note account-field-wide">SGD 1 = MYR 3.2 · fixed</p>:draft.clientType==='External'?<label className="account-field-wide">SGD to MYR<select aria-label="Account SGD exchange rate policy" value={draft.fxPolicy} onChange={event=>update({fxPolicy:event.currentTarget.value as AccountSetupDraft['fxPolicy']})} required><option value="">Choose exchange rate policy</option><option value="fixed">Fixed · SGD 1 = MYR 3.2</option><option value="bnm-service-average">BNM average · previous service month</option></select></label>:null)}
  <details className="account-field-wide store-account-custom" open={customOpen||draft.planId==='custom'} onToggle={event=>setCustomOpen(event.currentTarget.open)}><summary>Custom rate</summary>
   {draft.planId!=='custom'?<button type="button" disabled={!draft.clientType} onClick={()=>{update({...accountPlanFields(selected?.rule??customRule),planId:'custom',planVersion:null});setCustomOpen(true);}}>Use custom rule</button>:<div className="account-rate-fields">
    <label>Fee type<select value={draft.type} onChange={event=>updateCustom({type:event.currentTarget.value as AccountSetupDraft['type']})}><option value="fixed">Fixed monthly fee</option><option value="percent">Percentage</option><option value="tiers">Whole-month tiers</option></select></label>
    {draft.type==='fixed'?<label>Monthly fee · MYR<input inputMode="decimal" value={draft.fixedAmount} onChange={event=>updateCustom({fixedAmount:event.currentTarget.value})} required/></label>:<>
     <label>Amount basis<select value={draft.basis} onChange={event=>updateCustom({basis:event.currentTarget.value as AccountFeeRule['basis']})} required><option value="">Choose basis</option><option value="merchandise_subtotal">Merchandise subtotal</option><option value="net_gmv">Net GMV</option><option value="statement_amount">Statement amount</option><option value="custom">Other amount</option></select></label>
     {draft.basis==='custom'&&<label className="account-field-wide">Basis label<input maxLength={120} value={draft.basisLabel} onChange={event=>updateCustom({basisLabel:event.currentTarget.value})} required/></label>}
     {draft.type==='percent'?<label>Rate %<input inputMode="decimal" value={draft.percent} onChange={event=>updateCustom({percent:event.currentTarget.value})} required/></label>:<div className="account-tier-fields account-field-wide"><span>Whole-month tiers · MYR thresholds</span>{draft.tiers.map((tier,index)=><div key={index}><label>From MYR<input aria-label={`Setup tier ${index+1} from`} inputMode="decimal" value={tier.from} onChange={event=>updateCustom({tiers:draft.tiers.map((item,i)=>i===index?{...item,from:event.currentTarget.value}:item)})} required/></label><label>Rate %<input aria-label={`Setup tier ${index+1} rate`} inputMode="decimal" value={tier.percent} onChange={event=>updateCustom({tiers:draft.tiers.map((item,i)=>i===index?{...item,percent:event.currentTarget.value}:item)})} required/></label><label>Tier cap · optional<input aria-label={`Setup tier ${index+1} cap`} inputMode="decimal" value={tier.cap??''} onChange={event=>updateCustom({tiers:draft.tiers.map((item,i)=>i===index?{...item,cap:event.currentTarget.value}:item)})}/></label>{draft.tiers.length>1&&<button type="button" onClick={()=>updateCustom({tiers:draft.tiers.filter((_,i)=>i!==index)})}>Remove</button>}</div>)}<button type="button" disabled={draft.tiers.length>=20} onClick={()=>updateCustom({tiers:[...draft.tiers,{from:'',percent:''}]})}>+ Add tier</button><small>One tier applies to the entire project’s converted MYR amount. A tier cap applies only within that tier.</small></div>}
    </>}
    <label>Minimum fee · optional<input inputMode="decimal" value={draft.minimum} onChange={event=>updateCustom({minimum:event.currentTarget.value})}/></label><label>Fee cap · optional<input inputMode="decimal" value={draft.cap} onChange={event=>updateCustom({cap:event.currentTarget.value})}/></label>
   </div>}
  </details>
 </fieldset>;
}
