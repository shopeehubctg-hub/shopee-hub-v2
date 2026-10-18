"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AccountFeeRule, AccountResponse, AccountStoreRow } from "./account-contract";

type StoreOption = NonNullable<AccountResponse["storeOptions"]>[number];
type Basis = AccountFeeRule["basis"];
type RuleType = AccountFeeRule["type"];
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

export function RateCell({ row, editable, available, onEdit }: { row: AccountStoreRow; editable: boolean; available: boolean; onEdit: () => void }) {
  return <div className="account-rate-cell"><strong>{rateLabel(row.rateRule)}</strong>{row.rateRule && row.rateEffectiveMonth && <small>From {row.rateEffectiveMonth}</small>}{(available || row.rateRule || row.rateHistory?.length) && <button type="button" className="account-link-button" onClick={onEdit}>{editable ? row.rateRule ? "View / edit rate" : "Set rate" : "View rate"}</button>}</div>;
}

export function RateDialog({ row, month, today, editable, canSave, onClose, onSaved }: {
  row: AccountStoreRow; month: string; today: string; editable: boolean; canSave: boolean; onClose: () => void; onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const existing = row.rateRule;
  const [type, setType] = useState<RuleType>(existing?.type || "fixed");
  const [basis, setBasis] = useState<Basis | "">(existing?.basis === "fixed_monthly" ? "" : existing?.basis || "");
  const [basisLabel, setBasisLabel] = useState(existing?.basisLabel || "");
  const [fixedAmount, setFixedAmount] = useState(existing?.fixedAmount || "");
  const [percent, setPercent] = useState(existing?.percent || "");
  const [tiers, setTiers] = useState(existing?.tiers?.length ? existing.tiers : [{ from: "0", percent: "" }]);
  const [minimum, setMinimum] = useState(existing?.minimum || "");
  const [cap, setCap] = useState(existing?.cap || "");
  const [effectiveMonth, setEffectiveMonth] = useState(month < today.slice(0, 7) ? today.slice(0, 7) : month);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !row.rosterKey) return;
    const rule: AccountFeeRule = { type, currency: row.currency, basis: type === "fixed" ? "fixed_monthly" : basis as Basis };
    if (type === "fixed") rule.fixedAmount = fixedAmount;
    else {
      if (basis === "custom") rule.basisLabel = basisLabel.trim();
      if (type === "percent") rule.percent = percent;
      else rule.tiers = tiers;
      if (minimum.trim()) rule.minimum = minimum.trim();
      if (cap.trim()) rule.cap = cap.trim();
    }
    setSaving(true); setError("");
    try {
      const payload = JSON.stringify({ rosterKey: row.rosterKey, effectiveMonth, rule, expectedVersion: row.latestSettingsVersion || "0" });
      if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
      await saveSetting("/api/admin/account/fee-rule", { rosterKey: row.rosterKey, effectiveMonth, rule, expectedVersion: row.latestSettingsVersion || "0", requestId: retry.current.id });
      retry.current = null;
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialogRef} className="account-rate-dialog" aria-labelledby="account-rate-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}><form onSubmit={event => void save(event)}><header><div><p className="kicker">BILLING PROJECT · {row.project}</p><h3 id="account-rate-title">{existing ? "Monthly rate" : "Set monthly rate"}</h3></div><button type="button" className="account-dialog-close" onClick={onClose} disabled={saving} aria-label="Close rate editor">×</button></header><div className="account-rate-body"><p className="account-rate-explainer">Set the rate that applies from an invoice month. Rate versions stay in the history. This does not record money received.</p><div className="account-rate-fields"><label>Effective invoice month<input type="month" value={effectiveMonth} min={today.slice(0, 7)} onChange={event => setEffectiveMonth(event.target.value)} required disabled={!editable || saving} /></label><label>Currency<input type="text" value={row.currency} readOnly /></label><label>Rate type<select value={type} onChange={event => setType(event.target.value as RuleType)} disabled={!editable || saving}><option value="fixed">Fixed monthly fee</option><option value="percent">Commission percentage</option><option value="tiers">Tiered commission</option></select></label>{type === "fixed" ? <label>Monthly fee<input type="text" inputMode="decimal" value={fixedAmount} onChange={event => setFixedAmount(event.target.value)} placeholder="0.00" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={!editable || saving} /></label> : <><label>Calculated on<select value={basis} onChange={event => setBasis(event.target.value as Basis)} required disabled={!editable || saving}><option value="">Choose amount basis</option>{bases.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{basis === "custom" && <label className="account-field-wide">Describe amount basis<input type="text" value={basisLabel} onChange={event => setBasisLabel(event.target.value)} placeholder="e.g. net sales after returns" required disabled={!editable || saving} /></label>}{type === "percent" ? <label>Commission rate %<input type="text" inputMode="decimal" value={percent} onChange={event => setPercent(event.target.value)} placeholder="0" pattern="[0-9]+(\.[0-9]{1,6})?" required disabled={!editable || saving} /></label> : <div className="account-tier-fields account-field-wide"><span>Tier rates</span>{tiers.map((tier, index) => <div key={index}><label>From {row.currency}<input type="text" inputMode="decimal" value={tier.from} onChange={event => setTiers(current => current.map((item, i) => i === index ? { ...item, from: event.target.value } : item))} required disabled={!editable || saving} /></label><label>Rate %<input type="text" inputMode="decimal" value={tier.percent} onChange={event => setTiers(current => current.map((item, i) => i === index ? { ...item, percent: event.target.value } : item))} required disabled={!editable || saving} /></label>{editable && tiers.length > 1 && <button type="button" onClick={() => setTiers(current => current.filter((_, i) => i !== index))} aria-label={`Remove tier ${index + 1}`}>Remove</button>}</div>)}{editable && <button type="button" className="account-link-button" onClick={() => setTiers(current => [...current, { from: "", percent: "" }])}>Add tier</button>}<small>Start the first tier at 0. Each tier continues until the next threshold.</small></div>}<label>Minimum fee (optional)<input type="text" inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value)} placeholder="No minimum" disabled={!editable || saving} /></label><label>Maximum fee (optional)<input type="text" inputMode="decimal" value={cap} onChange={event => setCap(event.target.value)} placeholder="No maximum" disabled={!editable || saving} /></label></>}</div>{row.rateHistory && row.rateHistory.length > 0 && <details className="account-rate-history"><summary>History ({row.rateHistory.length})</summary><ul>{row.rateHistory.map(item => <li key={item.version}><b>{item.effectiveMonth}</b><span>{rateLabel(item.rule)}</span></li>)}</ul></details>}{!editable && <p className="account-notice">Past invoice months are read only. Choose the current or a future month to set a new rate.</p>}{editable && !canSave && <p className="account-notice">Saving is unavailable in this preview.</p>}{error && <p className="account-inline-error" role="alert">{error}</p>}</div><footer><button type="button" onClick={onClose} disabled={saving}>Close</button>{editable && <button type="submit" className="account-save-button" disabled={!canSave || saving || !row.rosterKey}>{saving ? "Saving…" : "Save rate"}</button>}</footer></form></dialog>;
}
