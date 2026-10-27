"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AccountCurrency, AccountFeeRule, AccountStoreRow } from './account-contract';
import { accountMoney } from './account-display';
import { applyRateCardPreview, monthlyFeePreview, useFeePlans, useFeePreviewState, type RateCardApplyAudit, type RateCardApplyCommand } from './fee-plan-context';
import { calculateFee, currentPlanVersions, feeBasisLabel, planForMonth, PREVIEW_BASIS, type ClientType, type FeeCalculation, type FeePlan, type FeePlanDraft } from './fee-plan-model';
import './fee-plans-preview.css';

type Tab='plans'|'preview'|'history';
type Editor={id:string;name:string;clientType:ClientType;currency:AccountCurrency;effectiveMonth:string;type:AccountFeeRule['type'];basis:AccountFeeRule['basis'];basisLabel:string;fixedAmount:string;percent:string;tiers:Array<{from:string;percent:string;cap?:string}>;minimum:string;cap:string;existing:boolean};
type Choice={clientType:''|ClientType;planId:string};
type ChoiceVersion=Choice&{effectiveMonth:string};
type Snapshot={id:string;month:string;unitKey:string;unitName:string;plan:FeePlan;amount:string;result:FeeCalculation;createdAt:string};
const bases:Array<{value:AccountFeeRule['basis'];label:string}>=[{value:'custom',label:'Billing amount (preview)'},{value:'merchandise_subtotal',label:'Merchandise subtotal'},{value:'net_gmv',label:'Net GMV'},{value:'statement_amount',label:'Statement amount'}];
function toEditor(plan:FeePlan|undefined,month:string):Editor{
 return {id:plan?.id??crypto.randomUUID(),name:plan?.name??'',clientType:plan?.clientType??'External',currency:plan?.currency??'MYR',effectiveMonth:month,type:plan?.rule.type??'percent',basis:plan?.rule.basis==='fixed_monthly'?'custom':plan?.rule.basis??'custom',basisLabel:plan?.rule.basisLabel??PREVIEW_BASIS,fixedAmount:plan?.rule.fixedAmount??'',percent:plan?.rule.percent??'',tiers:plan?.rule.tiers?.map(t=>({...t}))??[{from:'0',percent:''}],minimum:plan?.rule.minimum??'',cap:plan?.rule.cap??'',existing:Boolean(plan)};
}
function draftFromEditor(editor:Editor):FeePlanDraft{
 const rule:AccountFeeRule={type:editor.type,currency:editor.currency,basis:editor.type==='fixed'?'fixed_monthly':editor.basis};
 if(editor.type==='fixed')rule.fixedAmount=editor.fixedAmount;
 else {if(editor.basis==='custom')rule.basisLabel=editor.basisLabel;if(editor.type==='percent')rule.percent=editor.percent;else rule.tiers=editor.tiers.map(t=>({...t}));}
 if(editor.type!=='fixed'){if(editor.minimum!=='')rule.minimum=editor.minimum;if(editor.cap!=='')rule.cap=editor.cap;}
 return {id:editor.id,name:editor.name,clientType:editor.clientType,currency:editor.currency,effectiveMonth:editor.effectiveMonth,rule};
}
function ruleLabel(plan:Pick<FeePlan,'rule'|'currency'>){const rule=plan.rule;if(rule.type==='fixed')return rule.fixedAmount?accountMoney(rule.fixedAmount,plan.currency):'Set monthly fee';if(rule.type==='percent')return rule.percent?`${rule.percent}%`:'Set percentage';return rule.tiers?.length?`${rule.tiers.map(t=>`${t.percent}%${t.cap?` (cap ${accountMoney(t.cap,plan.currency)})`:''}`).join(' / ')}`:'Set tier rates';}
function submittedMonth(form:HTMLFormElement){const value=new FormData(form).get('effectiveInvoiceMonth');if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('Choose a valid Effective Invoice Month.');return value;}
function snapshotTime(value:string){return new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value));}

export function FeePlansPreview(props:{rows:AccountStoreRow[];month:string}){
 const {feeWorkspace}=useFeePlans();
 return feeWorkspace?<FeePlansDialog key={`${feeWorkspace.view}:${feeWorkspace.unitKeys?.join(',')??feeWorkspace.unitKey??''}:${feeWorkspace.month}`} {...props} month={feeWorkspace.month} />:null;
}
function FeePlansDialog({rows,month}:{rows:AccountStoreRow[];month:string}){
 const {plans,upsertPlan,feeWorkspace,closeFeeWorkspace,previewMemory}=useFeePlans();
 const dialogRef=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=dialogRef.current;dialog?.showModal();return ()=>{if(dialog?.open)dialog.close();};},[]);
 const baseId=useId();
 const [tab,setTab]=useState<Tab>(feeWorkspace?.view==='settings'?'plans':'preview');
 const [editor,setEditor]=useState<Editor|null>(null);
 const [error,setError]=useState('');const [feedback,setFeedback]=useState('');
 const [planType,setPlanType]=useState<'all'|ClientType>('all');const [planCurrency,setPlanCurrency]=useState<'all'|AccountCurrency>('all');
 const [focusedKey,setFocusedKey]=useState<string>(feeWorkspace?.unitKey??'');
 const [history]=useFeePreviewState<Snapshot[]>('fee-preview-history',[]);const [locks]=useFeePreviewState<Record<string,string>>('fee-preview-locks',{});
 const currentPlans=useMemo(()=>currentPlanVersions(plans,month),[plans,month]);
 const library=currentPlans.filter(plan=>(planType==='all'||plan.clientType===planType)&&(planCurrency==='all'||plan.currency===planCurrency));
 const units=rows;
 const focusedUnit=units.find(row=>(row.rosterKey??row.id)===focusedKey);
 const shownUnits=focusedUnit?[focusedUnit]:[];
 function copyPlan(plan:FeePlan){const draft=toEditor(plan,month);setEditor({...draft,id:crypto.randomUUID(),name:`${plan.name} custom`.slice(0,120),existing:false});setError('');setFeedback('');setTab('plans');}
 function openEditor(plan?:FeePlan){setEditor(toEditor(plan,month));setError('');setFeedback('');setTab('plans');}
 function change<K extends keyof Editor>(key:K,value:Editor[K]){setEditor(current=>current?{...current,[key]:value}:null);setError('');}
 function savePlan(event:FormEvent){event.preventDefault();if(!editor)return;try{const submitted=submittedMonth(event.currentTarget as HTMLFormElement);if(submitted!==editor.effectiveMonth){change('effectiveMonth',submitted);setError(`Month changed to ${submitted}. Review the rate card and save again.`);return;}upsertPlan(draftFromEditor(editor));setFeedback(`${editor.name.trim()} saved as a preview version from ${editor.effectiveMonth}.`);setEditor(null);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Check the rate card fields.');}}
 return <dialog ref={dialogRef} className="fp-workspace-dialog" aria-labelledby={`${baseId}-title`} onCancel={event=>{event.preventDefault();closeFeeWorkspace();}}><section className="fp-preview">
  <header className="fp-header"><div><h3 id={`${baseId}-title`}>{feeWorkspace?.view==='bulk'?'Update rate card':feeWorkspace?.view==='assignment'?'Monthly rate':'Rate cards'}</h3><p>{month} · rates exclude SST.</p></div><div className="fp-header-actions"><span className="fp-session">Session preview</span><button type="button" className="fp-close" aria-label="Close monthly fee settings" onClick={closeFeeWorkspace}>×</button></div></header>
  <div className="fp-tabs" role="tablist" aria-label="Rate card tools">{([['preview','Monthly rate'],['plans','Rate cards'],['history',`History${history.length?` · ${history.length}`:''}`]] as const).map(([id,label])=><button type="button" key={id} id={`${baseId}-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`${baseId}-panel-${id}`} onClick={()=>{setTab(id);setFeedback('');}}>{label}</button>)}</div>
  <div className="fp-content" id={`${baseId}-panel-${tab}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`}>
   {feedback&&<p className="fp-feedback" role="status">{feedback}</p>}
   {tab==='plans'&&<>
    <div className="fp-toolbar"><div className="fp-inline-filters"><label><span className="sr-only">Rate card client type</span><select value={planType} onChange={event=>setPlanType(event.target.value as typeof planType)}><option value="all">All client types</option><option>Internal</option><option>External</option></select></label><label><span className="sr-only">Rate card currency</span><select value={planCurrency} onChange={event=>setPlanCurrency(event.target.value as typeof planCurrency)}><option value="all">All currencies</option><option>MYR</option><option>SGD</option></select></label></div><button type="button" className="fp-primary" onClick={()=>openEditor()}>+ New rate card</button></div>
    {library.length?<div className="fp-library">{library.map(plan=><article className="fp-plan" key={`${plan.id}:${plan.version}`}><div className="fp-plan-head"><h4>{plan.name}</h4><small>v{plan.version}</small></div><div className="fp-plan-meta"><span className="fp-tag">{plan.clientType}</span><span className="fp-tag">{plan.currency}</span><span className="fp-tag">From {plan.effectiveMonth}</span></div><div className="fp-plan-rule">{ruleLabel(plan)}</div><small>{plan.rule.type==='tiers'?'Whole-month tier':feeBasisLabel(plan.rule)}</small><div className="fp-inline-filters"><button type="button" className="fp-secondary" onClick={()=>openEditor(plan)}>Edit version</button><button type="button" className="fp-text-button" onClick={()=>copyPlan(plan)}>Copy card</button></div></article>)}</div>:<div className="fp-empty">No plans for these filters and invoice month. Create a plan to begin.</div>}
    {editor&&<form className="fp-editor" onSubmit={savePlan} aria-labelledby={`${baseId}-editor-title`}><div className="fp-editor-head"><h4 id={`${baseId}-editor-title`}>{editor.existing?'New rate card version':'New rate card'}</h4><button type="button" className="fp-text-button" onClick={()=>{setEditor(null);setError('');}}>Close</button></div><div className="fp-editor-fields">
     <label>Rate card name<input value={editor.name} maxLength={120} onChange={event=>change('name',event.target.value)} required/></label>
     <label>Client type<select value={editor.clientType} disabled={editor.existing} onChange={event=>change('clientType',event.target.value as ClientType)}><option>Internal</option><option>External</option></select></label>
     <label>Currency<select value={editor.currency} disabled={editor.existing} onChange={event=>change('currency',event.target.value as AccountCurrency)}><option>MYR</option><option>SGD</option></select></label>
     <label>Effective Invoice Month<input name="effectiveInvoiceMonth" type="month" value={editor.effectiveMonth} onInput={event=>change('effectiveMonth',event.currentTarget.value)} onChange={event=>change('effectiveMonth',event.currentTarget.value)} required/></label>
     <label>Fee type<select value={editor.type} onChange={event=>change('type',event.target.value as AccountFeeRule['type'])}><option value="fixed">Fixed monthly fee</option><option value="percent">Percentage</option><option value="tiers">Whole-month tier</option></select></label>
     {editor.type==='fixed'?<label>Monthly fee<input type="text" inputMode="decimal" value={editor.fixedAmount} onChange={event=>change('fixedAmount',event.target.value)} placeholder="Enter fee" required/></label>:<><label>Amount basis<select value={editor.basis} onChange={event=>change('basis',event.target.value as AccountFeeRule['basis'])}>{bases.map(basis=><option key={basis.value} value={basis.value}>{basis.label}</option>)}</select></label>{editor.basis==='custom'&&<label className="fp-wide">Basis label<input value={editor.basisLabel} maxLength={120} onChange={event=>change('basisLabel',event.target.value)} required/></label>}{editor.type==='percent'?<label>Rate %<input type="text" inputMode="decimal" value={editor.percent} onChange={event=>change('percent',event.target.value)} placeholder="Enter percentage" required/></label>:<div className="fp-wide fp-tier-list">{editor.tiers.map((tier,index)=><div className="fp-tier-row" key={index}><label>Amount from<input aria-label={`Tier ${index+1} amount from`} inputMode="decimal" value={tier.from} onChange={event=>change('tiers',editor.tiers.map((item,i)=>i===index?{...item,from:event.target.value}:item))} required/></label><label>Rate %<input aria-label={`Tier ${index+1} percentage`} inputMode="decimal" value={tier.percent} onChange={event=>change('tiers',editor.tiers.map((item,i)=>i===index?{...item,percent:event.target.value}:item))} required/></label><label>Tier cap · optional<input aria-label={`Tier ${index+1} fee cap`} inputMode="decimal" value={tier.cap??''} onChange={event=>change('tiers',editor.tiers.map((item,i)=>i===index?{...item,cap:event.target.value}:item))} placeholder="No cap"/></label><button type="button" onClick={()=>change('tiers',editor.tiers.filter((_,i)=>i!==index))} aria-label={`Remove tier ${index+1}`}>Remove</button></div>)}<button type="button" className="fp-secondary" disabled={editor.tiers.length>=20} onClick={()=>change('tiers',[...editor.tiers,{from:'',percent:''}])}>+ Add tier</button><p className="fp-editor-note">Start at 0. The selected tier rate applies to the full month’s amount. A tier cap applies only within that tier.</p></div>}</>}
     {editor.type!=='fixed'&&<><label>Minimum fee · optional<input inputMode="decimal" value={editor.minimum} onChange={event=>change('minimum',event.target.value)} placeholder="No minimum"/></label><label>Fee cap · optional<input inputMode="decimal" value={editor.cap} onChange={event=>change('cap',event.target.value)} placeholder="No cap"/></label></>}
     <p className="fp-editor-note">{editor.existing?`${rows.filter(row=>monthlyFeePreview(row,month,plans,previewMemory).choice.planId===editor.id&&!locks[`${month}:${row.rosterKey??row.id}`]).length} unlocked assignments use this plan in ${month}. `:''}Updates apply from the effective invoice month. Locked previews keep their original plan and result. Copy the plan for an individual exception.</p>
    </div>{error&&<p className="fp-error" role="alert">{error}</p>}<div className="fp-editor-actions"><button type="button" className="fp-secondary" onClick={()=>setEditor(null)}>Cancel</button><button type="submit" className="fp-primary">Save preview version</button></div></form>}
    <p className="fp-plain-note">Preview only · no income recorded. Blank fixed fees and tiers need your values.</p>
   </>}
   {tab==='preview'&&<>
    {feeWorkspace?.view==='settings'&&<div className="fp-form-filters"><label>Billing record<select aria-label="Billing project to preview" value={focusedUnit?focusedKey:''} onChange={event=>setFocusedKey(event.target.value)}><option value="">Choose billing record</option>{units.map(row=><option key={row.rosterKey??row.id} value={row.rosterKey??row.id}>{row.project||row.storeName} · {row.currency}</option>)}</select></label></div>}
    {feeWorkspace?.view==='bulk'||focusedUnit?<RateCardAssignmentForm key={feeWorkspace?.unitKeys?.join('|')??focusedKey} rows={rows} unitKeys={feeWorkspace?.view==='bulk'?feeWorkspace.unitKeys??[]:shownUnits.map(row=>row.rosterKey??row.id)} month={month}/>:<div className="fp-empty">Choose a billing record to update its rate card.</div>}
   </>}
   {tab==='history'&&<><RateCardApplyHistory entries={(previewMemory['fee-preview-application-history']??[]) as RateCardApplyAudit[]}/><h4>Locked previews</h4>{history.length?<div className="fp-history-scroll"><table className="fp-history"><thead><tr><th>Invoice month</th><th>Billing project</th><th>Plan version</th><th>Preview amount</th><th>Rate / tier</th><th>Fee · excl. SST</th></tr></thead><tbody>{history.map(record=><tr key={record.id}><td>{record.month}<small>{snapshotTime(record.createdAt)} MYT</small></td><td><strong>{record.unitName}</strong><small>{record.plan.clientType}</small></td><td>{record.plan.name}<small>v{record.plan.version} · effective {record.plan.effectiveMonth}</small></td><td>{record.plan.rule.type==='fixed'?'—':accountMoney(record.amount,record.plan.currency)}</td><td>{record.result.rateLabel}<small>{record.result.tierLabel}</small></td><td><strong>{accountMoney(record.result.fee,record.plan.currency)}</strong></td></tr>)}</tbody></table></div>:<div className="fp-empty">Lock a monthly preview to keep its plan version, amount and fee here.</div>}<p className="fp-plain-note">History contains session previews, not issued invoices or payments.</p></>}
   <p className="fp-plain-note">Preview only · resets on refresh · no invoices or payments changed.</p>
  </div>
 </section></dialog>;
}

function RateCardAssignmentForm({rows,unitKeys,month}:{rows:AccountStoreRow[];unitKeys:string[];month:string}){
 const {plans,previewMemory,setPreviewMemory,closeFeeWorkspace}=useFeePlans();
 const targets=unitKeys.flatMap(key=>{const row=rows.find(item=>(item.rosterKey??item.id)===key);return row?[row]:[];});
 const initial=targets[0]?monthlyFeePreview(targets[0],month,plans,previewMemory):undefined;
 const [effectiveMonth,setEffectiveMonth]=useState(month);
 const [clientType,setClientType]=useState<''|ClientType>(initial?.choice.clientType??'');
 const [planId,setPlanId]=useState(initial?.plan?.id??'');
 const [amount,setAmount]=useState(initial?.amount??'');
 const [error,setError]=useState('');const [feedback,setFeedback]=useState('');
 const currencies=[...new Set(targets.map(row=>row.currency))];
 const options=currentPlanVersions(plans,effectiveMonth).filter(plan=>plan.clientType===clientType&&currencies.length===1&&plan.currency===currencies[0]);
 const card=planId?planForMonth(plans,planId,effectiveMonth):undefined;
 const plan=card&&card.clientType===clientType&&currencies.length===1&&card.currency===currencies[0]?card:undefined;
 const current=targets[0]?monthlyFeePreview(targets[0],effectiveMonth,plans,previewMemory):undefined;
 const assignments=(previewMemory['fee-preview-assignments-v2']??{}) as Record<string,ChoiceVersion[]>;
 const exactAssignment=unitKeys.length===1&&(assignments[unitKeys[0]]??[]).some(value=>value.effectiveMonth===effectiveMonth&&value.planId===plan?.id&&value.clientType===clientType);
 const auditRecorded=((previewMemory['fee-preview-application-history']??[]) as RateCardApplyAudit[]).some(entry=>entry.effectiveMonth===effectiveMonth&&entry.plan.id===plan?.id&&entry.plan.version===plan?.version&&entry.targets.some(target=>target.unitKey===unitKeys[0]));
 const draftClean=exactAssignment&&auditRecorded&&current?.plan?.version===plan?.version&&current?.amount===amount;
 let calculation:FeeCalculation|undefined;
 if(plan&&targets.length===1&&(amount!==''||plan.rule.type==='fixed')){try{calculation=calculateFee(plan.rule,amount);}catch{calculation=undefined;}}
 function changeMonth(value:string){if(value===effectiveMonth)return;setEffectiveMonth(value);setAmount(targets.length===1?monthlyFeePreview(targets[0],value,plans,previewMemory).amount:'');setError('');setFeedback('');}
 function apply(event:FormEvent){event.preventDefault();setError('');setFeedback('');try{
   const submitted=submittedMonth(event.currentTarget as HTMLFormElement);
   if(submitted!==effectiveMonth){changeMonth(submitted);setError(`Month changed to ${submitted}. Review the rate card and apply again. No records were updated.`);return;}
   if(!clientType||!plan)throw Error('Choose a client type and a compatible rate card.');
   const command:RateCardApplyCommand={requestId:crypto.randomUUID(),unitKeys:[...unitKeys],clientType,planId:plan.id,planVersion:plan.version,effectiveMonth,changedAt:new Date().toISOString(),...(unitKeys.length===1?{previewAmount:amount}:{})};
   const next=applyRateCardPreview(previewMemory,rows,plans,command);
   const patch=Object.fromEntries(Object.keys(next).filter(key=>next[key]!==previewMemory[key]).map(key=>[key,next[key]]));
   // All validation ran above in the event handler. The React updater cannot throw.
   setPreviewMemory(previous=>({...previous,...patch}));
   setFeedback(`Applied ${plan.name} from ${effectiveMonth} to ${unitKeys.length} record${unitKeys.length===1?'':'s'} · session preview.`);
 }catch(cause){setError(cause instanceof Error?cause.message:'No records were updated.');}}
 function lock(){if(!draftClean||!current?.plan||!current.calculation||current.locked||unitKeys.length!==1)return;
   const snapshot:Snapshot={id:crypto.randomUUID(),month:effectiveMonth,unitKey:unitKeys[0],unitName:targets[0].project||targets[0].storeName,plan:structuredClone(current.plan),amount:current.amount,result:structuredClone(current.calculation),createdAt:new Date().toISOString()};
   setPreviewMemory(previous=>({...previous,'fee-preview-history':[snapshot,...(previous['fee-preview-history']??[]) as Snapshot[]],'fee-preview-locks':{...(previous['fee-preview-locks']??{}) as Record<string,string>,[`${effectiveMonth}:${unitKeys[0]}`]:snapshot.id}}));setFeedback('Applied preview locked. Its card and result stay in History.');
 }
 return <form onSubmit={apply} className="fp-assignment-form">
  <div className="fp-unit-title"><div><h4>{targets.length===1?targets[0].project||targets[0].storeName:`${unitKeys.length} selected records`}</h4><p>{currencies.length===1?currencies[0]:'Mixed currencies'} · session preview</p></div></div>
  <div className="fp-unit-fields"><label>Client type<select aria-label="Rate card client type" value={clientType} onChange={event=>{setClientType(event.target.value as ClientType);setPlanId('');setError('');setFeedback('');}} required><option value="">Choose client type</option><option>Internal</option><option>External</option></select></label><label>Rate card<select aria-label="Rate card" value={plan?.id??''} onChange={event=>{setPlanId(event.target.value);setError('');setFeedback('');}} required><option value="">Choose rate card</option>{options.map(option=><option key={option.id} value={option.id}>{option.name} · v{option.version}</option>)}</select></label><label>Effective Invoice Month<input aria-label="Effective Invoice Month" name="effectiveInvoiceMonth" type="month" value={effectiveMonth} onInput={event=>changeMonth(event.currentTarget.value)} onChange={event=>changeMonth(event.currentTarget.value)} required/></label></div>
  {currencies.length>1&&<p className="fp-error" role="alert">Select records with the same currency. No records were updated.</p>}
  {targets.length>1&&<details className="fp-target-list"><summary>Review {unitKeys.length} records · current → new</summary><ul>{targets.map(row=>{const before=monthlyFeePreview(row,effectiveMonth,plans,previewMemory);return <li key={row.rosterKey??row.id}><strong>{row.project||row.storeName}</strong><span>{before.plan?`${before.plan.name} v${before.plan.version}`:row.rateRule?'Saved rate · no card':'Unassigned'} → {plan?`${plan.name} v${plan.version}`:'Choose rate card'}{before.locked?' · locked':''}</span></li>;})}</ul></details>}
  {targets.length===1&&<><p className="fp-plain-note">Current card: {current?.plan?`${current.plan.name} · v${current.plan.version}`:'Unassigned'}</p>{plan?.rule.type!=='fixed'&&<label className="fp-calculation-input">Calculation amount · preview<input aria-label="Preview calculation amount" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="Enter monthly amount"/></label>}<div className="fp-calculation"><div><p>{plan?`${plan.name} · v${plan.version}`:'Choose rate card'}</p><small>{calculation?`${calculation.rateLabel} · ${calculation.tierLabel}`:'Manual preview amount; no income recorded.'}</small></div><div><strong>{accountMoney(calculation?.fee,targets[0].currency)}</strong><small>Fee · excl. SST · preview</small></div></div></>}
  {plan&&<details className="fp-rule-help"><summary>How this rate works</summary><p>{plan.rule.type==='fixed'?'A fixed monthly fee; no sales amount is needed.':plan.rule.type==='tiers'?'The calculation amount selects one tier; its rate applies to the entire amount.':'The percentage applies to the calculation amount.'} Basis: {feeBasisLabel(plan.rule)}.</p></details>}
  {error&&<p className="fp-error" role="alert">{error}</p>}{feedback&&<p className="fp-feedback" role="status">{feedback}</p>}
  <div className="fp-unit-actions"><button type="button" className="fp-secondary" onClick={closeFeeWorkspace}>Cancel</button>{targets.length===1&&<button type="button" className="fp-secondary" disabled={!draftClean||!current?.calculation||Boolean(current.locked)} onClick={lock}>Lock applied preview</button>}<button type="submit" className="fp-primary" disabled={!clientType||!plan||currencies.length!==1}>Apply preview for {unitKeys.length} record{unitKeys.length===1?'':'s'}</button></div>
 </form>;
}
function RateCardApplyHistory({entries}:{entries:RateCardApplyAudit[]}){return <section className="fp-apply-history"><h4>Rate card updates · session preview</h4>{entries.length?<div className="fp-history-scroll"><table className="fp-history"><thead><tr><th>Effective Invoice Month</th><th>Rate card</th><th>Records</th><th>Changed</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.requestId}><td>{entry.effectiveMonth}</td><td>{entry.plan.name}<small>v{entry.plan.version} · {entry.clientType}</small></td><td><details><summary>{entry.targets.length} records</summary><ul>{entry.targets.map(target=><li key={target.unitKey}>{target.unitName}: {target.priorPlan?`${target.priorPlan.name} v${target.priorPlan.version}`:'Unassigned'} → {entry.plan.name} v{entry.plan.version}</li>)}</ul></details></td><td>{snapshotTime(entry.changedAt)} MYT</td></tr>)}</tbody></table></div>:<p className="fp-plain-note">Applied rate card previews appear here.</p>}</section>;}
