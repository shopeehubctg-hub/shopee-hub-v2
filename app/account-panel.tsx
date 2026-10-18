"use client";

import { useEffect, useState } from "react";
import type { AccountCurrency, AccountCurrencySummary, AccountResponse } from "./account-contract";
import { accountMoney } from "./account-display";
import { RateCell, RateDialog, StoreNameCell } from "./account-settings-ui";

const currencies: AccountCurrency[] = ["MYR", "SGD"];

function monthLabel(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month;
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

function accountUpdatedAt(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}

function CurrencyCard({ currency, summary, invoiceMonth, today }: {
  currency: AccountCurrency; summary?: AccountCurrencySummary; invoiceMonth: string; today: string;
}) {
  return <article className="account-currency-card">
    <header><div><span className="account-currency-code">{currency}</span><h3>{currency === "MYR" ? "Malaysia" : "Singapore"}</h3></div><span>Service fee income</span></header>
    <div className="account-card-group"><p>Money received</p><div className="account-card-pair">
      <div><span>Received today <small>{today}</small></span><strong>{accountMoney(summary?.todayCollected, currency)}</strong></div>
      <div><span>Received this month</span><strong>{accountMoney(summary?.monthCollected, currency)}</strong></div>
    </div></div>
    <div className="account-card-group"><p>Invoices · {monthLabel(invoiceMonth)}</p><div className="account-card-pair">
      <div><span>Invoiced</span><strong>{accountMoney(summary?.billed, currency)}</strong></div>
      <div><span>Outstanding</span><strong>{accountMoney(summary?.outstanding, currency)}</strong></div>
    </div></div>
    <div className="account-expected"><span>Expected net fee <small>Not money received</small></span><strong>{accountMoney(summary?.expectedNetFee, currency)}</strong></div>
  </article>;
}

export function AccountPanel() {
  const [invoiceMonth, setInvoiceMonth] = useState("2026-10");
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<"all" | "MY" | "SG">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AccountResponse | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/admin/account?invoiceMonth=${encodeURIComponent(invoiceMonth)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? "Super Admin access is required." : "Account data is unavailable. Please try again.");
        const result = await response.json() as AccountResponse;
        if (!controller.signal.aborted) { setData(result); setError(""); setLoading(false); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Account data is unavailable. Please try again."); setLoading(false); }
      } finally { inFlight = false; }
    }
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [invoiceMonth, refreshKey]);

  const displayMonth = data?.invoiceMonth ?? invoiceMonth;
  const updatedAt = accountUpdatedAt(data?.updatedAt ?? null);
  const canConfigure = invoiceMonth >= (data?.today || "").slice(0, 7);
  const canSaveSettings = Boolean(data?.settingsAvailable && canConfigure);
  const editingRate = data?.stores.find(row => row.id === editingRateId);
  const visibleRows = (data?.stores ?? []).filter(row => {
    if (market !== "all" && row.market !== market) return false;
    const searchText = [row.project, row.storeName, row.entity, ...(row.candidates ?? []).flatMap(candidate => [candidate.username, candidate.storeName])].join(" ").toLocaleLowerCase();
    return searchText.includes(query.trim().toLocaleLowerCase());
  });
  return <div className="account-panel" aria-busy={loading}>
    <header className="account-hero"><div><p className="kicker">SUPER ADMIN · ACCOUNT</p><h2>Service fee income</h2><p>Track Shopee Hub fees billed and money actually received.</p></div><div className="account-hero-actions"><label>Invoice month<input aria-label="Invoice month" type="month" value={invoiceMonth} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { setEditingRateId(null); setInvoiceMonth(event.target.value); setLoading(true); } }} /></label><button type="button" disabled={loading} onClick={() => { setLoading(true); setRefreshKey(value => value + 1); }}>Refresh</button></div></header>
    {error && <div className="account-notice error" role="alert">{error}</div>}
    {loading && <div className="account-notice" role="status">Loading Account…</div>}
    {!loading && data?.status === "not_configured" && <div className="account-notice" role="status">No income records imported yet.</div>}
    {!loading && data && <>
      {updatedAt && <p className="account-updated">Last updated {updatedAt} MYT</p>}
      <section className="account-currencies" aria-label="Income by currency">{currencies.map(currency => <CurrencyCard key={currency} currency={currency} summary={data.summaries.find(item => item.currency === currency)} invoiceMonth={displayMonth} today={data.today} />)}</section>
      <section className="account-stores" aria-labelledby="account-stores-title"><div className="account-stores-head"><div><p className="kicker">INVOICE MONTH · {monthLabel(displayMonth)}</p><h3 id="account-stores-title">Billing records</h3></div><span>{visibleRows.length} of {data.stores.length} billing records</span></div>
        {canConfigure && !data.settingsAvailable && <div className="account-notice account-settings-notice" role="status">Store and rate saving is unavailable in this preview. You can review the options.</div>}
        {data.stores.length > 0 && <div className="account-filters"><label>Search project or store<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Project, entity or store…" /></label><label>Market<select value={market} onChange={event => setMarket(event.target.value as "all" | "MY" | "SG")}><option value="all">All markets</option><option value="MY">Malaysia</option><option value="SG">Singapore</option></select></label></div>}
        {visibleRows.length ? <div className="account-table-scroll"><table><thead><tr><th scope="col">Billing project</th><th scope="col">Entity / market</th><th scope="col">Store name</th><th scope="col">Monthly rate</th><th scope="col">Statement / service period</th><th scope="col">Expected net fee</th><th scope="col">Invoiced</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.id}><td data-label="Billing project"><strong>{row.project || row.storeName}</strong></td><td data-label="Entity / market"><strong>{row.entity || "—"}</strong><small>{row.market === "MY" ? "Malaysia" : row.market === "SG" ? "Singapore" : "Market unknown"}</small></td><td data-label="Store name"><StoreNameCell row={row} options={data.storeOptions ?? []} configurable={canConfigure} canSave={canSaveSettings} month={invoiceMonth} onSaved={() => { setLoading(true); setRefreshKey(value => value + 1); }} /></td><td data-label="Monthly rate"><RateCell row={row} editable={canConfigure} available={canConfigure || Boolean(data.settingsAvailable)} onEdit={() => setEditingRateId(row.id)} /></td><td data-label="Statement / service period"><strong>{row.statementMonth || "—"}</strong><small>{row.servicePeriodStart && row.servicePeriodEnd ? `${row.servicePeriodStart} – ${row.servicePeriodEnd}` : "Service period unknown"}</small></td><td data-label="Expected net fee">{accountMoney(row.expectedNetFee, row.currency)}</td><td data-label="Invoiced">{accountMoney(row.billed, row.currency)}</td><td data-label="Received">{accountMoney(row.collected, row.currency)}</td><td data-label="Outstanding">{accountMoney(row.outstanding, row.currency)}</td></tr>)}</tbody></table></div>
          : <div className="account-empty">{data.stores.length ? "No projects match these filters." : `No billing projects for ${monthLabel(displayMonth)}.`}</div>}
      </section>
    </>}
    {editingRate && <RateDialog key={`${editingRate.id}-${editingRate.latestSettingsVersion || "0"}`} row={editingRate} month={invoiceMonth} today={data?.today || ""} editable={canConfigure} canSave={canSaveSettings} onClose={() => setEditingRateId(null)} onSaved={() => { setLoading(true); setRefreshKey(value => value + 1); }} />}
  </div>;
}
