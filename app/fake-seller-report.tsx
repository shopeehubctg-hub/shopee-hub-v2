"use client";

import { useMemo, useState } from "react";

export type FakeSellerCase = {
  caseId: string; store?: string; brand: string; region: string; createdAt: string; updatedAt?: string;
  status: "Approved" | "Partially Approved" | "Rejected" | "Under Review";
  sellerCount: number; listingCount: number; approvedListings?: number; ipType?: string; registrationNo?: string;
};

const brandByStore: Record<string,string> = {
  "SkinDae Official Store":"SkinDae", "SkinDae SG":"SkinDae",
  "NatureLish Healthcare":"natureLISH", "Naturelish Healthcare Singapore":"natureLISH",
  "Bonlife Official Store":"Bonlife", "Bonlife SG":"Bonlife",
  "Berlanco Beauty Official":"Berlanco", "Berlanco SG":"Berlanco",
  "Mizino Official Store":"Mizino", "Mizino Premium":"Mizino",
  "AgePros By Swissmed":"Swissmed", "BioTech by Swissmed":"Swissmed",
  "Petavit Official Store":"Petavit",
};
const statusTone: Record<FakeSellerCase["status"], string> = {Approved:"approved","Partially Approved":"partial",Rejected:"rejected","Under Review":"review"};
function dateLabel(value:string){return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"})}

export function FakeSellerReport({storeName,allStores,cases}:{storeName:string;allStores:boolean;cases?:FakeSellerCase[]}){
  const [status,setStatus]=useState("All"); const [range,setRange]=useState("all"); const [query,setQuery]=useState("");
  const selectedBrand=brandByStore[storeName];
  const scoped=useMemo(()=>(cases??[]).filter(item=>allStores||(selectedBrand!=null&&item.brand.toLowerCase()===selectedBrand.toLowerCase())),[cases,allStores,selectedBrand]);
  const latestDate=scoped.reduce((latest,item)=>item.createdAt>latest?item.createdAt:latest,"");
  const today=new Date(); today.setHours(0,0,0,0);
  const rangeStart=range==="7"?today.getTime()-6*86400000:null;
  const filtered=scoped.filter(item=>(rangeStart==null||new Date(`${item.createdAt}T00:00:00`).getTime()>=rangeStart)&&(status==="All"||item.status===status)&&`${item.caseId} ${item.brand} ${item.store??""}`.toLowerCase().includes(query.toLowerCase()));
  const casesSubmitted=filtered.length, sellersReported=filtered.reduce((n,x)=>n+x.sellerCount,0), listingsReported=filtered.reduce((n,x)=>n+x.listingCount,0), approvedListings=filtered.reduce((n,x)=>n+(x.approvedListings??0),0);
  const successfulCases=filtered.filter(x=>x.status==="Approved"||x.status==="Partially Approved").length, successRate=casesSubmitted?Math.round(successfulCases/casesSubmitted*100):0;
  return <div className="fake-seller-module">
    <section className="fake-seller-hero"><div><p className="kicker">BRAND PROTECTION</p><h2>Fake Seller Reporting</h2><p>Reported sellers and listing outcomes for {allStores?"all projects":storeName}.</p></div>{!allStores&&<div className="project-brand"><span>Project brand</span><strong>{selectedBrand??"No brand assigned"}</strong></div>}</section>
    {!scoped.length ? <section className="card protection-empty-state"><h3>No reports available</h3><p>Fake seller case counts and outcomes will appear here when reports are available for {allStores?"your projects":storeName}.</p></section> : <>
    {latestDate&&<div className="report-context">Most recent case submitted {dateLabel(latestDate)}</div>}
    <section className="metric-grid protection-metrics"><article className="metric"><span>Cases submitted</span><strong>{casesSubmitted}</strong><em>Selected period</em></article><article className="metric"><span>Fake sellers reported</span><strong>{sellersReported}</strong><em>{listingsReported} infringing listings</em></article><article className="metric protection-success"><span>Successful cases</span><strong>{successfulCases}</strong><em>Approved or partially approved</em></article><article className="metric"><span>Success rate</span><strong>{successRate}%</strong><em>{approvedListings} listings approved</em></article></section>
    <section className="protection-breakdown card"><div><p className="kicker">CASE OUTCOME</p><h3>Enforcement result</h3></div>{["Approved","Partially Approved","Rejected","Under Review"].map(label=>{const resultCases=filtered.filter(x=>x.status===label);const count=resultCases.length;const resultListings=resultCases.reduce((n,x)=>n+(label==="Approved"||label==="Partially Approved"?(x.approvedListings??0):x.listingCount),0);return <div className="outcome" key={label}><span className={`case-status ${statusTone[label as FakeSellerCase["status"]]}`}>{label}</span><b>{resultListings}</b><small>listings · {count} cases</small><i><span style={{width:`${listingsReported?resultListings/listingsReported*100:0}%`}}/></i></div>})}</section>
    <section className="protection-list"><div className="protection-list-head"><div><p className="kicker">REPORT LOG</p><h3>Cases reported for this project</h3></div><div className="protection-filters"><select aria-label="Reporting period" value={range} onChange={e=>setRange(e.target.value)}><option value="all">All available dates</option><option value="7">Latest 7 days</option></select><select aria-label="Case status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Approved</option><option>Partially Approved</option><option>Rejected</option><option>Under Review</option></select><input aria-label="Search cases" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search case or brand"/></div></div>
      <div className="card table-card"><table className="protection-table"><thead><tr><th>Case ID</th><th>Brand / Project</th><th>Submitted</th><th>Fake sellers</th><th>Listings</th><th>Result</th><th>Approved listings</th><th>IP registration</th></tr></thead><tbody>{filtered.map(item=><tr key={item.caseId}><td><b>#{item.caseId}</b></td><td><b>{item.brand}</b><small>{item.region}</small></td><td>{dateLabel(item.createdAt)}</td><td>{item.sellerCount}</td><td>{item.listingCount}</td><td><span className={`case-status ${statusTone[item.status]}`}>{item.status}</span></td><td>{item.approvedListings??"—"}</td><td><span>{item.ipType??"—"}</span><small>{item.registrationNo??"—"}</small></td></tr>)}{!filtered.length&&<tr><td colSpan={8} className="protection-empty">No cases found for this project and filter.</td></tr>}</tbody></table></div>
      <p className="report-note">“Fake sellers reported” totals seller records across the displayed cases. A partially approved case is treated as successful, while enforced listings only count approved listings.</p>
    </section>
    </>}
  </div>
}
