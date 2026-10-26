"use client";

import type { AccountFeeRule } from "./account-contract";
import { validateFeeRule } from "./account-settings-model";
import { useFeePlans } from "./fee-plan-context";
import { currentPlanVersions } from "./fee-plan-model";

export type AccountSetupDraft = {
  legalEntity: string;
  effectiveMonth: string;
  clientType: "" | "Internal" | "External";
  planId: string;
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
  return { legalEntity: "", effectiveMonth: malaysiaMonth(), clientType: "", planId: "custom", type: "fixed", basis: "", basisLabel: "", fixedAmount: "", percent: "", tiers: [{ from: "0", percent: "" }], minimum: "", cap: "" };
}

function planFields(rule: AccountFeeRule): Partial<AccountSetupDraft> {
  return {
    type: rule.type, basis: rule.basis, basisLabel: rule.basisLabel ?? "",
    fixedAmount: rule.fixedAmount ?? "", percent: rule.percent ?? "",
    tiers: rule.tiers?.map(tier => ({ ...tier })) ?? [{ from: "0", percent: "" }],
    minimum: rule.minimum ?? "", cap: rule.cap ?? "",
  };
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
  if (!draft.clientType) return "Choose a client type.";
  try { validateFeeRule(feeRuleFromDraft(draft, market), market === "MY" ? "MYR" : "SGD"); }
  catch (error) { return error instanceof Error ? error.message : "Check the monthly fee rule."; }
  return "";
}

export function AccountSetupFields({ draft, market, update }: { draft: AccountSetupDraft; market: "MY" | "SG"; update: (patch: Partial<AccountSetupDraft>) => void }) {
  const { plans } = useFeePlans();
  const currency = market === "MY" ? "MYR" : "SGD";
  const availablePlans = currentPlanVersions(plans, draft.effectiveMonth).filter(plan => plan.clientType === draft.clientType && plan.currency === currency);
  const selectedPlan = availablePlans.find(plan => plan.id === draft.planId);
  const updateRule = (patch: Partial<AccountSetupDraft>) => update({ ...patch, planId: "custom" });
  return <fieldset className="account-rate-fields">
    <legend>Account setup</legend>
    <label className="account-field-wide">Company name<input maxLength={240} required value={draft.legalEntity} onChange={event => update({ legalEntity: event.target.value })} /></label>
    <label>Effective invoice month<input type="month" min={malaysiaMonth()} required value={draft.effectiveMonth} onChange={event => {
      const month = event.target.value;
      const nextPlan = currentPlanVersions(plans, month).find(plan => plan.id === draft.planId && plan.clientType === draft.clientType && plan.currency === currency);
      update({ effectiveMonth: month, ...(nextPlan ? planFields(nextPlan.rule) : { planId: "custom" }) });
    }} /></label>
    <label>Currency<input readOnly value={currency} /></label>
    <label>Client type<select value={draft.clientType} onChange={event => update({ ...planFields({ type: "fixed", currency, basis: "fixed_monthly", fixedAmount: "" }), clientType: event.target.value as AccountSetupDraft["clientType"], planId: "custom" })} required><option value="">Choose client type</option><option value="External">External</option><option value="Internal">Internal</option></select></label>
    <label className="account-field-wide">Fee plan<select value={selectedPlan?.id ?? "custom"} onChange={event => {
      const plan = availablePlans.find(item => item.id === event.target.value);
      update(plan ? { planId: plan.id, ...planFields(plan.rule) } : { planId: "custom" });
    }}><option value="custom">Custom fee rule</option>{availablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
    {draft.clientType && !availablePlans.length && <p className="store-access-note account-field-wide">No {currency} fee plan yet. Use Custom fee rule.</p>}
    <label>Monthly fee rule<select value={draft.type} onChange={event => updateRule({ type: event.target.value as AccountSetupDraft["type"] })}><option value="fixed">Fixed monthly fee</option><option value="percent">Commission percentage</option><option value="tiers">Tiered commission</option></select></label>
    {draft.type === "fixed" ? <label>Monthly fee ({currency})<input inputMode="decimal" placeholder="0.00" value={draft.fixedAmount} onChange={event => updateRule({ fixedAmount: event.target.value })} required /></label> : <>
      <label>Calculated on<select value={draft.basis} onChange={event => updateRule({ basis: event.target.value as AccountSetupDraft["basis"] })} required><option value="">Choose amount basis</option><option value="merchandise_subtotal">Merchandise subtotal</option><option value="net_gmv">Net GMV</option><option value="statement_amount">Statement amount</option><option value="custom">Other amount</option></select></label>
      {draft.basis === "custom" && <label className="account-field-wide">Describe amount basis<input maxLength={120} value={draft.basisLabel} onChange={event => updateRule({ basisLabel: event.target.value })} required /></label>}
      {draft.type === "percent" ? <label>Commission rate %<input inputMode="decimal" value={draft.percent} onChange={event => updateRule({ percent: event.target.value })} required /></label> : <div className="account-tier-fields account-field-wide"><span>Tier rates (up to 20)</span>{draft.tiers.map((tier, index) => <div key={index}><label>From {currency}<input inputMode="decimal" value={tier.from} onChange={event => updateRule({ tiers: draft.tiers.map((item, position) => position === index ? { ...item, from: event.target.value } : item) })} required /></label><label>Rate %<input inputMode="decimal" value={tier.percent} onChange={event => updateRule({ tiers: draft.tiers.map((item, position) => position === index ? { ...item, percent: event.target.value } : item) })} required /></label>{draft.tiers.length > 1 && <button type="button" onClick={() => updateRule({ tiers: draft.tiers.filter((_, position) => position !== index) })}>Remove</button>}</div>)}<button type="button" disabled={draft.tiers.length >= 20} onClick={() => updateRule({ tiers: [...draft.tiers, { from: "", percent: "" }] })}>+ Add tier</button><small>Start the first tier at 0; each next threshold must increase.</small></div>}
      <label>Minimum fee (optional)<input inputMode="decimal" value={draft.minimum} onChange={event => updateRule({ minimum: event.target.value })} /></label>
      <label>Maximum fee (optional)<input inputMode="decimal" value={draft.cap} onChange={event => updateRule({ cap: event.target.value })} /></label>
    </>}
  </fieldset>;
}
