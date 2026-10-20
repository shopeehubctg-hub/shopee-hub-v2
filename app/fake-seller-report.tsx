"use client";

import { useEffect, useMemo, useState } from "react";

type ReportLink={id:number;storeId:string;reportDate:string;url:string;brand:string};
function displayDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}
function weekStart(value:string){const date=new Date(`${value}T00:00:00Z`);const day=date.getUTCDay();date.setUTCDate(date.getUTCDate()-((day+6)%7));return date.toISOString().slice(0,10)}

export function FakeSellerReport({storeId,storeName,allStores}:{storeId:string;storeName:string;allStores:boolean}){
  const [links,setLinks]=useState<ReportLink[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/fake-seller-reports?storeId=${encodeURIComponent(allStores?"all":storeId)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Could not load report links");return response.json() as Promise<{links:ReportLink[]}>})
      .then(data=>setLinks(data.links)).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Could not load report links")})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[storeId,allStores,refresh]);
  const groups=useMemo(()=>{
    const byDate=new Map<string,ReportLink[]>();
    for(const link of links){const group=byDate.get(link.reportDate)??[];group.push(link);byDate.set(link.reportDate,group)}
    return [...byDate].sort(([a],[b])=>b.localeCompare(a));
  },[links]);
  const latest=groups[0]?.[0]??"";
  const malaysiaToday=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const currentWeek=weekStart(malaysiaToday);
  const thisWeek=links.filter(link=>weekStart(link.reportDate)===currentWeek).length;
  return <div className="fake-seller-module">
    <section className="fake-seller-hero"><div><p className="kicker">BRAND PROTECTION</p><h2>Fake Seller Reports</h2><p>{allStores?"All accessible brands":storeName} · Weekly report links</p></div></section>
    <section className="metric-grid protection-metrics" aria-label="Report summary">
      <article className="metric"><span>This week&apos;s report links</span><strong>{thisWeek}</strong><em>Week of {displayDate(currentWeek)}</em></article>
      <article className="metric"><span>Total since launch</span><strong>{links.length}</strong><em>Unique links per brand and date</em></article>
      <article className="metric"><span>Last updated</span><strong className="report-date-value">{latest?displayDate(latest):"—"}</strong><em>Malaysia date</em></article>
    </section>
    <section className="card fake-seller-dates"><div className="fake-seller-dates-head"><div><p className="kicker">REPORT LOG</p><h3>Links by date</h3></div><div><p>按每周自动整理的举报清单统计</p><button type="button" onClick={()=>{setLoading(true);setError("");setRefresh(value=>value+1)}}>Refresh reports</button></div></div>
      {loading?<p role="status">Loading report links…</p>:error?<p role="alert">{error}</p>:groups.length?groups.map(([date,items])=><details key={date} className="fake-seller-day"><summary><strong>{displayDate(date)}</strong><span>{items.length} links</span></summary><ul>{items.map(item=><li key={item.id}><span>{allStores&&<b>{item.brand} · </b>}</span><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></li>)}</ul></details>):<p className="protection-empty">No report links yet. New weekly lists will appear here after import.</p>}
    </section>
  </div>
}
