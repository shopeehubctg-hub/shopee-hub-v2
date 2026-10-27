"use client";

import { useEffect, useRef, useState } from "react";
import type { AccountCurrency, AccountCurrencySummary, AccountResponse, AccountStoreRow } from "./account-contract";
import { accountMoney } from "./account-display";
import { RateCell, RecordDetails } from "./account-settings-ui";

import { billingRowsMatching, visibleSelection, useFeePlans, useFeePreviewState } from "./fee-plan-context";
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

function needsStoreMapping(row: AccountStoreRow) {
  return !row.storeId || Boolean(row.mappingStatus && row.mappingStatus !== 'resolved');
}

function SelectionCheckbox({checked,indeterminate,label,onChange}:{checked:boolean;indeterminate?:boolean;label:string;onChange:()=>void}){
 const ref=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(ref.current)ref.current.indeterminate=Boolean(indeterminate);},[indeterminate]);
 return <input ref={ref} type="checkbox" aria-label={label} aria-checked={indeterminate?'mixed':checked} checked={checked} onChange={onChange}/>;
}

export function AccountPanel() {
  const {previewRows,mergePreviewRows,openFeeWorkspace}=useFeePlans();
  const [invoiceMonth, setInvoiceMonth] = useFeePreviewState<string>("account-invoice-month","2026-10");
  const [query, setQuery] = useState("");
  const [selected,setSelected]=useState<string[]>([]);
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
  const visibleRows=billingRowsMatching(data?.stores??[],query);
  const selectedKeys=visibleSelection(visibleRows,selected);
  function changeInvoiceMonth(value:string){if(value!==invoiceMonth&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)){setDetailId(null);setSelected([]);setInvoiceMonth(value);setLoading(true);}}
  function toggleGroup(keys:string[]){setSelected(current=>{const all=keys.every(key=>current.includes(key));return all?current.filter(key=>!keys.includes(key)):[...new Set([...current,...keys])];});}
  return <div className="account-panel account-refined" aria-busy={loading}>
    <header className="page-title account-page-title" aria-label="Account controls"><div className="account-page-controls"><label>Invoice month<input aria-label="Invoice month" type="month" value={invoiceMonth} onInput={event=>changeInvoiceMonth(event.currentTarget.value)} onChange={event=>changeInvoiceMonth(event.currentTarget.value)}/></label><button type="button" disabled={loading} onClick={()=>{setLoading(true);setRefreshKey(value=>value+1);}}>Refresh</button></div></header>
    <p className="account-invoice-remark">Invoice month is based on the previous month’s service period.</p>
    {error && <div className="account-notice error" role="alert">{error}</div>}
    {loading && <div className="account-notice" role="status">Loading Account…</div>}
    {!loading && data?.status === "not_configured" && <div className="account-notice" role="status">No income records yet.</div>}
    {!loading && data && <>
      {updatedAt && <p className="account-updated">Last updated {updatedAt} MYT</p>}
      <section className="account-finance-overview" aria-label="Income by currency">{currencies.map(currency => <CurrencyCard key={currency} currency={currency} summary={data.summaries.find(item => item.currency === currency)} invoiceMonth={displayMonth} today={data.today} />)}</section>
      <section className="account-stores" aria-labelledby="account-stores-title">
        <div className="account-stores-head"><div><h3 id="account-stores-title">Billing records</h3><span className="account-record-count">{visibleRows.length} records · {monthLabel(displayMonth)}</span>{!data.settingsAvailable&&<p className="account-preview-note">Preview edits reset on refresh.</p>}</div><button type="button" className="account-fee-settings-button" onClick={()=>openFeeWorkspace({view:'settings',month:invoiceMonth})}>Fee settings</button></div>
        {data.stores.length>0&&<div className="account-record-search"><label className="sr-only" htmlFor="account-record-search">Search entity, client or store</label><input id="account-record-search" type="search" placeholder="Search entity, client or store" value={query} onChange={event=>{setSelected([]);setQuery(event.target.value);}}/></div>}
        {selectedKeys.length>0&&<div className="account-selection-bar" role="region" aria-label="Selected billing records"><strong>{selectedKeys.length} selected</strong><button type="button" onClick={()=>setSelected([])}>Clear</button><button type="button" className="account-bulk-rate" onClick={()=>openFeeWorkspace({view:'bulk',month:invoiceMonth,unitKeys:[...selectedKeys]})}>Update rate card</button></div>}
        {visibleRows.length?(['MY','SG'] as const).filter(group=>visibleRows.some(row=>row.market===group)).map(group=><section className="account-market-section" key={group} aria-labelledby={`account-market-${group}`}><h4 id={`account-market-${group}`}>{group==='MY'?'Malaysia':'Singapore'} <span>{group==='MY'?'MYR':'SGD'}</span></h4><div className="account-table-scroll"><table className="account-daily-table"><thead><tr><th scope="col" className="account-selection-col"><SelectionCheckbox label={`Select all visible ${group==='MY'?'Malaysia':'Singapore'} records`} checked={visibleRows.filter(row=>row.market===group).every(row=>selectedKeys.includes(row.rosterKey??row.id))} indeterminate={visibleRows.filter(row=>row.market===group).some(row=>selectedKeys.includes(row.rosterKey??row.id))&&!visibleRows.filter(row=>row.market===group).every(row=>selectedKeys.includes(row.rosterKey??row.id))} onChange={()=>toggleGroup(visibleRows.filter(row=>row.market===group).map(row=>row.rosterKey??row.id))}/></th><th scope="col">Client</th><th scope="col">Monthly rate</th><th scope="col">Invoiced</th><th scope="col">Received</th><th scope="col">Outstanding</th></tr></thead><tbody>{visibleRows.filter(row=>row.market===group).map(row=><tr key={row.id}><td className="account-selection-col" data-label="Select"><SelectionCheckbox checked={selectedKeys.includes(row.rosterKey??row.id)} label={`Select ${row.project||row.storeName}`} onChange={()=>setSelected(current=>current.includes(row.rosterKey??row.id)?current.filter(key=>key!==(row.rosterKey??row.id)):[...current,row.rosterKey??row.id])}/></td><th scope="row" data-label="Client"><button type="button" className="account-record-name" aria-label={`View details for ${row.project||row.storeName}${needsStoreMapping(row)?' · Store mapping required':''}`} onClick={()=>setDetailId(row.id)}><span>{row.project||row.storeName}{needsStoreMapping(row)&&<span className="account-mapping-warning" role="img" aria-label="Store mapping required" title="Store mapping required">❗️</span>}</span><span aria-hidden="true">›</span></button></th><td data-label="Monthly rate"><RateCell row={row} month={invoiceMonth} onEdit={()=>openFeeWorkspace({view:'assignment',month:invoiceMonth,unitKey:row.rosterKey??row.id})}/></td><td data-label="Invoiced">{accountMoney(row.billed,row.currency)}</td><td data-label="Received">{accountMoney(row.collected,row.currency)}</td><td data-label="Outstanding">{accountMoney(row.outstanding,row.currency)}</td></tr>)}</tbody></table></div></section>):<div className="account-empty">{data.stores.length?'No matching records.':`No billing records for ${monthLabel(displayMonth)}.`}</div>}
      </section>
    </>}
    {data&&detailId&&data.stores.find(row=>row.id===detailId)&&<RecordDetails key={`${detailId}:${invoiceMonth}`} row={data.stores.find(row=>row.id===detailId)!} month={invoiceMonth} canConfigure={canConfigure} canSave={canSaveSettings} options={data.storeOptions??[]} onClose={()=>setDetailId(null)} onSaved={()=>{setDetailId(null);setLoading(true);setRefreshKey(value=>value+1);}}/>}
    {data&&<FeePlansPreview rows={previewRows.length?previewRows:data.stores} month={invoiceMonth}/> }
  </div>;
}
