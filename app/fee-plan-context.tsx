"use client";
import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import rateMappingPreview from './account-rate-mapping-preview.json';
import type { AccountStoreRow } from './account-contract';
import { calculateFee, planForMonth, seedFeePlans, validatePlan, type ClientType, type FeeCalculation, type FeePlan, type FeePlanDraft } from './fee-plan-model';
export type FeePreviewChoice={clientType:''|ClientType;planId:string};
export type FeePreviewAssignment=FeePreviewChoice&{effectiveMonth:string};
export type FeePreviewSnapshot={id:string;month:string;unitKey:string;unitName:string;plan:FeePlan;amount:string;result:FeeCalculation;createdAt:string};
export type FeeWorkspaceRequest={view:'settings'|'assignment'|'bulk';month:string;unitKey?:string;unitKeys?:string[]};
type FeePlansContextValue={feeWorkspace:FeeWorkspaceRequest|null;openFeeWorkspace:(request:FeeWorkspaceRequest)=>void;closeFeeWorkspace:()=>void;previewRows:AccountStoreRow[];mergePreviewRows:(rows:AccountStoreRow[])=>void;plans:FeePlan[];upsertPlan:(draft:FeePlanDraft)=>void;previewMemory:Record<string,unknown>;setPreviewMemory:Dispatch<SetStateAction<Record<string,unknown>>>};
const FeePlansContext=createContext<FeePlansContextValue|null>(null);
export function FeePlansProvider({children}:{children:ReactNode}){
 const [feeWorkspace,setFeeWorkspace]=useState<FeeWorkspaceRequest|null>(null);
 const openFeeWorkspace=useCallback((request:FeeWorkspaceRequest)=>setFeeWorkspace(request),[]);
 const closeFeeWorkspace=useCallback(()=>setFeeWorkspace(null),[]);
 const [plans,setPlans]=useState<FeePlan[]>(()=>seedFeePlans());
 const [previewRows,setPreviewRows]=useState<AccountStoreRow[]>([]);
 const mergePreviewRows=useCallback((rows:AccountStoreRow[])=>{if(!rows.length)return;setPreviewRows(current=>[...new Map([...current,...rows].map(row=>[row.rosterKey??row.id,row])).values()]);},[]);
 const [previewMemory,setPreviewMemory]=useState<Record<string,unknown>>({});
 function upsertPlan(draft:FeePlanDraft){const checked=validatePlan(draft);const existing=plans.find(plan=>plan.id===checked.id);if(existing&&(existing.currency!==checked.currency||existing.clientType!==checked.clientType))throw Error('Copy the plan to use a different client type or currency.');setPlans(current=>[...current,{...checked,version:Math.max(0,...current.filter(p=>p.id===checked.id).map(p=>p.version))+1}]);}
 return <FeePlansContext.Provider value={{feeWorkspace,openFeeWorkspace,closeFeeWorkspace,previewRows,mergePreviewRows,plans,upsertPlan,previewMemory,setPreviewMemory}}>{children}</FeePlansContext.Provider>;
}
export function useFeePlans(){const context=useContext(FeePlansContext);if(!context)throw Error('FeePlansProvider is required');return context;}

/** Tab-memory only: survives module navigation, resets on page reload, never writes financial records. */
export function useFeePreviewState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const {previewMemory,setPreviewMemory}=useFeePlans();
 const value=(key in previewMemory?previewMemory[key]:initial) as T;
 const update:Dispatch<SetStateAction<T>>=(next)=>setPreviewMemory(previous=>{const current=(key in previous?previous[key]:initial) as T;return {...previous,[key]:typeof next==='function'?(next as (value:T)=>T)(current):next};});
 return [value,update];
}

/** Source-derived preview only: exact project identity and MYR; no name inference or DB assignment. */
export function sourceRateCardDefault(row:AccountStoreRow,month:string):FeePreviewAssignment|undefined{
 if(row.previewRateDefaultsEligible!==true)return undefined;
 const matches=rateMappingPreview.records.filter(record=>record.rosterKey===row.rosterKey&&record.project===row.project&&record.currency==='MYR'&&row.currency==='MYR'&&record.effectiveMonth<=month);
 if(matches.length!==1)return undefined;
 const record=matches[0];
 if(!['Internal','External'].includes(record.clientType)||!record.planId)return undefined;
 return {effectiveMonth:record.effectiveMonth,clientType:record.clientType as ClientType,planId:record.planId};
}

/** One read path powers Billing records and the row editor; no invoice totals are changed. */
export function monthlyFeePreview(row:AccountStoreRow,month:string,plans:FeePlan[],memory:Record<string,unknown>){
 const key=row.rosterKey??row.id;
 const assignments=(memory['fee-preview-assignments-v2']??{}) as Record<string,FeePreviewAssignment[]>;
 const choice=(assignments[key]??[]).filter(v=>v.effectiveMonth<=month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)).at(-1)??sourceRateCardDefault(row,month)??{clientType:'',planId:''};
 const history=(memory['fee-preview-history']??[]) as FeePreviewSnapshot[];
 const locks=(memory['fee-preview-locks']??{}) as Record<string,string>;
 const locked=history.find(snapshot=>snapshot.id===locks[`${month}:${key}`]);
 const selected=choice.planId?planForMonth(plans,choice.planId,month):undefined;
 const plan=locked?.plan??(selected?.currency===row.currency&&selected.clientType===choice.clientType?selected:undefined);
 const amounts=(memory['fee-preview-amounts']??{}) as Record<string,string>;
 const amount=locked?.amount??amounts[`${month}:${key}`]??'';
 let calculation=locked?.result;
 if(!locked&&plan&&(amount!==''||plan.rule.type==='fixed')){try{calculation=calculateFee(plan.rule,amount||'0');}catch{calculation=undefined;}}
 const nextEffectiveMonth=(assignments[key]??[]).filter(v=>v.effectiveMonth>month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)).at(0)?.effectiveMonth;
 return {choice,plan,amount,calculation,locked,nextEffectiveMonth};
}
export function useMonthlyFeePreview(row:AccountStoreRow,month:string){const {plans,previewMemory}=useFeePlans();return monthlyFeePreview(row,month,plans,previewMemory);}

export type RateCardApplyCommand={requestId:string;unitKeys:string[];clientType:ClientType;planId:string;planVersion:number;effectiveMonth:string;changedAt:string;previewAmount?:string};
export type RateCardApplyAudit={fingerprint:string;requestId:string;batchId:string;effectiveMonth:string;clientType:ClientType;plan:FeePlan;changedAt:string;targets:Array<{unitKey:string;unitName:string;priorPlan:{id:string;name:string;version:number}|null}>};
export function billingRowsMatching(rows:AccountStoreRow[],query:string){const term=query.trim().toLocaleLowerCase();return rows.filter(row=>[row.project,row.storeName,row.entity,...(row.candidates??[]).flatMap(candidate=>[candidate.username,candidate.storeName])].filter(Boolean).join(' ').toLocaleLowerCase().includes(term));}
export function visibleSelection(rows:AccountStoreRow[],selected:string[]){const keys=new Set(rows.map(row=>row.rosterKey??row.id));return [...new Set(selected)].filter(key=>keys.has(key));}
/** Validate the entire batch before creating a new session-memory value. Never touches ledger or locks. */
export function applyRateCardPreview(memory:Record<string,unknown>,rows:AccountStoreRow[],plans:FeePlan[],command:RateCardApplyCommand):Record<string,unknown>{
 if(!command.requestId||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(command.effectiveMonth)||!Number.isFinite(Date.parse(command.changedAt)))throw Error('Choose an Effective Invoice Month.');
 const keys=[...new Set(command.unitKeys)];if(!keys.length||keys.length!==command.unitKeys.length)throw Error('Choose billing records to update.');
 const fingerprint=JSON.stringify({unitKeys:keys,clientType:command.clientType,planId:command.planId,planVersion:command.planVersion,effectiveMonth:command.effectiveMonth,previewAmount:command.previewAmount});
 const history=(memory['fee-preview-application-history']??[]) as RateCardApplyAudit[];
 const priorRequest=history.find(item=>item.requestId===command.requestId);if(priorRequest){if(priorRequest.fingerprint===fingerprint)return memory;throw Error('This preview request was already used. Review and apply again.');}
 const targets=keys.map(key=>{const row=rows.find(item=>(item.rosterKey??item.id)===key);if(!row)throw Error('A selected record is no longer available. Clear the selection and try again.');return row;});
 if(new Set(targets.map(row=>row.currency)).size!==1)throw Error('Select records with the same currency. No records were updated.');
 const plan=planForMonth(plans,command.planId,command.effectiveMonth);if(!plan||plan.version!==command.planVersion)throw Error('This rate card changed. Review the card and apply again.');
 validatePlan(plan);
 if(plan.clientType!==command.clientType||plan.currency!==targets[0].currency)throw Error('Choose a rate card matching the selected client type and currency.');
 const locks=(memory['fee-preview-locks']??{}) as Record<string,string>;
 const auditTargets=targets.map(row=>{const unitKey=row.rosterKey??row.id;const before=monthlyFeePreview(row,command.effectiveMonth,plans,memory);if(locks[`${command.effectiveMonth}:${unitKey}`])throw Error(`${row.project||row.storeName} is locked for ${command.effectiveMonth}. No records were updated.`);if(before.choice.clientType&&before.choice.clientType!==command.clientType)throw Error(`${row.project||row.storeName} has a different client type. No records were updated.`);return {unitKey,unitName:row.project||row.storeName,priorPlan:before.plan?{id:before.plan.id,name:before.plan.name,version:before.plan.version}:null};});
 if(command.previewAmount!==undefined){if(keys.length!==1)throw Error('Calculation amounts can only be entered for one record.');if(command.previewAmount!==''||plan.rule.type==='fixed')calculateFee(plan.rule,command.previewAmount);}
 const assignments=(memory['fee-preview-assignments-v2']??{}) as Record<string,FeePreviewAssignment[]>;
 const nextAssignments={...assignments};for(const key of keys)nextAssignments[key]=[...(assignments[key]??[]).filter(value=>value.effectiveMonth!==command.effectiveMonth),{effectiveMonth:command.effectiveMonth,clientType:command.clientType,planId:plan.id}];
 const audit:RateCardApplyAudit={fingerprint,requestId:command.requestId,batchId:command.requestId,effectiveMonth:command.effectiveMonth,clientType:command.clientType,plan:structuredClone(plan),changedAt:command.changedAt,targets:auditTargets};
 const next:Record<string,unknown>={...memory,'fee-preview-assignments-v2':nextAssignments,'fee-preview-application-history':[audit,...history]};
 if(command.previewAmount!==undefined){const amounts=(memory['fee-preview-amounts']??{}) as Record<string,string>;next['fee-preview-amounts']={...amounts,[`${command.effectiveMonth}:${keys[0]}`]:command.previewAmount};}
 return next;
}
