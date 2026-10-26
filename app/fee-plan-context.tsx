"use client";
import { createContext, useContext, useState, useCallback, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import type { AccountStoreRow } from './account-contract';
import { seedFeePlans, validatePlan, type FeePlan, type FeePlanDraft } from './fee-plan-model';
type FeePlansContextValue={previewRows:AccountStoreRow[];mergePreviewRows:(rows:AccountStoreRow[])=>void;plans:FeePlan[];upsertPlan:(draft:FeePlanDraft)=>void;previewMemory:Record<string,unknown>;setPreviewMemory:Dispatch<SetStateAction<Record<string,unknown>>>};
const FeePlansContext=createContext<FeePlansContextValue|null>(null);
export function FeePlansProvider({children}:{children:ReactNode}){
 const [plans,setPlans]=useState<FeePlan[]>(()=>seedFeePlans());
 const [previewRows,setPreviewRows]=useState<AccountStoreRow[]>([]);
 const mergePreviewRows=useCallback((rows:AccountStoreRow[])=>{if(!rows.length)return;setPreviewRows(current=>[...new Map([...current,...rows].map(row=>[row.rosterKey??row.id,row])).values()]);},[]);
 const [previewMemory,setPreviewMemory]=useState<Record<string,unknown>>({});
 function upsertPlan(draft:FeePlanDraft){const checked=validatePlan(draft);const existing=plans.find(plan=>plan.id===checked.id);if(existing&&(existing.currency!==checked.currency||existing.clientType!==checked.clientType))throw Error('Copy the plan to use a different client type or currency.');setPlans(current=>[...current,{...checked,version:Math.max(0,...current.filter(p=>p.id===checked.id).map(p=>p.version))+1}]);}
 return <FeePlansContext.Provider value={{previewRows,mergePreviewRows,plans,upsertPlan,previewMemory,setPreviewMemory}}>{children}</FeePlansContext.Provider>;
}
export function useFeePlans(){const context=useContext(FeePlansContext);if(!context)throw Error('FeePlansProvider is required');return context;}

/** Tab-memory only: survives module navigation, resets on page reload, never writes financial records. */
export function useFeePreviewState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const {previewMemory,setPreviewMemory}=useFeePlans();
 const value=(key in previewMemory?previewMemory[key]:initial) as T;
 const update:Dispatch<SetStateAction<T>>=(next)=>setPreviewMemory(previous=>{const current=(key in previous?previous[key]:initial) as T;return {...previous,[key]:typeof next==='function'?(next as (value:T)=>T)(current):next};});
 return [value,update];
}
