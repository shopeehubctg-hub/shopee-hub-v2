"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import {sourceProjectRate,projectFeeCurrency,calculateProjectPreview,type ProjectFeePreview,type PreviewRateSource} from './fee-preview-currency';
import type { AccountStoreRow } from './account-contract';
import {useAccountSecurity} from './account-security-context';
import { archiveRateCard, planForMonth, validatePlan, type ClientType, type FeeCalculation, type FeePlan, type FeePlanDraft } from './fee-plan-model';
export type FeePreviewChoice={clientType:''|ClientType;planId:string};
export type FeePreviewAssignment=FeePreviewChoice&{effectiveMonth:string};
export type FeePreviewSnapshot={id:string;month:string;unitKey:string;unitName:string;plan:FeePlan;amount:string;result:FeeCalculation;createdAt:string;conversion?:ProjectFeePreview};
export type FeeWorkspaceRequest={view:'settings'|'assignment'|'bulk';month:string;unitKey?:string;unitKeys?:string[]};
type FeePlansContextValue={ensurePlans:()=>void;persistent:boolean;catalogStatus:'preview'|'loading'|'ready'|'unavailable';catalogError:string;settingsRevision:number;notifyAccountSaved:()=>void;refreshPlans:()=>Promise<void>;feeWorkspace:FeeWorkspaceRequest|null;openFeeWorkspace:(request:FeeWorkspaceRequest)=>void;closeFeeWorkspace:()=>void;previewRows:AccountStoreRow[];mergePreviewRows:(rows:AccountStoreRow[])=>void;rateSource:PreviewRateSource;plans:FeePlan[];upsertPlan:(draft:FeePlanDraft)=>Promise<void>;archivePlan:(id:string)=>Promise<void>;previewMemory:Record<string,unknown>;setPreviewMemory:Dispatch<SetStateAction<Record<string,unknown>>>};
const emptyRateSource:PreviewRateSource={records:[]};
const FeePlansContext=createContext<FeePlansContextValue|null>(null);
export function FeePlansProvider({children,persistent=false,deferLoad=false}:{children:ReactNode;persistent?:boolean;deferLoad?:boolean}){
 const security=useAccountSecurity();
 const {isCurrentAccess,epoch:securityEpoch}=security;
 const canAccess=!security.enabled||security.phase==='unlocked';
 const canAccessRef=useRef(canAccess);
 useEffect(()=>{canAccessRef.current=canAccess;},[canAccess]);
 const refreshSequence=useRef(0);
 const catalogRequested=useRef(false);
 const catalogRequest=useRef<Promise<void>|null>(null);
 const [feeWorkspace,setFeeWorkspace]=useState<FeeWorkspaceRequest|null>(null);
 const openFeeWorkspace=useCallback((request:FeeWorkspaceRequest)=>setFeeWorkspace(request),[]);
 const closeFeeWorkspace=useCallback(()=>setFeeWorkspace(null),[]);
 const [plans,setPlans]=useState<FeePlan[]>([]);
 const [rateSource,setRateSource]=useState<PreviewRateSource>(emptyRateSource);
 const [catalogStatus,setCatalogStatus]=useState<FeePlansContextValue['catalogStatus']>(persistent?'loading':'preview');
 const [catalogError,setCatalogError]=useState('');
 const [settingsRevision,setSettingsRevision]=useState(0);
 const notifyAccountSaved=useCallback(()=>setSettingsRevision(value=>value+1),[]);
 const retry=useRef<{fingerprint:string;requestId:string}|null>(null);
 const refreshPlans=useCallback(()=>{
  if(!persistent||!canAccessRef.current)return Promise.resolve();
  if(catalogRequest.current)return catalogRequest.current;
  catalogRequested.current=true;
  const accessEpoch=securityEpoch;
  const sequence=++refreshSequence.current;
  const request=(async()=>{
  try{const response=await fetch('/api/admin/account/rate-cards',{cache:'no-store'});const data=await response.json();if(!response.ok||!data.available||!Array.isArray(data.plans)||!data.previewRateSource||!Array.isArray(data.previewRateSource.records))throw Error(data.error||'Rate cards are unavailable.');if(sequence===refreshSequence.current&&isCurrentAccess(accessEpoch)){setPlans(data.plans);setRateSource(data.previewRateSource);setCatalogStatus('ready');setCatalogError('');}}
  catch(error){if(sequence===refreshSequence.current&&isCurrentAccess(accessEpoch)){setCatalogStatus('unavailable');setCatalogError(error instanceof Error?error.message:'Rate cards are unavailable.');}throw error;}
  })();
  catalogRequest.current=request;
  void request.finally(()=>{if(catalogRequest.current===request)catalogRequest.current=null;}).catch(()=>{});
  return request;
 },[persistent,securityEpoch,isCurrentAccess]);
 const ensurePlans=useCallback(()=>{if(persistent&&canAccess&&!catalogRequested.current)void refreshPlans().catch(()=>{});},[persistent,canAccess,refreshPlans]);
 useEffect(()=>{if(!deferLoad)ensurePlans();},[deferLoad,ensurePlans]);
 const [previewRows,setPreviewRows]=useState<AccountStoreRow[]>([]);
 const mergePreviewRows=useCallback((rows:AccountStoreRow[])=>{if(!rows.length||!isCurrentAccess(securityEpoch))return;setPreviewRows(current=>[...new Map([...current,...rows].map(row=>[row.rosterKey??row.id,row])).values()]);},[securityEpoch,isCurrentAccess]);
 const [previewMemory,setPreviewMemory]=useState<Record<string,unknown>>({});
 const safeSetPreviewMemory=useCallback<Dispatch<SetStateAction<Record<string,unknown>>>>((next)=>{if(isCurrentAccess(securityEpoch))setPreviewMemory(next);},[securityEpoch,isCurrentAccess]);
 useEffect(()=>{if(security.enabled&&!canAccess){refreshSequence.current+=1;catalogRequested.current=false;catalogRequest.current=null;let cancelled=false;queueMicrotask(()=>{if(cancelled)return;setFeeWorkspace(null);setPlans([]);setRateSource(emptyRateSource);setPreviewRows([]);setPreviewMemory({});setCatalogStatus('loading');setCatalogError('');retry.current=null;});return ()=>{cancelled=true;};}},[security.enabled,canAccess,securityEpoch]);
 async function writeCatalog(method:'POST'|'DELETE',body:Record<string,unknown>){
  const accessEpoch=securityEpoch;
  if(!isCurrentAccess(accessEpoch))throw Error('Account is locked.');
  if(catalogStatus!=='ready')throw Error('Reload rate cards before saving.');
  const fingerprint=JSON.stringify({method,...body});if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,requestId:crypto.randomUUID()};
  const response=await fetch('/api/admin/account/rate-cards',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,requestId:retry.current.requestId})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to save rate card.');
  if(!isCurrentAccess(accessEpoch))throw Error('Account is locked.');
  setPlans(data.plans);retry.current=null;notifyAccountSaved();
 }
 async function upsertPlan(draft:FeePlanDraft){const checked=validatePlan(draft);const existing=plans.find(plan=>plan.id===checked.id);if(existing?.archivedAt)throw Error('This rate card was deleted. Choose another card.');if(existing&&(existing.currency!==checked.currency||existing.clientType!==checked.clientType))throw Error('Copy the plan to use a different client type or currency.');const expectedVersion=Math.max(0,...plans.filter(plan=>plan.id===checked.id).map(plan=>plan.version));if(persistent){await writeCatalog('POST',{card:checked,expectedVersion});return;}setPlans(current=>current.some(plan=>plan.id===checked.id&&plan.archivedAt)?current:[...current,{...checked,version:expectedVersion+1}]);}
 async function archivePlan(id:string){const archivedAt=new Date().toISOString();archiveRateCard(plans,id,archivedAt);if(persistent){await writeCatalog('DELETE',{id,expectedVersion:Math.max(...plans.filter(plan=>plan.id===id).map(plan=>plan.version))});return;}setPlans(current=>current.map(plan=>plan.id===id?{...plan,archivedAt:plan.archivedAt??archivedAt}:plan));}
 return <FeePlansContext.Provider value={{ensurePlans,persistent,catalogStatus:canAccess?catalogStatus:'loading',catalogError:canAccess?catalogError:'',settingsRevision,notifyAccountSaved,refreshPlans,feeWorkspace:canAccess?feeWorkspace:null,openFeeWorkspace,closeFeeWorkspace,previewRows:canAccess?previewRows:[],mergePreviewRows,rateSource:canAccess?rateSource:emptyRateSource,plans:canAccess?plans:[],upsertPlan,archivePlan,previewMemory:canAccess?previewMemory:{},setPreviewMemory:safeSetPreviewMemory}}>{children}</FeePlansContext.Provider>;
}
export function useFeePlans(){const context=useContext(FeePlansContext);const ensurePlans=context?.ensurePlans;useEffect(()=>{ensurePlans?.();},[ensurePlans]);if(!context)throw Error('FeePlansProvider is required');return context;}

/** Tab-memory only: survives module navigation, resets on page reload, never writes financial records. */
export function useFeePreviewState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const {previewMemory,setPreviewMemory}=useFeePlans();
 const value=(key in previewMemory?previewMemory[key]:initial) as T;
 const update:Dispatch<SetStateAction<T>>=(next)=>setPreviewMemory(previous=>{const current=(key in previous?previous[key]:initial) as T;return {...previous,[key]:typeof next==='function'?(next as (value:T)=>T)(current):next};});
 return [value,update];
}

/** Source-derived preview only: exact project identity and source currency; no name inference or DB assignment. */
export function sourceRateCardDefault(row:AccountStoreRow,month:string,data:PreviewRateSource=emptyRateSource):FeePreviewAssignment|undefined{
 const record=sourceProjectRate(row,month,data);if(!record)return undefined;
 if(!['Internal','External'].includes(record.clientType)||!record.planId)return undefined;
 return {effectiveMonth:record.effectiveMonth,clientType:record.clientType as ClientType,planId:record.planId};
}

/** One read path powers Billing records and the row editor; no invoice totals are changed. */
export function monthlyFeePreview(row:AccountStoreRow,month:string,plans:FeePlan[],memory:Record<string,unknown>,data:PreviewRateSource=emptyRateSource){
 const key=row.rosterKey??row.id;
 const assignments=(memory['fee-preview-assignments-v2']??{}) as Record<string,FeePreviewAssignment[]>;
 const persisted=row.rateCard&&row.clientType&&row.rateEffectiveMonth&&row.rateEffectiveMonth<=month?{clientType:row.clientType,planId:row.rateCard.id,effectiveMonth:row.rateEffectiveMonth}:undefined;
 const memoryChoice=(assignments[key]??[]).filter(v=>v.effectiveMonth<=month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)).at(-1);
 // The database snapshot wins for its month. An explicit later-month choice may
 // preview a new card, but catalog revisions alone never rewrite an assignment.
 const sessionChoice=memoryChoice&&(!persisted||memoryChoice.effectiveMonth>persisted.effectiveMonth)?memoryChoice:undefined;
 const choice=sessionChoice??persisted??sourceRateCardDefault(row,month,data)??{clientType:'',planId:''};
 const history=(memory['fee-preview-history']??[]) as FeePreviewSnapshot[];
 const locks=(memory['fee-preview-locks']??{}) as Record<string,string>;
 const locked=history.find(snapshot=>snapshot.id===locks[`${month}:${key}`]);
 const selected=choice.planId?planForMonth(plans,choice.planId,month):undefined;
 const savedRule=row.rateRule&&row.rateEffectiveMonth&&row.rateEffectiveMonth<=month&&row.clientType?{id:row.rateCard?.id??`custom:${key}`,name:row.rateCard?.name??'Custom rate',version:row.rateCard?.version??Number(row.appliedSettingsVersion??1),clientType:row.clientType,currency:row.rateRule.currency,effectiveMonth:row.rateEffectiveMonth,rule:row.rateRule}:undefined;
 const sessionAudit=sessionChoice?((memory['fee-preview-application-history']??[]) as RateCardApplyAudit[]).find(entry=>entry.effectiveMonth===sessionChoice.effectiveMonth&&entry.plan.id===sessionChoice.planId&&entry.targets.some(target=>target.unitKey===key)):undefined;
 const candidate=sessionAudit?.plan??selected;
 const compatible=candidate?.currency===projectFeeCurrency(row,month,data)&&candidate.clientType===choice.clientType?candidate:undefined;
 const plan=locked?.plan??(sessionChoice?compatible:savedRule??compatible);
 const amounts=(memory['fee-preview-amounts']??{}) as Record<string,string>;
 const amount=locked?.amount??amounts[`${month}:${key}`]??'';
 let conversion=locked?.conversion;
 if(!locked&&plan){try{conversion=calculateProjectPreview(row,month,plan,amount,data);}catch{conversion=undefined;}}
 const calculation=locked?.result??conversion?.calculation;
 const nextEffectiveMonth=(assignments[key]??[]).filter(v=>v.effectiveMonth>month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)).at(0)?.effectiveMonth;
 return {choice,plan,amount,calculation,conversion,locked,nextEffectiveMonth};
}
export function useMonthlyFeePreview(row:AccountStoreRow,month:string){const {plans,previewMemory,rateSource}=useFeePlans();return monthlyFeePreview(row,month,plans,previewMemory,rateSource);}

export type RateCardApplyCommand={requestId:string;unitKeys:string[];clientType:ClientType;planId:string;planVersion:number;effectiveMonth:string;changedAt:string;previewAmount?:string};
export type RateCardApplyAudit={fingerprint:string;requestId:string;batchId:string;effectiveMonth:string;clientType:ClientType;plan:FeePlan;changedAt:string;targets:Array<{unitKey:string;unitName:string;priorPlan:{id:string;name:string;version:number}|null}>};
export function billingRowsMatching(rows:AccountStoreRow[],query:string){const term=query.trim().toLocaleLowerCase();return rows.filter(row=>[row.project,row.storeName,row.entity,...(row.candidates??[]).flatMap(candidate=>[candidate.username,candidate.storeName])].filter(Boolean).join(' ').toLocaleLowerCase().includes(term));}
export function visibleSelection(rows:AccountStoreRow[],selected:string[]){const keys=new Set(rows.map(row=>row.rosterKey??row.id));return [...new Set(selected)].filter(key=>keys.has(key));}
/** Validate the entire batch before creating a new session-memory value. Never touches ledger or locks. */
export function applyRateCardPreview(memory:Record<string,unknown>,rows:AccountStoreRow[],plans:FeePlan[],command:RateCardApplyCommand,data:PreviewRateSource=emptyRateSource):Record<string,unknown>{
 if(!command.requestId||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(command.effectiveMonth)||!Number.isFinite(Date.parse(command.changedAt)))throw Error('Choose an Effective Invoice Month.');
 const keys=[...new Set(command.unitKeys)];if(!keys.length||keys.length!==command.unitKeys.length)throw Error('Choose billing records to update.');
 const fingerprint=JSON.stringify({unitKeys:keys,clientType:command.clientType,planId:command.planId,planVersion:command.planVersion,effectiveMonth:command.effectiveMonth,previewAmount:command.previewAmount});
 const history=(memory['fee-preview-application-history']??[]) as RateCardApplyAudit[];
 const priorRequest=history.find(item=>item.requestId===command.requestId);if(priorRequest){if(priorRequest.fingerprint===fingerprint)return memory;throw Error('This preview request was already used. Review and apply again.');}
 const targets=keys.map(key=>{const row=rows.find(item=>(item.rosterKey??item.id)===key);if(!row)throw Error('A selected record is no longer available. Clear the selection and try again.');return row;});
 if(new Set(targets.map(row=>projectFeeCurrency(row,command.effectiveMonth,data))).size!==1)throw Error('Select records with the same currency for billing. No records were updated.');
 const plan=planForMonth(plans,command.planId,command.effectiveMonth);if(!plan||plan.version!==command.planVersion)throw Error('This rate card changed. Review the card and apply again.');
 if(plan.archivedAt)throw Error('This rate card was deleted. Choose another card.');
 validatePlan(plan);
 if(plan.clientType!==command.clientType||targets.some(row=>plan.currency!==projectFeeCurrency(row,command.effectiveMonth,data)))throw Error('Choose a rate card matching the selected client type and currency.');
 const locks=(memory['fee-preview-locks']??{}) as Record<string,string>;
 const auditTargets=targets.map(row=>{const unitKey=row.rosterKey??row.id;const before=monthlyFeePreview(row,command.effectiveMonth,plans,memory,data);if(locks[`${command.effectiveMonth}:${unitKey}`])throw Error(`${row.project||row.storeName} is locked for ${command.effectiveMonth}. No records were updated.`);if(before.choice.clientType&&before.choice.clientType!==command.clientType)throw Error(`${row.project||row.storeName} has a different client type. No records were updated.`);return {unitKey,unitName:row.project||row.storeName,priorPlan:before.plan?{id:before.plan.id,name:before.plan.name,version:before.plan.version}:null};});
 if(command.previewAmount!==undefined){if(keys.length!==1)throw Error('Calculation amounts can only be entered for one record.');if(command.previewAmount!==''||plan.rule.type==='fixed')calculateProjectPreview(targets[0],command.effectiveMonth,plan,command.previewAmount,data);}
 const assignments=(memory['fee-preview-assignments-v2']??{}) as Record<string,FeePreviewAssignment[]>;
 const nextAssignments={...assignments};for(const key of keys)nextAssignments[key]=[...(assignments[key]??[]).filter(value=>value.effectiveMonth!==command.effectiveMonth),{effectiveMonth:command.effectiveMonth,clientType:command.clientType,planId:plan.id}];
 const audit:RateCardApplyAudit={fingerprint,requestId:command.requestId,batchId:command.requestId,effectiveMonth:command.effectiveMonth,clientType:command.clientType,plan:structuredClone(plan),changedAt:command.changedAt,targets:auditTargets};
 const next:Record<string,unknown>={...memory,'fee-preview-assignments-v2':nextAssignments,'fee-preview-application-history':[audit,...history]};
 if(command.previewAmount!==undefined){const amounts=(memory['fee-preview-amounts']??{}) as Record<string,string>;next['fee-preview-amounts']={...amounts,[`${command.effectiveMonth}:${keys[0]}`]:command.previewAmount};}
 return next;
}
