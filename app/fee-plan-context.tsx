"use client";
import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import type { AccountStoreRow } from './account-contract';
import { calculateFee, planForMonth, seedFeePlans, validatePlan, type ClientType, type FeeCalculation, type FeePlan, type FeePlanDraft } from './fee-plan-model';
export type FeePreviewChoice={clientType:''|ClientType;planId:string};
export type FeePreviewAssignment=FeePreviewChoice&{effectiveMonth:string};
export type FeePreviewSnapshot={id:string;month:string;unitKey:string;unitName:string;plan:FeePlan;amount:string;result:FeeCalculation;createdAt:string};
export type FeeWorkspaceRequest={view:'settings'|'assignment';month:string;unitKey?:string};
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

/** One read path powers Billing records and the row editor; no invoice totals are changed. */
export function monthlyFeePreview(row:AccountStoreRow,month:string,plans:FeePlan[],memory:Record<string,unknown>){
 const key=row.rosterKey??row.id;
 const assignments=(memory['fee-preview-assignments-v2']??{}) as Record<string,FeePreviewAssignment[]>;
 const choice=(assignments[key]??[]).filter(v=>v.effectiveMonth<=month).sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth)).at(-1)??{clientType:'',planId:''};
 const history=(memory['fee-preview-history']??[]) as FeePreviewSnapshot[];
 const locks=(memory['fee-preview-locks']??{}) as Record<string,string>;
 const locked=history.find(snapshot=>snapshot.id===locks[`${month}:${key}`]);
 const selected=choice.planId?planForMonth(plans,choice.planId,month):undefined;
 const plan=locked?.plan??(selected?.currency===row.currency&&selected.clientType===choice.clientType?selected:undefined);
 const amounts=(memory['fee-preview-amounts']??{}) as Record<string,string>;
 const amount=locked?.amount??amounts[`${month}:${key}`]??'';
 let calculation=locked?.result;
 if(!locked&&plan&&(amount!==''||plan.rule.type==='fixed')){try{calculation=calculateFee(plan.rule,amount||'0');}catch{calculation=undefined;}}
 return {choice,plan,amount,calculation,locked};
}
export function useMonthlyFeePreview(row:AccountStoreRow,month:string){const {plans,previewMemory}=useFeePlans();return monthlyFeePreview(row,month,plans,previewMemory);}
