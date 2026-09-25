"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import adsData from "./ads-data.json";
import { PackageControl } from "./package-control";
import { PriceCalculator } from "./price-calculator";
import { DesignChecker } from "./design-checker";
import { FakeSellerReport, type FakeSellerCase } from "./fake-seller-report";
import type { PackagePrefill } from "./calculator-types";
import { storeSnapshots } from "./store-snapshots";
import { buildAdvertisingFunds, buildTopUpAction, formatRinggit } from "./advertising-model.js";
import { aggregateSelectedAdRows, selectAdRows, selectedAdDateFor } from "./ad-performance.js";
import type { ProjectProductProfile } from "./product-catalog";
import { PORTAL_MODULES, type PortalModuleId } from "./module-permissions";
import { PermissionSettings } from "./permission-settings";
import { DashboardLoading } from "./dashboard-loading";
import { projectDriveFolders } from "./project-drive-folders";

type Store = { id: string; name: string; platform: string; contacts: { project: string; href: string }[]; driveLink?: string | null };
type ManagementAction = { actionDate: string; category: string; title: string; detail: string };
type CoFundVoucher = { id:number; campaignName:string; campaignDate:string|null; campaignStartAt:string|null; campaignEndAt:string|null; voucherName:string; discountAmount:number; currency:string; quantity:number };
type VoucherPreset = { store:string; normal:number; campaign:number; available:true };
type DashboardResponse = { stores: Store[]; selectedStoreId: string | null; snapshot: { payload: any; importedAt: string } | null; adBalance: { balance:number; balanceDate:string; sourceUpdatedAt:string|null; syncStatus:string; topUpOwner?:string | null } | null; adPerformance?:DailyAd[]; adPerformanceUpdatedAt?:string|null; actions?: ManagementAction[]; productProfile?:ProjectProductProfile|null; coFundVouchers?:CoFundVoucher[]; voucherPreset?:VoucherPreset|null; access?:{ role:string; enabledModules:PortalModuleId[]; clientEnabledModules:PortalModuleId[]; canManagePermissions:boolean } };
type ClientAction = { title: string; client: string; due: string; type: string; action: string; href?: string; message?: string; generated?: boolean };
type DailyAd = { date:string; store:string; storeIds?:string[]; spend:number; sales:number; roas:number; views:number; clicks:number; ctr:number; conversion:number; sold:number; acos:number };

const overviewFallback = [
  ["Valid Order Sales", "RM 18,711.82", "+21.4%"], ["Valid Orders", "654", "+20.7%"],
  ["Customers", "527", "+14.2%"], ["Sales per Customer", "RM 35.51", "+6.3%"],
];
const unavailableAdvertising = { balance:null, averageDailySpend30d:null, syncStatus:"delayed", spend:"—", sales:"—", roas:"—", views:"—", clicks:"—", conversion:"—", sold:"—", cpc:"—", costPerConversion:"—", acos:"—", ctr:"—", conversionRate:"—" };
const emptyAdMetrics = { spend:"—", sales:"—", roas:"—", views:"—", clicks:"—", conversion:"—", sold:"—", cpc:"—", costPerConversion:"—", acos:"—", ctr:"—", conversionRate:"—" };
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
function driveActionsForStore(store: Store | null | undefined): ClientAction[] {
  if (!store) return [];
  const folders = projectDriveFolders[store.name];
  if (!folders) return [];
  return [
    {
      title:"Image Resources Folder",
      client:store.name,
      due:"Available now",
      type:"Drive",
      action:"Open Drive",
      href:folders.imageResources,
    },
    {
      title:"Product Details Folder",
      client:store.name,
      due:"Available now",
      type:"Drive",
      action:"Open Drive",
      href:folders.productDetails,
    },
  ];
}

function money(value: string) { return value; }
function formatMoney(value: number) {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}

function formatAdDate(date:string) {
  return date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}) : "No data";
}

function formatAdSyncTime(value:string|null|undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "unavailable";
  return `${new Date(value).toLocaleString("en-MY",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone:"Asia/Kuala_Lumpur"})} MYT`;
}

function managementActionToClientAction(action: ManagementAction, client: string): ClientAction {
  return {
    title: action.title,
    client,
    due: action.actionDate,
    type: action.category,
    action: "Review",
    message: action.detail,
  };
}

export default function Home() {
  const [requestedSection, setSection] = useState("overview");
  const [sidebarCollapsed,setSidebarCollapsed] = useState(false);
  const [data, setData] = useState<(DashboardResponse & { user: { email:string } }) | null>(null);
  const [loadError, setLoadError] = useState("");
  const loadSequence = useRef(0);
  const allowedSections = data?.access?.enabledModules ?? [];
  const section = (requestedSection === "permissions" ? data?.access?.canManagePermissions : allowedSections.includes(requestedSection as PortalModuleId))
    ? requestedSection : allowedSections[0] ?? (data?.access?.canManagePermissions ? "permissions" : "");
  const [storeId, setStoreId] = useState("");
  const [storeSelectionMade,setStoreSelectionMade] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adStatusFilter, setAdStatusFilter] = useState("All");
  const [adSearch, setAdSearch] = useState("");
  const [adPage, setAdPage] = useState(1);
  const [adPeriodMode, setAdPeriodMode] = useState<"mtd"|"month"|"date"|"range">("mtd");
  const [adDate, setAdDate] = useState("");
  const [adMonth, setAdMonth] = useState("");
  const [adRangeStart, setAdRangeStart] = useState("");
  const [adRangeEnd, setAdRangeEnd] = useState("");
  const [packagePrefills, setPackagePrefills] = useState<PackagePrefill[]>([]);
  const [standalonePackageCreate, setStandalonePackageCreate] = useState(false);

  async function load(id?: string) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/dashboard${id ? `?storeId=${encodeURIComponent(id)}` : ""}`, { cache:"no-store" });
      if (sequence !== loadSequence.current) return;
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(response.status === 403 ? "Your account does not have access to this dashboard or store." : "Unable to load your dashboard. Please try again.");
      const next = await response.json();
      if (sequence !== loadSequence.current) return;
      if (!next.access || !Array.isArray(next.access.enabledModules) || !next.user?.email || !Array.isArray(next.stores)) throw new Error("Unable to verify your dashboard access. Please try again.");
      setData(next); setStoreId(next.selectedStoreId ?? next.stores?.[0]?.id ?? "");
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setData(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load your dashboard. Please try again.");
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "permissions") setSection("permissions");
    const draftKey = params.get("packageDraft");
    if (params.get("section") === "packages") setSection("packages");
    if (draftKey) {
      try {
        const saved = window.localStorage.getItem(`package-draft:${draftKey}`);
        if (saved) {
          const draft = JSON.parse(saved) as { prefills:PackagePrefill[]; storeId?:string };
          setPackagePrefills(draft.prefills ?? []);
          setStandalonePackageCreate(true);
          setStoreSelectionMade(true);
          window.localStorage.removeItem(`package-draft:${draftKey}`);
          load(draft.storeId && draft.storeId !== "all" ? draft.storeId : undefined);
          return;
        }
      } catch {
        // Fall back to the regular Packages page if the transferred draft is unavailable.
      }
    }
    load();
  }, []);

  function openPackageDraft(prefills:PackagePrefill[]) {
    const draftKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(`package-draft:${draftKey}`, JSON.stringify({ prefills, storeId }));
    window.open(`${window.location.pathname}?section=packages&packageDraft=${encodeURIComponent(draftKey)}`, "_blank", "noopener,noreferrer");
  }
  const allStoresSelected = storeId === "all";
  const store = allStoresSelected ? null : (data?.stores.find(s => s.id === storeId) ?? data?.stores[0]);
  const staticSnapshot = store ? storeSnapshots[store.name] : null;
  const live = data?.snapshot?.payload ?? staticSnapshot ?? {};
  const noSample = Boolean(live.noSample);
  const overview = Array.isArray(live.overview) ? live.overview : overviewFallback;
  const adsBase = data?.adPerformance?.length ? { ...unavailableAdvertising, ...(live.advertising ?? {}) } : unavailableAdvertising;
  const importedStoreAds = adsData.filter((ad:any) => allStoresSelected || ad.store === store?.name);
  const relevantDailyAds = data?.adPerformance ?? [];
  const availableAdDates = [...new Set(relevantDailyAds.map(row=>row.date))].sort((a,b)=>b.localeCompare(a));
  const availableAdMonths = [...new Set(availableAdDates.map(date=>date.slice(0,7)))].sort((a,b)=>b.localeCompare(a));
  const latestAdDate = availableAdDates[0] ?? "";
  const selectedAdDate = selectedAdDateFor(adDate,availableAdDates);
  const selectedAdMonth = adMonth && availableAdMonths.includes(adMonth) ? adMonth : (availableAdMonths[0] ?? "");
  const earliestAdDate = availableAdDates[availableAdDates.length-1] ?? "";
  const selectedRangeStart = adRangeStart || earliestAdDate;
  const selectedRangeEnd = adRangeEnd || (availableAdDates[0] ?? "");
  const selectedDailyAds = selectAdRows(relevantDailyAds,adPeriodMode,{month:selectedAdMonth,date:selectedAdDate,rangeStart:selectedRangeStart,rangeEnd:selectedRangeEnd,latestDate:latestAdDate});
  const dailyAd = aggregateSelectedAdRows(selectedDailyAds);
  const coveredAdStores = new Set(selectedDailyAds.flatMap((row:DailyAd)=>row.storeIds ?? [])).size;
  const selectedPeriodLabel = adPeriodMode === "mtd" ? (latestAdDate ? `${formatAdDate(`${latestAdDate.slice(0,7)}-01`)} – ${formatAdDate(latestAdDate)}` : "No data")
    : adPeriodMode === "month" ? selectedAdMonth || "No data"
    : adPeriodMode === "range" ? `${formatAdDate(selectedRangeStart)} – ${formatAdDate(selectedRangeEnd)}`
    : formatAdDate(selectedAdDate);
  const periodSpendLabel = adPeriodMode === "date" ? "Daily Spend" : "Ad Spend";
  const averageDailySpend = relevantDailyAds.length
    ? relevantDailyAds.reduce((total,row)=>total+row.spend,0) / Math.max(1, new Set(relevantDailyAds.map(row=>row.date)).size)
    : null;
  const effectiveBalance = data?.adBalance;
  const balanceAds = effectiveBalance && !allStoresSelected
    ? { ...adsBase, balance:effectiveBalance.balance, averageDailySpend30d:averageDailySpend, sourceUpdatedAt:effectiveBalance.sourceUpdatedAt, syncStatus:effectiveBalance.syncStatus, topUpOwner:effectiveBalance.topUpOwner ?? adsBase.topUpOwner }
    : adsBase;
  const ads = dailyAd ? {
    ...balanceAds,
    averageDailySpend30d:averageDailySpend,
    spend:formatMoney(dailyAd.spend), sales:formatMoney(dailyAd.sales), roas:`${dailyAd.roas.toFixed(2)}×`,
    views:dailyAd.views.toLocaleString("en-MY"), clicks:dailyAd.clicks.toLocaleString("en-MY"),
    ctr:`${(dailyAd.ctr * 100).toFixed(2)}%`, conversion:String(dailyAd.conversion), sold:String(dailyAd.sold),
    acos:`${(dailyAd.acos * 100).toFixed(2)}%`,
    cpc:dailyAd.cpc == null ? "—" : formatMoney(dailyAd.cpc),
    costPerConversion:dailyAd.costPerConversion == null ? "—" : formatMoney(dailyAd.costPerConversion),
    conversionRate:`${(dailyAd.conversionRate * 100).toFixed(2)}%`,
  } : { ...balanceAds, ...emptyAdMetrics };
  const adTotalMetrics = [["Ad Spend",ads.spend],["Ad Sales",ads.sales],["ROAS",ads.roas],["ACOS",ads.acos],["Views",ads.views],["Clicks",ads.clicks],["CTR",ads.ctr],["Conversions",ads.conversion],["Sold",ads.sold],["CPC",ads.cpc],["Conversion Rate",ads.conversionRate],["Cost Per Conversion",ads.costPerConversion]];
  const adCampaigns = Array.isArray(live.adCampaigns) ? live.adCampaigns : importedStoreAds;
  const filteredAdCampaigns = adCampaigns.filter((ad:any) => (adStatusFilter === "All" || ad.status === adStatusFilter) && `${ad.name} ${ad.store ?? ""}`.toLowerCase().includes(adSearch.toLowerCase()));
  const adPageCount = Math.max(1, Math.ceil(filteredAdCampaigns.length / 25));
  const visibleAdCampaigns = filteredAdCampaigns.slice((adPage - 1) * 25, adPage * 25);
  const orders = Array.isArray(live.orders) ? live.orders : (noSample ? [] : ordersFallback);
  const driveActions = driveActionsForStore(store);
  const importedClientActions = data?.actions?.map(action=>managementActionToClientAction(action, store?.name ?? "Selected store")) ?? [];
  const clientActions = Array.isArray(live.clientActions) ? live.clientActions : importedClientActions;
  const adFunds = buildAdvertisingFunds(ads);
  const generatedTopUpAction = buildTopUpAction(adFunds, store?.name ?? "Selected store", { projectGroupHref:store?.contacts[0]?.href });
  const visibleClientActionsBase = [...driveActions, ...clientActions];
  const visibleClientActions = generatedTopUpAction ? [generatedTopUpAction, ...visibleClientActionsBase.filter((action:ClientAction)=>action.type !== "Top-up" || !action.generated)] : visibleClientActionsBase;
  const warningOrders = orders.filter((order:any) => order.status === "Expired" || order.status === "Urgent");
  const importantWarningCount = warningOrders.length + (adFunds.lowBalance ? 1 : 0);
  const target = live.target;
  const losses = live.losses;
  const orderSummary = live.orderSummary;
  const fakeSellerCases = Array.isArray(live.fakeSellerCases) ? live.fakeSellerCases as FakeSellerCase[] : undefined;
  const nav = useMemo(() => {
    const allowed = new Set(data?.access?.enabledModules ?? []);
    const items: (readonly [string, string])[] = PORTAL_MODULES.filter(({ id }) => allowed.has(id)).map(({ id, label }) => [id, id === "packages" ? "Packages & Pricing" : label] as const);
    if (data?.access?.canManagePermissions) items.push(["permissions", "Permission Settings"] as const);
    return items;
  }, [data?.access]);
  if (!data && !loadError) return <DashboardLoading />;
  if (!data || !section || loadError) return <main className="login-shell"><section className="login-card" aria-busy={false}>
    <img src="/shopee-hub-logo-transparent.png" alt="ShopeeHub"/>
    <h1>{loadError ? "Dashboard unavailable" : !data ? "Loading your dashboard…" : "No modules assigned"}</h1>
    <p role={loadError ? "alert" : "status"}>{loadError || (!data ? "Preparing your account and workspace." : "Please contact your administrator to request access.")}</p>
    {loadError && <button onClick={()=>load()} disabled={loading}>Try again</button>}
    {(loadError || data) && <a href="/login">Back to sign in</a>}
  </section></main>;
  return <main className={`app-shell${sidebarCollapsed?" sidebar-collapsed":""}`}>
    <aside className="side">
      <div className="logo"><img src="/shopee-hub-logo-transparent.png" alt="ShopeeHub"/><small>STORE COMMAND CENTER</small></div>
      <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(current=>!current)} aria-label={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"} title={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"}>{sidebarCollapsed?"›":"‹"}</button>
      <nav>{nav.map(([id,label]) => <button key={id} className={section===id?"active":""} onClick={()=>setSection(id)}><span>{label.slice(0,1)}</span>{label}</button>)}</nav>
      <div className="fleet contact-card"><p>Contact Shopee Hub Specialist</p><strong>{allStoresSelected ? "Select a project" : (store?.contacts.length ? store.name : "Link unavailable")}</strong><div>{!allStoresSelected && store?.contacts.map(contact=><a key={contact.href} href={contact.href} target="_blank" rel="noopener noreferrer" title={contact.project}>{store.contacts.length > 1 ? contact.project : "Contact"} →</a>)}</div></div>
      <p className="access">{data.access?.role === "superadmin" ? "Super Admin access" : "Private access"}<br/><b>{data.user.email}</b></p>
    </aside>

    <section className="workspace">
      <header className="header">
        <div><p className="kicker">SHOPEE HUB PERFORMANCE</p><h1>{section==="packages"&&!storeSelectionMade?"No Store Selected":allStoresSelected ? "All Stores" : (store?.name ?? "J Packaging")}</h1></div>
        <div className="toolbar">
          <label>Store<select value={section==="packages"&&!storeSelectionMade?"":storeId} onChange={e=>{setStoreSelectionMade(true);setStoreId(e.target.value);setAdPage(1);load(e.target.value)}}><option value="" disabled>Select a Store</option><option value="all">All Stores</option>{data?.stores.map(s=><option key={s.id} value={s.id}>{s.name} · {s.platform.replace("Shopee ", "")}</option>) ?? <option value="j-packaging-shopee">J Packaging · MY</option>}</select></label>
          <button onClick={()=>load(storeId)} disabled={loading}>{loading?"Updating…":"Update data"}</button>
        </div>
      </header>
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

      {section==="packages" && <div className="page"><PackageControl storeId={storeSelectionMade?storeId:""} storeName={!storeSelectionMade?"No Store Selected":allStoresSelected?"All Accessible Stores":(store?.name ?? "Selected Store")} prefills={packagePrefills} standaloneCreate={standalonePackageCreate} onPrefillsAccepted={()=>setPackagePrefills([])} /></div>}
      {section==="calculator" && <div className="page calculator-page" aria-label="Price Calculator"><PriceCalculator storeName={allStoresSelected?"":(store?.name??"")} productProfile={allStoresSelected?null:data?.productProfile} coFundVouchers={allStoresSelected?[]:data?.coFundVouchers} voucherPreset={allStoresSelected?null:data?.voucherPreset} onCreatePackage={prefill=>openPackageDraft([prefill])} onCreatePackages={openPackageDraft} /></div>}
      {section==="design" && <div className="page"><DesignChecker storeId={storeId}/></div>}
      {section==="protection" && <div className="page"><FakeSellerReport storeName={store?.name ?? "Selected store"} allStores={allStoresSelected} cases={fakeSellerCases}/></div>}
      {section==="permissions" && data?.access?.canManagePermissions && <div className="page"><PermissionSettings initialEnabledModules={data.access.clientEnabledModules}/></div>}

      {section==="advertising" && <div className="page"><div className="page-title ad-page-title"><div><p className="kicker">ADVERTISING</p><h2>Performance</h2></div><div className="ad-period-controls"><label><span>View by</span><select aria-label="Advertising period type" value={adPeriodMode} onChange={event=>setAdPeriodMode(event.target.value as "mtd"|"month"|"date"|"range")}><option value="mtd">Month to date</option><option value="month">Month</option><option value="date">Date</option><option value="range">Custom range</option></select></label>{adPeriodMode === "month" && <label><span>Month</span><input aria-label="Advertising month" type="month" value={selectedAdMonth} min={availableAdMonths[availableAdMonths.length-1]} max={availableAdMonths[0]} onChange={event=>setAdMonth(event.target.value)}/></label>}{adPeriodMode === "date" && <label><span>Date</span><input aria-label="Advertising date" type="date" value={selectedAdDate} min={earliestAdDate} max={availableAdDates[0]} onChange={event=>setAdDate(event.target.value)} disabled={!availableAdDates.length}/></label>}{adPeriodMode === "range" && <><label><span>From</span><input aria-label="Advertising range start" type="date" value={selectedRangeStart} min={earliestAdDate} max={selectedRangeEnd} onChange={event=>setAdRangeStart(event.target.value)}/></label><label><span>To</span><input aria-label="Advertising range end" type="date" value={selectedRangeEnd} min={selectedRangeStart} max={availableAdDates[0]} onChange={event=>setAdRangeEnd(event.target.value)}/></label></>}</div></div>
        {allStoresSelected && <section className="ad-total-overview" aria-label="All Stores advertising overview">
          <div className="ad-total-heading"><div><p className="kicker">ALL STORES TOTAL</p><h3>Advertising overview</h3><p>{selectedPeriodLabel}</p></div><div className="ad-total-coverage"><strong>{coveredAdStores} / {data.stores.length}</strong><span>stores with data in this period</span><small>Last updated {formatAdSyncTime(data.adPerformanceUpdatedAt)}</small></div></div>
          <div className="ad-total-grid">{adTotalMetrics.map(([label,value])=><article className="metric ad-total-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        </section>}
        {!allStoresSelected && <div className="advertising-summary-stack">
        <section className={`ad-funds-card ${adFunds.balanceStatus}`}><div className="ad-funds-status"><div><span>{adFunds.syncStatus === "delayed" ? "Data delayed" : (adFunds.lowBalance ? `Top-up ${formatRinggit(adFunds.recommendedTopUp)} required` : "Ads healthy")}</span><small>{adFunds.topUpOwner === "shopee_hub" ? "Managed by Shopee Hub" : (adFunds.approvalRequired ? "Approval needed" : "Client action")}</small></div><time>{effectiveBalance?.sourceUpdatedAt ? `Last updated ${formatAdSyncTime(effectiveBalance.sourceUpdatedAt)}` : effectiveBalance?.balanceDate ? `Updated on ${formatAdDate(effectiveBalance.balanceDate)}` : "Last update unavailable"}</time></div><div className="fund-metric"><span>Ad Balance</span><strong>{formatRinggit(adFunds.balance, 2)}</strong></div><div className="fund-metric"><span>{periodSpendLabel}</span><strong>{ads.spend ?? "—"}</strong></div><div className="fund-metric"><span>Runway</span><strong>{adFunds.runwayDays == null ? "—" : `${Math.floor(adFunds.runwayDays)} days`}</strong></div><div className="fund-metric topup"><span>Top-up</span><strong>{formatRinggit(adFunds.recommendedTopUp)}</strong></div></section>
        <section className="metric-grid ads ad-primary-grid">{[["Ad Sales",ads.sales,"sales"],["ROAS",ads.roas,"roas"],["ACOS",ads.acos,"acos"],["Cost Per Conversion",ads.costPerConversion,"cost"]].map(m=><article className={`metric ad-metric ${m[2]}`} key={m[0]}><span>{m[0]}</span><strong>{money(m[1])}</strong></article>)}</section>
        <section className="metric-grid ads ad-secondary-grid">{[["Views",ads.views,"reach",null],["Clicks",ads.clicks,"reach",null],["CTR",ads.ctr,"rate",parseFloat(ads.ctr)<2],["Conversion Rate",ads.conversionRate,"rate",parseFloat(ads.conversionRate)<2]].map(m=><article className={`metric ad-metric ${m[2]} ${m[3]===true?"danger":""}`} key={m[0] as string}><span>{m[0]}</span><strong>{money(m[1] as string)}</strong>{m[3]!==null&&<em>{m[3]?"Warning":"Normal"}</em>}</article>)}</section></div>}
        {!allStoresSelected && adCampaigns.length > 0 && <section className="campaign-section"><div className="campaign-heading"><div><p className="kicker">EVERY AD</p><h3>Individual advertisement data</h3><small>Reporting date unavailable · period selector applies to summary metrics only · {adCampaigns.length} ads</small></div><div className="campaign-counts"><span>{adCampaigns.filter((a:any)=>a.status==="Active"||a.status==="Ongoing").length} Active</span><span className="paused-count">{adCampaigns.filter((a:any)=>a.status==="Paused").length} Paused</span></div></div><div className="ad-controls"><div>{["All","Ongoing","Paused","Ended"].map(status=><button key={status} className={adStatusFilter===status?"active":""} onClick={()=>{setAdStatusFilter(status);setAdPage(1)}}>{status}</button>)}</div><input value={adSearch} onChange={e=>{setAdSearch(e.target.value);setAdPage(1)}} placeholder="Search ad or store" aria-label="Search advertisements"/></div><div className="card table-card"><table className="campaign-table"><thead><tr><th>Advertisement</th><th>Status</th><th>Budget</th><th>Spend</th><th>Ad Sales</th><th>ROAS</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Conversion</th><th>Sold</th><th>ACOS</th></tr></thead><tbody>{visibleAdCampaigns.map((a:any)=><tr key={a.id ?? a.name} className={a.status==="Paused"?"paused-row":""}><td><b>{a.name}</b><small>{a.store ? `${a.store} · ${a.type}` : a.type}</small></td><td><span className={`ad-status ${a.status.toLowerCase()}`}>{a.status}</span></td><td>{a.budget}</td><td>{a.spend}</td><td>{a.sales}</td><td><b>{a.roas}</b></td><td>{a.views}</td><td>{a.clicks}</td><td className={parseFloat(a.ctr)<2?"cell-warning":""}>{a.ctr}</td><td className={parseFloat(a.conversionRate)<2?"cell-warning":""}>{a.conversionRate}</td><td>{a.sold}</td><td>{a.acos}</td></tr>)}</tbody></table></div><div className="ad-pagination"><button disabled={adPage===1} onClick={()=>setAdPage(p=>Math.max(1,p-1))}>← Previous</button><span>Page {adPage} of {adPageCount} · {filteredAdCampaigns.length} ads</span><button disabled={adPage===adPageCount} onClick={()=>setAdPage(p=>Math.min(adPageCount,p+1))}>Next →</button></div></section>}
      </div>}

      {section==="orders" && <div className="page"><div className="page-title"><div><p className="kicker">ORDERS & INVENTORY</p><h2>Today’s orders & deadlines</h2></div></div><section className="metric-grid three"><article className="metric"><span>Today’s Orders</span><strong>{orderSummary?.today ?? (noSample ? "暂无数据" : 98)}</strong></article><article className="metric warn"><span>Expiring Today</span><strong>{orderSummary?.expiringToday ?? (noSample ? "暂无数据" : 7)}</strong></article><article className="metric danger"><span>Expired</span><strong>{orderSummary?.expired ?? (noSample ? "暂无数据" : 2)}</strong></article></section><div className="card table-card"><table><thead><tr><th>Order</th><th>Buyer</th><th>Product</th><th>Order Time</th><th>Order Value</th><th>Expire Time</th><th>Time Left</th><th>Status</th></tr></thead><tbody>{orders.map((o:any)=><tr key={o.id}><td><b>{o.id}</b></td><td>{o.buyer}</td><td>{o.product}</td><td>{o.time}</td><td>{o.value}</td><td>{o.expire}</td><td>{o.left}</td><td><span className={`badge ${o.status.toLowerCase()}`}>{o.status}</span></td></tr>)}{noSample && !orders.length && <tr><td colSpan={8}>暂无数据</td></tr>}</tbody></table></div></div>}

      {section==="health" && noSample ? <div className="page"><div className="page-title"><div><p className="kicker">STORE HEALTH</p><h2>Reputation & compliance</h2></div></div><article className="card"><h3>暂无数据</h3><p>本次来源没有提供 Mizino Premium 的店铺健康指标。</p></article></div> : section==="health" && <div className="page"><div className="page-title"><div><p className="kicker">STORE HEALTH</p><h2>Reputation & compliance</h2></div><span className="health-status">Healthy</span></div><section className="metric-grid"><article className="metric"><span>Reviews</span><strong>4,286</strong><em>+182 this month</em></article><article className="metric danger"><span>Bad Reviews</span><strong>37</strong><em>0.86%</em></article><article className="metric"><span>Buyer Overall Rating</span><strong>4.92 / 5</strong></article><article className="metric"><span>Penalty Points</span><strong>0</strong><em>Normal</em></article></section><section className="health-grid"><article className="card reviews"><p className="kicker">RATING DISTRIBUTION</p>{[["5 stars",88],["4 stars",9],["1–3 stars",3]].map(r=><div key={r[0]}><span>{r[0]}</span><i><b style={{width:`${r[1]}%`}}/></i><strong>{r[1]}%</strong></div>)}</article><article className="card quality"><p className="kicker">SERVICE QUALITY</p>{[["Fast Handover Rate","96.8%"],["Chat Satisfaction","94.2%"],["Response Rate","98.1%"],["Late Shipment Rate","1.2%"]].map(r=><div key={r[0]}><span>{r[0]}</span><strong>{r[1]}</strong></div>)}</article><article className="card violations"><p className="kicker">LISTING VIOLATIONS</p><strong>0</strong><span>No active listing violations</span></article></section></div>}

      {section==="actions" && <div className="page"><div className="page-title"><div><p className="kicker">CLIENT ACTION CENTER</p><h2>What we need from the client</h2></div><span className="warning-pill">{visibleClientActions.length} open items</span></div>{adFunds.topUpOwner === "shopee_hub" && adFunds.lowBalance && <div className="managed-note">Top-up {formatRinggit(adFunds.recommendedTopUp)} · Managed by Shopee Hub</div>}{visibleClientActions.length ? <div className="action-list">{visibleClientActions.map((a:any)=><article className="card action" key={a.title}><div className={`type ${a.type.toLowerCase()}`}>{a.type.slice(0,1)}</div><div><span className="category">{a.type}</span><h3>{a.title}</h3><p>{a.client} · Due {a.due}</p>{a.message&&<p className="action-message">{a.message}</p>}</div>{a.href?<a className="action-link" href={a.href} target="_blank" rel="noopener noreferrer">{a.action}</a>:<button>{a.action}</button>}</article>)}</div> : <article className="card empty-actions"><h3>No client action needed</h3><p>当前没有需要客户处理的事项。</p></article>}</div>}
      <footer>Shopee Hub · Private command center</footer>
    </section>
  </main>;
}
