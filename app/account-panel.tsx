"use client";

import { useEffect, useState } from "react";
import type { AccountCurrency, AccountCurrencySummary, AccountResponse } from "./account-contract";
import { accountMoney } from "./account-display";
import { RateCell, RecordDetails } from "./account-settings-ui";

import { useFeePlans, useFeePreviewState } from "./fee-plan-context";
import { FeePlansPreview } from "./fee-plans-preview";

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

function CurrencyCard({currency,summary,invoiceMonth,today}:{currency:AccountCurrency;summary?:AccountCurrencySummary;invoiceMonth:string;today:string}) {
  const metrics=[
    {label:'Received today',value:summary?.todayCollected,period:today},
    {label:'Received this month',value:summary?.monthCollected,period:monthLabel(today.slice(0,7))},
    {label:'Invoiced',value:summary?.billed,period:monthLabel(invoiceMonth)},
    {label:'Outstanding',value:summary?.outstanding,period:monthLabel(invoiceMonth)},
  ];
  return <section className="account-summary-market" aria-label={`${currency==='MYR'?'Malaysia':'Singapore'} overview`}>
    <h3>{currency==='MYR'?'Malaysia':'Singapore'} <span>{currency}</span></h3>
    <div className="account-overview-metrics">{metrics.map(metric=><article className="metric" key={metric.label}><span>{metric.label}</span><strong>{accountMoney(metric.value,currency)}</strong><small>{metric.period}</small></article>)}</div>
  </section>;
}

export function AccountPanel() {
  const {previewRows,mergePreviewRows,openFeeWorkspace}=useFeePlans();
  const [invoiceMonth, setInvoiceMonth] = useFeePreviewState<string>("account-invoice-month","2026-10");
  const [query, setQuery] = useState("");
  const [detailId,setDetailId]=useState<string|null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AccountResponse | null>(null);
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
        if (!controller.signal.aborted) { setData(result); mergePreviewRows(result.stores); setError(""); setLoading(false); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Account data is unavailable. Please try again."); setLoading(false); }
      } finally { inFlight = false; }
    }
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [invoiceMonth, refreshKey, mergePreviewRows]);

  const displayMonth = data?.invoiceMonth ?? invoiceMonth;
  const updatedAt = accountUpdatedAt(data?.updatedAt ?? null);
  const canConfigure = invoiceMonth >= (data?.today || "").slice(0, 7);
  const canSaveSettings = Boolean(data?.settingsAvailable && canConfigure);
  const visibleRows = (data?.stores ?? []).filter(row => {
    const searchText = [row.project, row.storeName, row.entity, ...(row.candidates ?? []).flatMap(candidate => [candidate.username, candidate.storeName])].join(" ").toLocaleLowerCase();
    return searchText.includes(query.trim().toLocaleLowerCase());
  });
  return <div className="account-panel account-refined" aria-busy={loading}>
    <header className="page-title account-page-title"><h2>Account</h2><div className="account-page-controls"><label>Invoice month<input aria-label="Invoice month" type="month" value={invoiceMonth} onChange={event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){setDetailId(null);setInvoiceMonth(event.target.value);setLoading(true);}}}/></label><button type="button" disabled={loading} onClick={()=>{setLoading(true);setRefreshKey(value=>value+1);}}>Refresh</button></div></header>
    {error && <div className="account-notice error" role="alert">{error}</div>}
    {loading && <div className="account-notice" role="status">Loading Account…</div>}
    {!loading && data?.status === "not_configured" && <div className="account-notice" role="status">No income records yet.</div>}
    {!loading && data && <>
      {updatedAt && <p className="account-updated">Last updated {updatedAt} MYT</p>}
      <section className="account-finance-overview" aria-label="Income by currency">{currencies.map(currency => <CurrencyCard key={currency} currency={currency} summary={data.summaries.find(item => item.currency === currency)} invoiceMonth={displayMonth} today={data.today} />)}</section>
      <section className="account-stores" aria-labelledby="account-stores-title">
        <div className="account-stores-head"><div><h3 id="account-stores-title">Billing records</h3><span className="account-record-count">{visibleRows.length} records · {monthLabel(displayMonth)}</span>{!data.settingsAvailable&&<p className="account-preview-note">Rate previews reset on refresh.</p>}</div><button type="button" className="account-fee-settings-button" onClick={()=>openFeeWorkspace({view:'settings',month:invoiceMonth})}>Fee settings</button></div>
        {data.stores.length>0&&<div className="account-record-search"><label className="sr-only" htmlFor="account-record-search">Search billing records</label><input id="account-record-search" type="search" placeholder="Search client or store" value={query} onChange={event=>setQuery(event.target.value)}/></div>}
        {visibleRows.length?(['MY','SG'] as const).filter(group=>visibleRows.some(row=>row.market===group)).map(group=><section className="account-market-section" key={group} aria-labelledby={`account-market-${group}`}><h4 id={`account-market-${group}`}>{group==='MY'?'Malaysia':'Singapore'} <span>{group==='MY'?'MYR':'SGD'}</span></h4><div className="account-table-scroll"><table className="account-daily-table"><thead><tr><th scope="col">Client</th><th scope="col">Monthly rate</th><th scope="col">Invoiced</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead><tbody>{visibleRows.filter(row=>row.market===group).map(row=><tr key={row.id}><th scope="row" data-label="Client"><button type="button" className="account-record-name" aria-label={`View details for ${row.project||row.storeName}`} onClick={()=>setDetailId(row.id)}><span>{row.project||row.storeName}</span><span aria-hidden="true">›</span></button></th><td data-label="Monthly rate"><RateCell row={row} month={invoiceMonth} onEdit={()=>openFeeWorkspace({view:'assignment',month:invoiceMonth,unitKey:row.rosterKey??row.id})}/></td><td data-label="Invoiced">{accountMoney(row.billed,row.currency)}</td><td data-label="Received">{accountMoney(row.collected,row.currency)}</td><td data-label="Outstanding">{accountMoney(row.outstanding,row.currency)}</td></tr>)}</tbody></table></div></section>):<div className="account-empty">{data.stores.length?'No matching records.':`No billing records for ${monthLabel(displayMonth)}.`}</div>}
      </section>
    </>}
    {data&&detailId&&data.stores.find(row=>row.id===detailId)&&<RecordDetails key={`${detailId}:${invoiceMonth}`} row={data.stores.find(row=>row.id===detailId)!} month={invoiceMonth} canConfigure={canConfigure} canSave={canSaveSettings} options={data.storeOptions??[]} onClose={()=>setDetailId(null)} onSaved={()=>{setDetailId(null);setLoading(true);setRefreshKey(value=>value+1);}}/>}
    {data&&<FeePlansPreview rows={previewRows.length?previewRows:data.stores} month={invoiceMonth}/> }
  </div>;
}
