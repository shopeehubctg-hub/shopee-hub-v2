"use client";

import { useEffect, useMemo, useState } from "react";
import adsData from "./ads-data.json";
import { PackageControl } from "./package-control";
import { PriceCalculator } from "./price-calculator";
import { DesignChecker } from "./design-checker";
import { FakeSellerReport, type FakeSellerCase } from "./fake-seller-report";
import type { PackagePrefill } from "./calculator-types";
import { storeSnapshots } from "./store-snapshots";
import { buildAdvertisingFunds, buildTopUpAction, formatRinggit } from "./advertising-model.js";

type Store = { id: string; name: string; platform: string; contacts: { project: string; href: string }[] };
type DashboardResponse = { stores: Store[]; selectedStoreId: string | null; snapshot: { payload: any; importedAt: string } | null; adBalance: { balance:number; balanceDate:string; sourceUpdatedAt:string; syncStatus:string } | null };
type ClientAction = { title: string; client: string; due: string; type: string; action: string; href?: string; generated?: boolean };

const overviewFallback = [
  ["Valid Order Sales", "RM 18,711.82", "+21.4%"], ["Valid Orders", "654", "+20.7%"],
  ["Customers", "527", "+14.2%"], ["Sales per Customer", "RM 35.51", "+6.3%"],
];
const adFallback = { balance:"—", averageDailySpend30d:null, syncStatus:"delayed", spend:"RM 2,480.30", sales:"RM 18,922.40", roas:"7.63×", views:"428,190", clicks:"12,846", conversion:"3.18%", sold:"1,106", cpc:"RM 2.24", acos:"13.11%", ctr:"3.00%", conversionRate:"3.18%" };
const allStoresAdvertising = { balance:"By store", spend:"RM 19,465.75", sales:"RM 347,585.29", roas:"17.86×", views:"703,913", clicks:"19,287", conversion:"1,171", sold:"5,370", cpc:"RM 16.62", acos:"5.60%", ctr:"2.74%", conversionRate:"6.07%" };
const adCampaignFallback = [
  { name:"Pizza Box – Search", type:"Product Search", status:"Active", budget:"RM 80/day", spend:"RM 742.18", sales:"RM 6,820.40", roas:"9.19×", views:"126,420", clicks:"4,188", ctr:"3.31%", conversionRate:"3.58%", sold:"302", acos:"10.88%" },
  { name:"Corrugated Tray – Discovery", type:"Discovery", status:"Active", budget:"RM 60/day", spend:"RM 614.92", sales:"RM 4,392.60", roas:"7.14×", views:"98,310", clicks:"2,744", ctr:"2.79%", conversionRate:"2.88%", sold:"216", acos:"14.00%" },
  { name:"A4 Pizza Box – Search", type:"Product Search", status:"Paused", budget:"RM 45/day", spend:"RM 284.60", sales:"RM 1,108.20", roas:"3.89×", views:"55,840", clicks:"946", ctr:"1.69%", conversionRate:"1.48%", sold:"64", acos:"25.68%" },
];
const allStoresCampaigns = [
  { name:"Sous Vide Chicken Breast – Value Pack", type:"Jeeroul by CTG4u · GMV Max", status:"Ongoing", budget:"RM 8/day", spend:"RM 55.74", sales:"RM 412.00", roas:"7.39×", views:"4,163", clicks:"98", ctr:"2.35%", conversionRate:"2.04%", sold:"2", acos:"13.53%" },
  { name:"Golden Oat 2.0 Gastric Comfort", type:"True Golden Care by Naturelish · GMV Max", status:"Ongoing", budget:"RM 10/day", spend:"RM 70.00", sales:"RM 2,917.00", roas:"41.67×", views:"1,088", clicks:"43", ctr:"3.95%", conversionRate:"13.95%", sold:"6", acos:"2.40%" },
  { name:"Probiotic Whitening Tooth Powder", type:"Dr Smile Whitening by CTG4u · GMV Max", status:"Ongoing", budget:"RM 50/day", spend:"RM 434.42", sales:"RM 5,431.62", roas:"12.50×", views:"7,665", clicks:"241", ctr:"3.14%", conversionRate:"10.79%", sold:"27", acos:"8.00%" },
  { name:"Top & Bottom Packaging Box [2]", type:"J Packaging · GMV Max", status:"Ongoing", budget:"RM 10/day", spend:"RM 30.07", sales:"RM 153.36", roas:"5.10×", views:"6,739", clicks:"187", ctr:"2.77%", conversionRate:"6.42%", sold:"48", acos:"19.61%" },
  { name:"Pizza Box A4 [3]", type:"J Packaging · GMV Max", status:"Ongoing", budget:"RM 10/day", spend:"RM 22.54", sales:"RM 88.41", roas:"3.92×", views:"2,486", clicks:"85", ctr:"3.42%", conversionRate:"10.59%", sold:"74", acos:"25.49%" },
  { name:"10 in 1 Baby Comfort Cream [2]", type:"CTG4U Malaysia · GMV Max", status:"Paused", budget:"RM 8/day", spend:"RM 0", sales:"RM 0", roas:"0×", views:"0", clicks:"0", ctr:"0%", conversionRate:"0%", sold:"0", acos:"0%" },
  { name:"iLady Scalp Essence Hair Growth [2]", type:"CTG4U Malaysia · GMV Max", status:"Paused", budget:"RM 8/day", spend:"RM 0", sales:"RM 0", roas:"0×", views:"0", clicks:"0", ctr:"0%", conversionRate:"0%", sold:"0", acos:"0%" },
];
const ordersFallback = [
  { id:"260717K3M8Q1", buyer:"mi***88", product:"Pizza Box 20 × 12 × 7cm", time:"09:18", value:"RM 86.40", expire:"16:30", left:"2h 14m", status:"Urgent" },
  { id:"260717F9A2J7", buyer:"jo***tan", product:"Corrugated Tray 60 × 35 × 10cm", time:"08:42", value:"RM 124.00", expire:"14:00", left:"Expired", status:"Expired" },
  { id:"260717P5X4B2", buyer:"nur***ah", product:"Pizza Box A4", time:"10:06", value:"RM 45.60", expire:"18:00", left:"3h 44m", status:"Urgent" },
];
const actionFallback = [
  { title:"待提供配套图片", client:"J Packaging", due:"Today", type:"Content", action:"Upload" },
  { title:"新配套价格更新 - Fulfilment Sheet", client:"J Packaging", due:"18 Jul", type:"Pricing", action:"Open Sheet", href:"https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit?usp=drive_link" },
  { title:"Join CoFund", client:"J Packaging", due:"Today", type:"Campaign", action:"Review" },
  { title:"待批准广告预算 RM 800", client:"J Packaging", due:"19 Jul", type:"Urgent", action:"Approve" },
];
const projectDriveActions: Record<string, ClientAction[]> = {
  "AgePros By Swissmed": [
    { title:"Image Resources Folder", client:"AgePros By Swissmed", due:"Available now", type:"Drive", action:"Open Drive", href:"https://drive.google.com/drive/folders/1Xh9rHfeCym5e_zVVnPWAk6W99l6KrIC_" },
    { title:"Product Details Folder", client:"AgePros By Swissmed", due:"Available now", type:"Drive", action:"Open Drive", href:"https://drive.google.com/drive/folders/18KuBDljRuXFGYfC-DXdzuxeQSipga91_" },
  ],
};

function money(value: string) { return value; }

export default function Home() {
  const [section, setSection] = useState("overview");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [storeId, setStoreId] = useState("");
  const [loading, setLoading] = useState(false);
  const [adStatusFilter, setAdStatusFilter] = useState("All");
  const [adSearch, setAdSearch] = useState("");
  const [adPage, setAdPage] = useState(1);
  const [packagePrefills, setPackagePrefills] = useState<PackagePrefill[]>([]);

  async function load(id?: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard${id ? `?storeId=${encodeURIComponent(id)}` : ""}`, { cache:"no-store" });
      if (response.ok) {
        const next = await response.json(); setData(next); setStoreId(next.selectedStoreId ?? next.stores?.[0]?.id ?? "");
      }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const allStoresSelected = storeId === "all";
  const store = allStoresSelected ? null : (data?.stores.find(s => s.id === storeId) ?? data?.stores[0]);
  const staticSnapshot = store ? storeSnapshots[store.name] : null;
  const live = data?.snapshot?.payload ?? staticSnapshot ?? {};
  const noSample = Boolean(live.noSample);
  const overview = Array.isArray(live.overview) ? live.overview : overviewFallback;
  const adsBase = live.advertising ?? (allStoresSelected ? allStoresAdvertising : adFallback);
  const ads = data?.adBalance && !allStoresSelected
    ? { ...adsBase, balance:data.adBalance.balance, sourceUpdatedAt:data.adBalance.sourceUpdatedAt, syncStatus:data.adBalance.syncStatus }
    : adsBase;
  const importedStoreAds = adsData.filter((ad:any) => allStoresSelected || ad.store === store?.name);
  const adCampaigns = Array.isArray(live.adCampaigns) ? live.adCampaigns : (noSample ? [] : (importedStoreAds.length ? importedStoreAds : adCampaignFallback));
  const filteredAdCampaigns = adCampaigns.filter((ad:any) => (adStatusFilter === "All" || ad.status === adStatusFilter) && `${ad.name} ${ad.store ?? ""}`.toLowerCase().includes(adSearch.toLowerCase()));
  const adPageCount = Math.max(1, Math.ceil(filteredAdCampaigns.length / 25));
  const visibleAdCampaigns = filteredAdCampaigns.slice((adPage - 1) * 25, adPage * 25);
  const orders = Array.isArray(live.orders) ? live.orders : (noSample ? [] : ordersFallback);
  const driveActions = store ? (projectDriveActions[store.name] ?? []) : [];
  const clientActions = Array.isArray(live.clientActions) ? live.clientActions : (driveActions.length || noSample ? [] : actionFallback);
  const adFunds = buildAdvertisingFunds(ads);
  const generatedTopUpAction = buildTopUpAction(adFunds, store?.name ?? "Selected store");
  const visibleClientActionsBase = [...driveActions, ...clientActions];
  const visibleClientActions = generatedTopUpAction ? [generatedTopUpAction, ...visibleClientActionsBase.filter((action:ClientAction)=>action.type !== "Top-up" || !action.generated)] : visibleClientActionsBase;
  const warningOrders = orders.filter((order:any) => order.status === "Expired" || order.status === "Urgent");
  const importantWarningCount = warningOrders.length + (adFunds.lowBalance ? 1 : 0);
  const updated = allStoresSelected ? "17 Jul 2026, 3:13 am" : (live.sourceUpdated ?? (data?.snapshot?.importedAt ? new Date(data.snapshot.importedAt).toLocaleString("en-MY", { dateStyle:"medium", timeStyle:"short" }) : "Awaiting store import"));
  const hasRealData = Boolean(data?.snapshot || staticSnapshot);
  const target = live.target;
  const losses = live.losses;
  const orderSummary = live.orderSummary;
  const fakeSellerCases = Array.isArray(live.fakeSellerCases) ? live.fakeSellerCases as FakeSellerCase[] : undefined;
  const nav = useMemo(() => [["overview","Overview"],["design","Design Checker"],["calculator","Price Calculator"],["packages","Packages & Pricing"],["advertising","Advertising"],["orders","Orders & Inventory"],["health","Store Health"],["protection","Fake Seller Reports"],["actions","Client Action Center"]], []);

  return <main className="app-shell">
    <aside className="side">
      <div className="logo"><img src="/shopee-hub-logo-transparent.png" alt="ShopeeHub"/><small>STORE COMMAND CENTER</small></div>
      <nav>{nav.map(([id,label]) => <button key={id} className={section===id?"active":""} onClick={()=>setSection(id)}><span>{label.slice(0,1)}</span>{label}</button>)}</nav>
      <div className="fleet contact-card"><p>Contact Shopee Hub Specialist</p><strong>{allStoresSelected ? "Select a project" : (store?.contacts.length ? store.name : "Link unavailable")}</strong><div>{!allStoresSelected && store?.contacts.map(contact=><a key={contact.href} href={contact.href} target="_blank" rel="noopener noreferrer" title={contact.project}>{store.contacts.length > 1 ? contact.project : "Contact"} →</a>)}</div></div>
      <p className="access">Private access<br/><b>shopeehub.ctg@gmail.com</b></p>
    </aside>

    <section className="workspace">
      <header className="header">
        <div><p className="kicker">SHOPEE HUB PERFORMANCE</p><h1>{allStoresSelected ? "All Stores" : (store?.name ?? "J Packaging")}</h1></div>
        <div className="toolbar">
          <label>Store<select value={storeId} onChange={e=>{setStoreId(e.target.value);setAdPage(1);load(e.target.value)}}><option value="all">All Stores · MY & SG</option>{data?.stores.map(s=><option key={s.id} value={s.id}>{s.name} · {s.platform}</option>) ?? <option value="j-packaging-shopee">J Packaging · Shopee</option>}</select></label>
          <button onClick={()=>load(storeId)} disabled={loading}>{loading?"Updating…":"Update data"}</button>
        </div>
      </header>
      <div className="statusline"><span className={allStoresSelected||hasRealData?"":"sample"}/>{allStoresSelected?"Data snapshot · 62 connected Shopee stores":(hasRealData?`Real imported data${live.period ? ` · ${live.period}` : ""}`:"Sample layout — awaiting store import")} · Last updated {updated}</div>

      {section==="overview" && <div className="page">
        <div className="page-title"><div><p className="kicker">OVERVIEW</p><h2>Business Pulse</h2></div><div className="warning-pill">{importantWarningCount} important warnings</div></div>
        <section className="owner-brief"><div><span>今日重点</span><strong>{adFunds.lowBalance ? `Ad Balance ${formatRinggit(adFunds.balance)} · Top-up ${formatRinggit(adFunds.recommendedTopUp)}` : `${warningOrders.length} orders need attention`}</strong><small>{adFunds.syncStatus === "delayed" ? "Advertising data delayed" : (adFunds.lowBalance ? (adFunds.topUpOwner === "shopee_hub" ? "Managed by Shopee Hub" : "Action required") : "Ads healthy")}</small></div><button onClick={()=>setSection(adFunds.lowBalance?"advertising":"orders")}>View →</button></section>
        <section className="metric-grid">{overview.map((m:any)=><article className="metric" key={m[0]}><span>{m[0]}</span><strong>{m[1]}</strong><em>{m[2]}</em></article>)}</section>
        <section className="overview-grid">
          <article className="card target"><div className="card-head"><div><p className="kicker">MONTHLY TARGET</p><h3>{target?.goal ?? "RM 120,000"}</h3></div><strong>{target?.rate == null && noSample ? "暂无数据" : `${target?.rate ?? 68.4}%`}</strong></div><div className="progress"><i style={{width:`${target?.rate ?? (noSample ? 0 : 68.4)}%`}}/></div><div className="split"><span>Achieved <b>{target?.achieved ?? (noSample ? "暂无数据" : "RM 82,080")}</b></span><span>Projected month end <b>{target?.projected ?? (noSample ? "暂无数据" : "RM 126,430")}</b></span></div></article>
          <article className="card losses"><p className="kicker">ORDER LOSSES</p><div><span>Cancelled orders<b>{losses?.cancelledOrders ?? (noSample ? "暂无数据" : 28)}</b><small>{losses?.cancelledAmount ?? (noSample ? "暂无数据" : "RM 1,486.20")}</small></span><span>Refund orders<b>{losses?.refundOrders ?? (noSample ? "暂无数据" : 9)}</b><small>{losses?.refundAmount ?? (noSample ? "暂无数据" : "RM 422.60")}</small></span></div></article>
          <article className="card alerts detailed-alerts"><div className="card-head"><div><p className="kicker">IMPORTANT WARNINGS</p><h3>Requires immediate attention</h3></div><b>{warningOrders.length}</b></div><div className="warning-metrics"><span><b>{orders.filter((o:any)=>o.status==="Expired").length}</b> Expired orders</span><span><b>{orders.filter((o:any)=>o.status==="Urgent").length}</b> Urgent orders</span><span><b>0</b> Penalty points</span></div><div className="warning-orders">{warningOrders.map((o:any)=><div className="warning-order" key={o.id}><span className={`badge ${o.status.toLowerCase()}`}>{o.status}</span><div><b>{o.id}</b><small>{o.buyer} · {o.product}</small></div><div><b>{o.value}</b><small>Order {o.time}</small></div><div><b>{o.expire}</b><small>{o.status==="Expired"?"Expired":"Time left: "+o.left}</small></div></div>)}</div></article>
          <article className="card action-summary"><div className="card-head"><div><p className="kicker">CLIENT ACTION CENTER</p><h3>Waiting on client</h3></div><b>{visibleClientActions.length}</b></div><div className="chips"><span>{generatedTopUpAction ? `Top-up ${formatRinggit(adFunds.recommendedTopUp)}` : "Ads healthy"}</span><span>{adFunds.topUpOwner === "shopee_hub" ? "Managed by Shopee Hub" : "Client action"}</span></div><button onClick={()=>setSection("actions")}>Open action center →</button></article>
        </section>
      </div>}

      {section==="packages" && <div className="page"><PackageControl storeId={storeId || "all"} storeName={allStoresSelected ? "All stores" : (store?.name ?? "Selected store")} prefills={packagePrefills} onPrefillsAccepted={()=>setPackagePrefills([])} /></div>}
      {section==="calculator" && <div className="page"><PriceCalculator onCreatePackage={prefill=>{setPackagePrefills([prefill]);setSection("packages")}} onCreatePackages={prefills=>{setPackagePrefills(prefills);setSection("packages")}} /></div>}
      {section==="design" && <div className="page"><DesignChecker storeId={storeId}/></div>}
      {section==="protection" && <div className="page"><FakeSellerReport storeName={store?.name ?? "Selected store"} allStores={allStoresSelected} cases={fakeSellerCases}/></div>}

      {section==="advertising" && <div className="page"><div className="page-title"><div><p className="kicker">ADVERTISING</p><h2>Campaign Performance</h2></div><span className="period">This month</span></div><div className="advertising-summary-stack">
        <section className={`ad-funds-card ${adFunds.balanceStatus}`}><div className="ad-funds-status"><div><span>{adFunds.syncStatus === "delayed" ? "Data delayed" : (adFunds.lowBalance ? `Top-up ${formatRinggit(adFunds.recommendedTopUp)} required` : "Ads healthy")}</span><small>{adFunds.topUpOwner === "shopee_hub" ? "Managed by Shopee Hub" : (adFunds.approvalRequired ? "Approval needed" : "Client action")}</small></div><time>{adFunds.sourceUpdatedAt ? `Last updated ${adFunds.sourceUpdatedAt}` : "Last update unavailable"}</time></div><div className="fund-metric"><span>Ad Balance</span><strong>{formatRinggit(adFunds.balance, 2)}</strong></div><div className="fund-metric"><span>Ad Spend</span><strong>{formatRinggit(adFunds.averageDailySpend30d, 2)}</strong></div><div className="fund-metric"><span>Runway</span><strong>{adFunds.runwayDays == null ? "—" : `${Math.floor(adFunds.runwayDays)} days`}</strong></div><div className="fund-metric topup"><span>Top-up</span><strong>{formatRinggit(adFunds.recommendedTopUp)}</strong></div></section>
        <section className="metric-grid ads ad-primary-grid">{[["Ad Sales",ads.sales,"sales"],["ROAS",ads.roas,"roas"],["ACOS",ads.acos,"acos"],["Cost Per Conversion",ads.cpc,"cost"]].map(m=><article className={`metric ad-metric ${m[2]}`} key={m[0]}><span>{m[0]}</span><strong>{money(m[1])}</strong></article>)}</section>
        <section className="metric-grid ads ad-secondary-grid">{[["Views",ads.views,"reach",null],["Clicks",ads.clicks,"reach",null],["CTR",ads.ctr,"rate",parseFloat(ads.ctr)<2],["Conversion Rate",ads.conversionRate,"rate",parseFloat(ads.conversionRate)<2]].map(m=><article className={`metric ad-metric ${m[2]} ${m[3]===true?"danger":""}`} key={m[0] as string}><span>{m[0]}</span><strong>{money(m[1] as string)}</strong>{m[3]!==null&&<em>{m[3]?"Warning":"Normal"}</em>}</article>)}</section></div>
        <section className="campaign-section"><div className="campaign-heading"><div><p className="kicker">EVERY AD</p><h3>Individual advertisement data</h3><small>{adCampaigns.length} ads · {adCampaigns.filter((a:any)=>a.status==="Ongoing").length} ongoing · {adCampaigns.filter((a:any)=>a.status==="Paused").length} paused · {adCampaigns.filter((a:any)=>a.status==="Ended").length} ended</small></div><div className="campaign-counts"><span>{adCampaigns.filter((a:any)=>a.status==="Active"||a.status==="Ongoing").length} Active</span><span className="paused-count">{adCampaigns.filter((a:any)=>a.status==="Paused").length} Paused</span></div></div><div className="ad-controls"><div>{["All","Ongoing","Paused","Ended"].map(status=><button key={status} className={adStatusFilter===status?"active":""} onClick={()=>{setAdStatusFilter(status);setAdPage(1)}}>{status}</button>)}</div><input value={adSearch} onChange={e=>{setAdSearch(e.target.value);setAdPage(1)}} placeholder="Search ad or store" aria-label="Search advertisements"/></div><div className="card table-card"><table className="campaign-table"><thead><tr><th>Advertisement</th><th>Status</th><th>Budget</th><th>Spend</th><th>Ad Sales</th><th>ROAS</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Conversion</th><th>Sold</th><th>ACOS</th></tr></thead><tbody>{visibleAdCampaigns.map((a:any)=><tr key={a.id ?? a.name} className={a.status==="Paused"?"paused-row":""}><td><b>{a.name}</b><small>{a.store ? `${a.store} · ${a.type}` : a.type}</small></td><td><span className={`ad-status ${a.status.toLowerCase()}`}>{a.status}</span></td><td>{a.budget}</td><td>{a.spend}</td><td>{a.sales}</td><td><b>{a.roas}</b></td><td>{a.views}</td><td>{a.clicks}</td><td className={parseFloat(a.ctr)<2?"cell-warning":""}>{a.ctr}</td><td className={parseFloat(a.conversionRate)<2?"cell-warning":""}>{a.conversionRate}</td><td>{a.sold}</td><td>{a.acos}</td></tr>)}</tbody></table></div><div className="ad-pagination"><button disabled={adPage===1} onClick={()=>setAdPage(p=>Math.max(1,p-1))}>← Previous</button><span>Page {adPage} of {adPageCount} · {filteredAdCampaigns.length} ads</span><button disabled={adPage===adPageCount} onClick={()=>setAdPage(p=>Math.min(adPageCount,p+1))}>Next →</button></div></section>
      </div>}

      {section==="orders" && <div className="page"><div className="page-title"><div><p className="kicker">ORDERS & INVENTORY</p><h2>Today’s orders & deadlines</h2></div></div><section className="metric-grid three"><article className="metric"><span>Today’s Orders</span><strong>{orderSummary?.today ?? (noSample ? "暂无数据" : 98)}</strong></article><article className="metric warn"><span>Expiring Today</span><strong>{orderSummary?.expiringToday ?? (noSample ? "暂无数据" : 7)}</strong></article><article className="metric danger"><span>Expired</span><strong>{orderSummary?.expired ?? (noSample ? "暂无数据" : 2)}</strong></article></section><div className="card table-card"><table><thead><tr><th>Order</th><th>Buyer</th><th>Product</th><th>Order Time</th><th>Order Value</th><th>Expire Time</th><th>Time Left</th><th>Status</th></tr></thead><tbody>{orders.map((o:any)=><tr key={o.id}><td><b>{o.id}</b></td><td>{o.buyer}</td><td>{o.product}</td><td>{o.time}</td><td>{o.value}</td><td>{o.expire}</td><td>{o.left}</td><td><span className={`badge ${o.status.toLowerCase()}`}>{o.status}</span></td></tr>)}{noSample && !orders.length && <tr><td colSpan={8}>暂无数据</td></tr>}</tbody></table></div></div>}

      {section==="health" && noSample ? <div className="page"><div className="page-title"><div><p className="kicker">STORE HEALTH</p><h2>Reputation & compliance</h2></div></div><article className="card"><h3>暂无数据</h3><p>本次来源没有提供 Mizino Premium 的店铺健康指标。</p></article></div> : section==="health" && <div className="page"><div className="page-title"><div><p className="kicker">STORE HEALTH</p><h2>Reputation & compliance</h2></div><span className="health-status">Healthy</span></div><section className="metric-grid"><article className="metric"><span>Reviews</span><strong>4,286</strong><em>+182 this month</em></article><article className="metric danger"><span>Bad Reviews</span><strong>37</strong><em>0.86%</em></article><article className="metric"><span>Buyer Overall Rating</span><strong>4.92 / 5</strong></article><article className="metric"><span>Penalty Points</span><strong>0</strong><em>Normal</em></article></section><section className="health-grid"><article className="card reviews"><p className="kicker">RATING DISTRIBUTION</p>{[["5 stars",88],["4 stars",9],["1–3 stars",3]].map(r=><div key={r[0]}><span>{r[0]}</span><i><b style={{width:`${r[1]}%`}}/></i><strong>{r[1]}%</strong></div>)}</article><article className="card quality"><p className="kicker">SERVICE QUALITY</p>{[["Fast Handover Rate","96.8%"],["Chat Satisfaction","94.2%"],["Response Rate","98.1%"],["Late Shipment Rate","1.2%"]].map(r=><div key={r[0]}><span>{r[0]}</span><strong>{r[1]}</strong></div>)}</article><article className="card violations"><p className="kicker">LISTING VIOLATIONS</p><strong>0</strong><span>No active listing violations</span></article></section></div>}

      {section==="actions" && <div className="page"><div className="page-title"><div><p className="kicker">CLIENT ACTION CENTER</p><h2>What we need from the client</h2></div><span className="warning-pill">{visibleClientActions.length} open items</span></div>{adFunds.topUpOwner === "shopee_hub" && adFunds.lowBalance && <div className="managed-note">Top-up {formatRinggit(adFunds.recommendedTopUp)} · Managed by Shopee Hub</div>}<div className="action-list">{visibleClientActions.map((a:any)=><article className="card action" key={a.title}><div className={`type ${a.type.toLowerCase()}`}>{a.type.slice(0,1)}</div><div><span className="category">{a.type}</span><h3>{a.title}</h3><p>{a.client} · Due {a.due}</p></div>{a.href?<a className="action-link" href={a.href} target="_blank" rel="noopener noreferrer">{a.action}</a>:<button>{a.action}</button>}</article>)}</div></div>}
      <footer>Shopee Hub · 62 connected Shopee stores · 2 pending connection · Private command center</footer>
    </section>
  </main>;
}
