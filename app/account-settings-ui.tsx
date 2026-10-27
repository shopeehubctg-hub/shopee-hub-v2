"use client";

import { useEffect, useRef, useState } from "react";
import { accountMoney } from './account-display';
import { useMonthlyFeePreview } from './fee-plan-context';
import type { FormEvent } from "react";
import type { AccountFeeRule, AccountResponse, AccountStoreRow } from "./account-contract";

type StoreOption = NonNullable<AccountResponse["storeOptions"]>[number];
type Basis = AccountFeeRule["basis"];
const bases: Array<{ value: Basis; label: string }> = [
  { value: "merchandise_subtotal", label: "Merchandise subtotal" },
  { value: "net_gmv", label: "Net GMV" },
  { value: "statement_amount", label: "Statement amount" },
  { value: "custom", label: "Other amount" },
];
const basisName = (rule: AccountFeeRule) => rule.basis === "custom" ? rule.basisLabel || "Other amount" : bases.find(item => item.value === rule.basis)?.label || "Monthly fee";
export function rateLabel(rule: AccountFeeRule | null | undefined) {
  if (!rule) return "—";
  if (rule.type === "fixed") return `${rule.currency} ${rule.fixedAmount || "—"} per month`;
  if (rule.type === "percent") return `${rule.percent || "—"}% of ${basisName(rule)}`;
  const tiers = rule.tiers || [];
  const preview = tiers.slice(0, 2).map(tier => `${tier.from}+ ${tier.percent}%`).join(" · ");
  return `${preview}${tiers.length > 2 ? ` · +${tiers.length - 2} more` : ""} of ${basisName(rule)}`;
}

async function saveSetting(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return;
  const detail = await response.json().catch(() => null) as { error?: string } | null;
  if (response.status === 409) throw new Error("This record changed. Refresh and try again.");
  if (response.status === 403) throw new Error("Super Admin access is required.");
  if (response.status === 503) throw new Error(detail?.error || "Saving is unavailable right now. Please try again later.");
  throw new Error(detail?.error || "Could not save. Check the details and try again.");
}

export function StoreNameCell({ row, options, configurable, canSave, month, onSaved }: {
  row: AccountStoreRow; options: StoreOption[]; configurable: boolean; canSave: boolean; month: string; onSaved: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [selectedId, setSelectedId] = useState(row.storeId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const candidates = [...new Map((row.candidates ?? []).filter(item => item.storeId).map(item => [item.storeId, item])).values()];
  const currentNames = row.storeId ? [row.storeName] : candidates.map(item => item.storeName);
  const needsChoice = currentNames.length !== 1;
  const showEditor = configurable && (needsChoice || changing);
  async function save() {
    if (!canSave || !selectedId || !row.rosterKey) return;
    setSaving(true); setError("");
    try {
      const payload = JSON.stringify({ rosterKey: row.rosterKey, storeId: selectedId, effectiveMonth: month, expectedVersion: row.latestSettingsVersion || "0" });
      if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
      await saveSetting("/api/admin/account/mapping", {
        rosterKey: row.rosterKey, storeId: selectedId, effectiveMonth: month,
        expectedVersion: row.latestSettingsVersion || "0", requestId: retry.current.id,
      });
      retry.current = null; setChanging(false); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setSaving(false); }
  }
  return <div className="account-store-editor">
    {!showEditor && <div className="account-store-names">{currentNames.length ? currentNames.map(name => <span key={name}>{name}</span>) : "—"}</div>}
    {showEditor && <>{currentNames.length > 1 && <div className="account-store-names">{currentNames.map(name => <span key={name}>{name}</span>)}</div>}<div className="account-store-pick"><label className="sr-only" htmlFor={`account-store-${row.id}`}>Store for {row.project}</label><select id={`account-store-${row.id}`} value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={saving}><option value="">Select store</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><button type="button" disabled={!canSave || !selectedId || saving || !row.rosterKey} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>{changing && <button type="button" className="account-link-button" disabled={saving} onClick={() => { setChanging(false); setSelectedId(row.storeId || ""); setError(""); }}>Cancel</button>}</div></>}
    {!showEditor && configurable && currentNames.length === 1 && <button type="button" className="account-link-button" onClick={() => { setSelectedId(row.storeId || candidates[0]?.storeId || ""); setChanging(true); }}>Change store</button>}
    {error && <small className="account-inline-error" role="alert">{error}</small>}
  </div>;
}

export function RateCell({row,month,onEdit}:{row:AccountStoreRow;month:string;onEdit:()=>void}) {
  const preview=useMonthlyFeePreview(row,month);
  const rule=preview.plan?.rule;
  const compact=rule?.type==='fixed'?`${rule.currency} ${rule.fixedAmount||'—'} / month`:rule?.type==='percent'?`${rule.percent||'—'}%`:rule?.tiers?.length?rule.tiers.map(t=>`${t.percent}%`).join(' / '):'Set tier rates';
  return <button type="button" className="account-rate-field" aria-label={`Edit monthly rate for ${row.project||row.storeName}`} onClick={onEdit}>
    <strong>{preview.plan?preview.plan.name:rateLabel(row.rateRule)}</strong>
    {preview.plan?<small>{preview.calculation?.rateLabel||compact} · v{preview.plan.version} <span className="account-preview-label">{preview.locked?'Locked preview':'Preview'}</span></small>:row.rateRule?<small>Saved rate{row.rateEffectiveMonth?` · from ${row.rateEffectiveMonth}`:''}</small>:<small>Set rate</small>}
    {preview.conversion?.inputCurrency!==preview.conversion?.outputCurrency&&preview.conversion&&<small>SGD → MYR{preview.conversion.fxRate?` · × ${preview.conversion.fxRate}`:' · FX pending'}</small>}
    {preview.nextEffectiveMonth&&<small>Scheduled from {preview.nextEffectiveMonth}</small>}
  </button>;
}

export function CompanyCell({row,month,canSave,editable,onSaved}:{row:AccountStoreRow;month:string;canSave:boolean;editable:boolean;onSaved:()=>void}) {
  const [editing,setEditing]=useState(false);
  const [entity,setEntity]=useState(row.entity||'');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const retry=useRef<{payload:string;id:string}|null>(null);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!canSave||!row.rosterKey)return;
    setSaving(true);setError('');
    try{
      const body={rosterKey:row.rosterKey,entity:entity.trim(),effectiveMonth:month,expectedVersion:row.latestSettingsVersion||'0'};
      const payload=JSON.stringify(body);
      if(retry.current?.payload!==payload)retry.current={payload,id:crypto.randomUUID()};
      await saveSetting('/api/admin/account/company',{...body,requestId:retry.current.id});
      retry.current=null;setEditing(false);onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save company.');}
    finally{setSaving(false);}
  }
  return <div className="account-company-cell">{editing?<form onSubmit={event=>void save(event)}><label className="sr-only" htmlFor={`company-${row.id}`}>Company name for {row.project}</label><input id={`company-${row.id}`} value={entity} onChange={event=>setEntity(event.target.value)} maxLength={240} required disabled={saving}/><div><button type="submit" disabled={!canSave||saving}>{saving?'Saving…':'Save'}</button><button type="button" disabled={saving} onClick={()=>{setEditing(false);setError('');}}>Cancel</button></div></form>:<><strong>{row.entity||'—'}</strong>{editable&&<button type="button" className="account-link-button" onClick={()=>{setEntity(row.entity||'');setEditing(true);}}>Edit company</button>}</>}{error&&<small role="alert" className="account-inline-error">{error}</small>}</div>;
}

export function RecordDetails({row,month,canConfigure,canSave,options,onClose,onSaved}:{row:AccountStoreRow;month:string;canConfigure:boolean;canSave:boolean;options:StoreOption[];onClose:()=>void;onSaved:()=>void}) {
  const dialogRef=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=dialogRef.current;dialog?.showModal();return ()=>{if(dialog?.open)dialog.close();};},[]);
  return <dialog className="account-record-dialog" ref={dialogRef} aria-labelledby="account-record-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <header><div><h3 id="account-record-title">{row.project||row.storeName}</h3><p>{row.market==='SG'?'Singapore':'Malaysia'} · {row.currency}</p></div><button type="button" className="account-record-close" aria-label="Close billing record" onClick={onClose}>×</button></header>
    <div className="account-record-body"><dl className="account-record-fields">
      <div><dt>Company</dt><dd><CompanyCell row={row} month={month} canSave={canSave} editable={canConfigure} onSaved={onSaved}/></dd></div>
      <div><dt>Store</dt><dd><StoreNameCell row={row} options={options} month={month} canSave={canSave} configurable={canConfigure} onSaved={onSaved}/></dd></div>
      <div><dt>Invoice month</dt><dd>{row.invoiceMonth||'Not set'}</dd></div>
      <div><dt>Report month</dt><dd>{row.statementMonth||'Not set'}<small>Fee calculation reference</small></dd></div>

      <div><dt>Expected net fee</dt><dd>{accountMoney(row.expectedNetFee,row.currency)}</dd></div>
    </dl>{!canSave&&canConfigure&&<p className="account-detail-note">Company and store changes cannot be saved in this preview.</p>}</div>
    <footer><button type="button" onClick={onClose}>Close</button></footer>
  </dialog>;
}
