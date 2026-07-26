"use client";

import { useMemo, useState } from "react";

export type FakeSellerCase = {
  caseId: string; store?: string; brand: string; region: string; createdAt: string; updatedAt?: string;
  status: "Approved" | "Partially Approved" | "Rejected" | "Under Review";
  sellerCount: number; listingCount: number; approvedListings?: number; ipType?: string; registrationNo?: string;
};

const portalSnapshot: FakeSellerCase[] = [
  {caseId:"2152420",store:"SkinDae Official Store",brand:"SkinDae",region:"Malaysia",createdAt:"2026-07-08",updatedAt:"2026-07-09",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"TM2024033727"},
  {caseId:"2152403",store:"NatureLish Healthcare",brand:"natureLISH",region:"Malaysia",createdAt:"2026-07-08",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"TM2023001826"},
  {caseId:"2152398",store:"NatureLish Healthcare",brand:"natureLISH",region:"Malaysia",createdAt:"2026-07-08",status:"Partially Approved",sellerCount:1,listingCount:1,approvedListings:0,ipType:"Trademark",registrationNo:"TM2023001826"},
  {caseId:"2152371",store:"Bonlife Official Store",brand:"Bonlife",region:"Malaysia",createdAt:"2026-07-08",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"2018014574"},
  {caseId:"2152342",store:"Berlanco Beauty Official",brand:"Berlanco",region:"Malaysia",createdAt:"2026-07-08",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"TM2020029876"},
  {caseId:"2152273",store:"Mizino Official Store",brand:"Mizino",region:"Malaysia",createdAt:"2026-07-08",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"TM2022029147"},
  {caseId:"2152232",store:"Mizino Official Store",brand:"Mizino",region:"Malaysia",createdAt:"2026-07-08",status:"Partially Approved",sellerCount:1,listingCount:1,approvedListings:0,ipType:"Trademark",registrationNo:"TM2022029147"},
  {caseId:"2152224",store:"AgePros By Swissmed",brand:"Swissmed",region:"Malaysia",createdAt:"2026-07-08",status:"Approved",sellerCount:1,listingCount:1,approvedListings:1,ipType:"Trademark",registrationNo:"TM2021012112"},
  {caseId:"2148715",store:"Petavit Official Store",brand:"Petavit",region:"Malaysia",createdAt:"2026-07-06",status:"Rejected",sellerCount:1,listingCount:1,approvedListings:0,ipType:"Trademark",registrationNo:"TM2021004678"},
  {caseId:"2136354",store:"NatureLish Healthcare",brand:"natureLISH",region:"Malaysia",createdAt:"2026-06-25",status:"Partially Approved",sellerCount:1,listingCount:1,approvedListings:0,ipType:"Trademark",registrationNo:"TM2023001826"},
];
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
  const source=cases?.length?cases:portalSnapshot;
  const selectedBrand=brandByStore[storeName];
  const scoped=useMemo(()=>source.filter(item=>allStores||(selectedBrand!=null&&item.brand.toLowerCase()===selectedBrand.toLowerCase())),[source,allStores,selectedBrand]);
  const latestDate=scoped.reduce((latest,item)=>item.createdAt>latest?item.createdAt:latest,"");
  const rangeStart=range==="7"&&latestDate?new Date(`${latestDate}T00:00:00`).getTime()-6*86400000:null;
  const filtered=scoped.filter(item=>(rangeStart==null||new Date(`${item.createdAt}T00:00:00`).getTime()>=rangeStart)&&(status==="All"||item.status===status)&&`${item.caseId} ${item.brand} ${item.store??""}`.toLowerCase().includes(query.toLowerCase()));
  const casesSubmitted=filtered.length, sellersReported=filtered.reduce((n,x)=>n+x.sellerCount,0), listingsReported=filtered.reduce((n,x)=>n+x.listingCount,0), approvedListings=filtered.reduce((n,x)=>n+(x.approvedListings??0),0);
  const successfulCases=filtered.filter(x=>x.status==="Approved"||x.status==="Partially Approved").length, successRate=casesSubmitted?Math.round(successfulCases/casesSubmitted*100):0;
  return <div className="fake-seller-module">
    <section className="fake-seller-hero"><div><p className="kicker">BRAND PROTECTION</p><h2>Fake Seller Reporting</h2><p>Weekly proof of the sellers and listings reported on behalf of {allStores?"all projects":storeName}.</p></div>{!allStores&&<div className="project-brand"><span>Project brand</span><strong>{selectedBrand??"No brand assigned"}</strong></div>}</section>
    <div className="report-context"><span className="live-dot"/>Source: Shopee Brand IP Portal · Case and listing-level results <b>{latestDate?`· Latest case ${dateLabel(latestDate)}`:""}</b></div>
    <section className="metric-grid protection-metrics"><article className="metric"><span>Cases submitted</span><strong>{casesSubmitted}</strong><em>Selected period</em></article><article className="metric"><span>Fake sellers reported</span><strong>{sellersReported}</strong><em>{listingsReported} infringing listings</em></article><article className="metric protection-success"><span>Successful cases</span><strong>{successfulCases}</strong><em>Approved or partially approved</em></article><article className="metric"><span>Success rate</span><strong>{successRate}%</strong><em>{approvedListings} listings approved</em></article></section>
    <section className="protection-breakdown card"><div><p className="kicker">CASE OUTCOME</p><h3>Enforcement result</h3></div>{["Approved","Partially Approved","Rejected","Under Review"].map(label=>{const resultCases=filtered.filter(x=>x.status===label);const count=resultCases.length;const resultListings=resultCases.reduce((n,x)=>n+(label==="Approved"||label==="Partially Approved"?(x.approvedListings??0):x.listingCount),0);return <div className="outcome" key={label}><span className={`case-status ${statusTone[label as FakeSellerCase["status"]]}`}>{label}</span><b>{resultListings}</b><small>listings · {count} cases</small><i><span style={{width:`${listingsReported?resultListings/listingsReported*100:0}%`}}/></i></div>})}</section>
    <section className="protection-list"><div className="protection-list-head"><div><p className="kicker">REPORT LOG</p><h3>Cases reported for this project</h3></div><div className="protection-filters"><select aria-label="Reporting period" value={range} onChange={e=>setRange(e.target.value)}><option value="all">All available dates</option><option value="7">Latest 7 days</option></select><select aria-label="Case status" value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option>Approved</option><option>Partially Approved</option><option>Rejected</option><option>Under Review</option></select><input aria-label="Search cases" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search case or brand"/></div></div>
      <div className="card table-card"><table className="protection-table"><thead><tr><th>Case ID</th><th>Brand / Project</th><th>Submitted</th><th>Fake sellers</th><th>Listings</th><th>Result</th><th>Approved listings</th><th>IP registration</th></tr></thead><tbody>{filtered.map(item=><tr key={item.caseId}><td><b>#{item.caseId}</b></td><td><b>{item.brand}</b><small>{item.region}</small></td><td>{dateLabel(item.createdAt)}</td><td>{item.sellerCount}</td><td>{item.listingCount}</td><td><span className={`case-status ${statusTone[item.status]}`}>{item.status}</span></td><td>{item.approvedListings??"—"}</td><td><span>{item.ipType??"—"}</span><small>{item.registrationNo??"—"}</small></td></tr>)}{!filtered.length&&<tr><td colSpan={8} className="protection-empty">No cases found for this project and filter.</td></tr>}</tbody></table></div>
      <p className="report-note">“Fake sellers reported” counts unique seller records inside imported cases. A partially approved case is treated as successful, while enforced listings only count approved listings.</p>
    </section>
  </div>
}
