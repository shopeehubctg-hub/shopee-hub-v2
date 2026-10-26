"use client";

import type { AccountFeeRule } from "./account-contract";
import { validateFeeRule } from "./account-settings-model";

export type AccountSetupDraft = {
  legalEntity: string;
  effectiveMonth: string;
  type: AccountFeeRule["type"];
  basis: AccountFeeRule["basis"] | "";
  basisLabel: string;
  fixedAmount: string;
  percent: string;
  tiers: Array<{ from: string; percent: string }>;
  minimum: string;
  cap: string;
};

export function malaysiaMonth() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}

export function emptyAccountSetup(): AccountSetupDraft {
  return { legalEntity: "", effectiveMonth: malaysiaMonth(), type: "fixed", basis: "", basisLabel: "", fixedAmount: "", percent: "", tiers: [{ from: "0", percent: "" }], minimum: "", cap: "" };
}

export function feeRuleFromDraft(draft: AccountSetupDraft, market: "MY" | "SG"): AccountFeeRule {
  const currency = market === "MY" ? "MYR" : "SGD";
  if (draft.type === "fixed") return { type: "fixed", currency, basis: "fixed_monthly", fixedAmount: draft.fixedAmount.trim() };
  const rule: AccountFeeRule = { type: draft.type, currency, basis: draft.basis as AccountFeeRule["basis"] };
  if (draft.basis === "custom") rule.basisLabel = draft.basisLabel.trim();
  if (draft.type === "percent") rule.percent = draft.percent.trim();
  else rule.tiers = draft.tiers.map(tier => ({ from: tier.from.trim(), percent: tier.percent.trim() }));
  if (draft.minimum.trim()) rule.minimum = draft.minimum.trim();
  if (draft.cap.trim()) rule.cap = draft.cap.trim();
  return rule;
}

export function accountSetupError(draft: AccountSetupDraft, market: "MY" | "SG") {
  if (!draft.legalEntity.trim() || draft.legalEntity.trim().length > 240) return "Enter the legal company / entity name.";
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(draft.effectiveMonth) || draft.effectiveMonth < malaysiaMonth()) return "Choose the current or a future invoice month.";
  try { validateFeeRule(feeRuleFromDraft(draft, market), market === "MY" ? "MYR" : "SGD"); }
  catch (error) { return error instanceof Error ? error.message : "Check the monthly fee rule."; }
  return "";
}

export function AccountSetupFields({ draft, market, update }: { draft: AccountSetupDraft; market: "MY" | "SG"; update: (patch: Partial<AccountSetupDraft>) => void }) {
  const currency = market === "MY" ? "MYR" : "SGD";
  return <fieldset className="account-rate-fields">
    <legend>Account setup</legend>
    <label className="account-field-wide">Company name<input maxLength={240} required value={draft.legalEntity} onChange={event => update({ legalEntity: event.target.value })} /></label>
    <label>Effective invoice month<input type="month" min={malaysiaMonth()} required value={draft.effectiveMonth} onChange={event => update({ effectiveMonth: event.target.value })} /></label>
    <label>Currency<input readOnly value={currency} /></label>
    <label>Monthly fee rule<select value={draft.type} onChange={event => update({ type: event.target.value as AccountSetupDraft["type"] })}><option value="fixed">Fixed monthly fee</option><option value="percent">Commission percentage</option><option value="tiers">Tiered commission</option></select></label>
    {draft.type === "fixed" ? <label>Monthly fee ({currency})<input inputMode="decimal" placeholder="0.00" value={draft.fixedAmount} onChange={event => update({ fixedAmount: event.target.value })} required /></label> : <>
      <label>Calculated on<select value={draft.basis} onChange={event => update({ basis: event.target.value as AccountSetupDraft["basis"] })} required><option value="">Choose amount basis</option><option value="merchandise_subtotal">Merchandise subtotal</option><option value="net_gmv">Net GMV</option><option value="statement_amount">Statement amount</option><option value="custom">Other amount</option></select></label>
      {draft.basis === "custom" && <label className="account-field-wide">Describe amount basis<input maxLength={120} value={draft.basisLabel} onChange={event => update({ basisLabel: event.target.value })} required /></label>}
      {draft.type === "percent" ? <label>Commission rate %<input inputMode="decimal" value={draft.percent} onChange={event => update({ percent: event.target.value })} required /></label> : <div className="account-tier-fields account-field-wide"><span>Tier rates (up to 20)</span>{draft.tiers.map((tier, index) => <div key={index}><label>From {currency}<input inputMode="decimal" value={tier.from} onChange={event => update({ tiers: draft.tiers.map((item, position) => position === index ? { ...item, from: event.target.value } : item) })} required /></label><label>Rate %<input inputMode="decimal" value={tier.percent} onChange={event => update({ tiers: draft.tiers.map((item, position) => position === index ? { ...item, percent: event.target.value } : item) })} required /></label>{draft.tiers.length > 1 && <button type="button" onClick={() => update({ tiers: draft.tiers.filter((_, position) => position !== index) })}>Remove</button>}</div>)}<button type="button" disabled={draft.tiers.length >= 20} onClick={() => update({ tiers: [...draft.tiers, { from: "", percent: "" }] })}>+ Add tier</button><small>Start the first tier at 0; each next threshold must increase.</small></div>}
      <label>Minimum fee (optional)<input inputMode="decimal" value={draft.minimum} onChange={event => update({ minimum: event.target.value })} /></label>
      <label>Maximum fee (optional)<input inputMode="decimal" value={draft.cap} onChange={event => update({ cap: event.target.value })} /></label>
    </>}
  </fieldset>;
}
