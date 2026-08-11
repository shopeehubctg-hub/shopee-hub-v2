"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";

type ComponentLine = { inventorySku:string; name:string; quantity:number; kind:"product"|"gift" };
type PlatformName = "Shopee"|"Lazada"|"TikTok Shop";
type PlatformLine = { platform:PlatformName; packageSku:string };
type MarketName = "MY"|"SG";
type PriceType = "non_campaign"|"campaign";
type CampaignEvent = "dday"|"mid_month"|"payday";
type PriceSchedule = {
  market:MarketName; priceType:PriceType; originalPrice:number; sellingPrice:number;
  promotionType:"monthly"|"custom"; effectiveFrom:string; effectiveTo:string;
};
type CalculatorHistorySettings = CalculatorSnapshot | { scenarios:CalculatorSnapshot[] };
type HistoryLine = {
  version:number; changeNote:string; promotionType:"monthly"|"custom"; effectiveFrom:string; effectiveTo?:string|null;
  addedComponents?:ComponentLine[]; removedComponents?:ComponentLine[]; platforms?:PlatformLine[];
  sheetSyncStatus?:"pending"|"synced"|"failed"; createdAt:string; createdBy:string;
  calculatorSettings?:CalculatorHistorySettings|null;
};
type PackageItem = {
  id:string; storeId:string; packageSku:string; name:string; market:string; status:string; version:number;
  promotionType:"monthly"|"custom"; originalPrice:number; sellingPrice:number; effectiveFrom:string; effectiveTo?:string|null;
  components:ComponentLine[]; platforms:PlatformLine[]; sheetSyncStatus?:"pending"|"synced"|"failed"; history?:HistoryLine[];
  priceSchedules?:PriceSchedule[];
};
type Props = { storeId:string; storeName:string; canCreate?:boolean; prefills?:PackagePrefill[]; standaloneCreate?:boolean; onPrefillsAccepted?:()=>void };

const PLATFORM_NAMES:PlatformName[] = ["Shopee","Lazada","TikTok Shop"];
const HISTORY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit#gid=2129880014";
const blankLine = ():ComponentLine => ({ inventorySku:"", name:"", quantity:1, kind:"product" });
const blankPeriod = () => ({ promotionType:"monthly" as "monthly"|"custom", promotionMonth:"", effectiveFrom:"", effectiveTo:"" });
const blankForm = () => ({
  name:"", status:"draft", markets:["MY"] as MarketName[],
  nonCampaign:blankPeriod(), campaign:{...blankPeriod(),promotionType:"custom" as const,campaignEvents:["dday"] as CampaignEvent[]},
  prices:{
    MY:{ nonCampaignOriginal:"", nonCampaignSelling:"", campaignOriginal:"", campaignSelling:"" },
    SG:{ nonCampaignOriginal:"", nonCampaignSelling:"", campaignOriginal:"", campaignSelling:"" },
  },
  changeNote:"Initial version",
});
const money = (value:number, market:string, stored=false) => `${market === "SG" ? "S$" : "RM"} ${(stored ? value / 100 : value).toFixed(2)}`;
const lineText = (line:ComponentLine) => `${line.inventorySku} ×${line.quantity}`;
const calculatorSnapshots = (settings:CalculatorHistorySettings) => "scenarios" in settings ? settings.scenarios : [settings];

function monthDates(month:string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from:"", to:"" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from:`${month}-01`, to:`${month}-${String(lastDay).padStart(2,"0")}` };
}

function campaignDates(month:string,event:CampaignEvent) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from:"", to:"" };
  const monthNumber=Number(month.slice(5));
  const [startDay,endDay]=event==="dday"?[Math.max(1,monthNumber-2),monthNumber]:event==="mid_month"?[14,15]:[24,25];
  const day=(value:number)=>String(value).padStart(2,"0");
  return {from:`${month}-${day(startDay)}`,to:`${month}-${day(endDay)}`};
}

function campaignEventForDates(from:string,to:string):CampaignEvent {
  if (from.slice(-2)==="14"&&to.slice(-2)==="15") return "mid_month";
  if (from.slice(-2)==="24"&&to.slice(-2)==="25") return "payday";
  return "dday";
}

export function PackageControl({ storeId, storeName, canCreate=true, prefills=[], standaloneCreate=false, onPrefillsAccepted }:Props) {
  const [items,setItems] = useState<PackageItem[]>([]);
  const [source,setSource] = useState("");
  const [filter,setFilter] = useState("all");
  const [search,setSearch] = useState("");
  const [showCreate,setShowCreate] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [messageType,setMessageType] = useState<"success"|"warning"|"error">("success");
  const [editingPackageId,setEditingPackageId] = useState<string|null>(null);
  const [openHistory,setOpenHistory] = useState<string|null>(null);
  const [form,setForm] = useState(blankForm());
  const [components,setComponents] = useState<ComponentLine[]>([blankLine()]);
  const [platforms,setPlatforms] = useState<PlatformLine[]>([{platform:"Shopee",packageSku:""}]);
  const [calculatorSettings,setCalculatorSettings] = useState<CalculatorSnapshot|null>(null);
  const [prefillQueue,setPrefillQueue] = useState<PackagePrefill[][]>([]);
  const [prefillBatch,setPrefillBatch] = useState<PackagePrefill[]>([]);

  async function load() {
    const response = await fetch(`/api/packages?storeId=${encodeURIComponent(storeId || "all")}`,{cache:"no-store"});
    if (response.ok) {
      const data=await response.json();
      setItems(data.packages ?? []);
      setSource(data.source ?? "");
    }
  }
  useEffect(()=>{ load(); },[storeId]);
  function groupPrefills(input:PackagePrefill[]) {
    const groups = new Map<string,PackagePrefill[]>();
    input.forEach(item=>{
      const key=item.name.trim().toLowerCase();
      groups.set(key,[...(groups.get(key)??[]),item]);
    });
    return [...groups.values()];
  }
  function openPrefill(group:PackagePrefill[]) {
    resetForm();
    const first=group[0];
    const nonCampaign=group.find(item=>item.calculatorSettings.serviceScenario==="Non-Campaign Day")??first;
    const campaign=group.find(item=>item.calculatorSettings.serviceScenario==="Campaign Day")??first;
    const nonCampaignPrice=nonCampaign.sellingPrice.toFixed(2);
    const campaignPrice=campaign.sellingPrice.toFixed(2);
    setForm(current=>({...current,name:first.name,prices:{...current.prices,MY:{
      nonCampaignOriginal:"",nonCampaignSelling:nonCampaignPrice,
      campaignOriginal:"",campaignSelling:campaignPrice,
    }},changeNote:"Created from Shopee Pricing Calculator"}));
    setCalculatorSettings(first.calculatorSettings);
    setMessage("");
    setShowCreate(true);
  }
  useEffect(()=>{
    if (!prefills.length) return;
    const grouped=groupPrefills(prefills);
    openPrefill(grouped[0]);
    setPrefillQueue(grouped.slice(1));
    setPrefillBatch(prefills);
    onPrefillsAccepted?.();
  },[prefills[0]?.requestId]);

  const visible = useMemo(()=>items.filter(item =>
    (filter==="all"||item.status===filter) &&
    `${item.packageSku} ${item.name} ${item.platforms?.map(platform=>platform.packageSku).join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ),[items,filter,search]);
  const active = items.filter(item=>item.status==="active").length;
  const scheduled = items.filter(item=>item.status==="scheduled").length;
  const drafts = items.filter(item=>item.status==="draft"||item.status==="review").length;

  function resetForm() {
    setEditingPackageId(null);
    setForm(blankForm());
    setComponents([blankLine()]);
    setPlatforms([{platform:"Shopee",packageSku:""}]);
    setCalculatorSettings(null);
  }

  function openNew() {
    setPrefillQueue([]);
    setPrefillBatch([]);
    resetForm();
    setMessage("");
    setShowCreate(true);
  }

  function closeCreate() {
    if (standaloneCreate) {
      window.close();
      return;
    }
    setShowCreate(false);
    setPrefillQueue([]);
    setPrefillBatch([]);
    resetForm();
  }

  function togglePlatform(platform:PlatformName) {
    setPlatforms(current => current.some(item=>item.platform===platform)
      ? current.filter(item=>item.platform!==platform)
      : [...current,{platform,packageSku:""}]);
  }

  function addPlatformListing(platform:PlatformName) {
    setPlatforms(current=>[...current,{platform,packageSku:""}]);
  }

  function updatePlatformSku(index:number,packageSku:string) {
    setPlatforms(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,packageSku}:item));
  }

  function removePlatformListing(index:number) {
    setPlatforms(current=>current.filter((_,itemIndex)=>itemIndex!==index));
  }

  function updatePromotionMonth(period:"nonCampaign"|"campaign",month:string) {
    const dates = period==="campaign"?campaignDates(month,form.campaign.campaignEvents[0]??"dday"):monthDates(month);
    setForm(current=>({...current,[period]:{...current[period],promotionMonth:month,effectiveFrom:dates.from,effectiveTo:dates.to}}));
  }

  function updateCampaignEvent(campaignEvent:CampaignEvent) {
    setForm(current=>{
      const selected=current.campaign.campaignEvents.includes(campaignEvent)
        ? current.campaign.campaignEvents.filter(item=>item!==campaignEvent)
        : [...current.campaign.campaignEvents,campaignEvent];
      const campaignEvents=selected.length?selected:[campaignEvent];
      const dates=campaignDates(current.campaign.promotionMonth,campaignEvents[0]);
      return {...current,campaign:{...current.campaign,campaignEvents,effectiveFrom:dates.from,effectiveTo:dates.to}};
    });
  }

  function toggleMarket(market:MarketName) {
    setForm(current=>({...current,markets:current.markets.includes(market)
      ? current.markets.filter(item=>item!==market)
      : [...current.markets,market]}));
  }

  function updatePrice(market:MarketName,key:keyof ReturnType<typeof blankForm>["prices"]["MY"],value:string) {
    setForm(current=>({...current,prices:{...current.prices,[market]:{...current.prices[market],[key]:value}}}));
  }

  function priceSchedules() {
    return form.markets.flatMap(market=>([
      {market,priceType:"non_campaign" as const,originalPrice:form.prices[market].nonCampaignOriginal,sellingPrice:form.prices[market].nonCampaignSelling,...form.nonCampaign},
      ...form.campaign.campaignEvents.map(campaignEvent=>({market,priceType:"campaign" as const,originalPrice:form.prices[market].campaignOriginal,sellingPrice:form.prices[market].campaignSelling,promotionType:form.campaign.promotionType,...campaignDates(form.campaign.promotionMonth,campaignEvent)})).map(item=>({...item,effectiveFrom:item.from,effectiveTo:item.to})),
    ]));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/packages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:form.name,status:form.status,markets:form.markets,changeNote:form.changeNote,
        priceSchedules:priceSchedules(),storeId,storeName,components,platforms,packageId:editingPackageId,
        calculatorSettings:calculatorSettings?{scenarios:prefillBatch.filter(item=>item.name===form.name).map(item=>item.calculatorSettings)}:null}),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessageType("error");
      setMessage(data.error ?? "Unable to save package");
    } else {
      setMessageType(data.sheetSyncStatus==="synced"?"success":"warning");
      setMessage(`Version ${data.version} saved · ${data.added.length} added / ${data.removed.length} removed · Google Sheet ${data.sheetSyncStatus}`);
      await load();
      const next = prefillQueue[0];
      if (next) {
        setPrefillQueue(current=>current.slice(1));
        setPrefillBatch(current=>current.filter(item=>item.name!==form.name));
        openPrefill(next);
      } else {
        if (standaloneCreate) {
          window.location.assign(`${window.location.pathname}?section=packages`);
          return;
        }
        setShowCreate(false);
        setPrefillBatch([]);
        resetForm();
      }
    }
    setSaving(false);
  }

  function startVersion(item:PackageItem) {
    setPrefillQueue([]);
    setPrefillBatch([]);
    const stored = source === "database";
    const storedSchedules=item.priceSchedules??[];
    const legacyMarket=(item.market==="SG"?"SG":"MY") as MarketName;
    const fallbackSchedule=(priceType:PriceType):PriceSchedule=>({market:legacyMarket,priceType,originalPrice:stored?item.originalPrice/100:item.originalPrice,sellingPrice:stored?item.sellingPrice/100:item.sellingPrice,promotionType:item.promotionType,effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo??""});
    const sourceSchedules=storedSchedules.length?storedSchedules:[fallbackSchedule("non_campaign"),fallbackSchedule("campaign")];
    const sourceMarkets=[...new Set(sourceSchedules.map(line=>line.market))] as MarketName[];
    const schedules=sourceMarkets.flatMap(market=>{
      const available=sourceSchedules.filter(line=>line.market===market);
      const base=available[0]??fallbackSchedule("campaign");
      return (["non_campaign","campaign"] as PriceType[]).map(priceType=>available.find(line=>line.priceType===priceType)??{...base,priceType,market});
    });
    const nc=schedules.find(line=>line.priceType==="non_campaign")??fallbackSchedule("non_campaign");
    const campaign=schedules.find(line=>line.priceType==="campaign")??fallbackSchedule("campaign");
    const markets=[...new Set(schedules.map(line=>line.market))] as MarketName[];
    const priceFor=(market:MarketName,type:PriceType)=>schedules.find(line=>line.market===market&&line.priceType===type);
    setEditingPackageId(stored ? item.id : null);
    setForm({
      name:item.name,status:"draft",markets,
      nonCampaign:{promotionType:nc.promotionType,promotionMonth:nc.promotionType==="monthly"?nc.effectiveFrom.slice(0,7):"",effectiveFrom:nc.effectiveFrom,effectiveTo:nc.effectiveTo},
      campaign:{promotionType:"custom",promotionMonth:campaign.effectiveFrom.slice(0,7),campaignEvents:[...new Set(schedules.filter(line=>line.priceType==="campaign").map(line=>campaignEventForDates(line.effectiveFrom,line.effectiveTo)))],effectiveFrom:campaign.effectiveFrom,effectiveTo:campaign.effectiveTo},
      prices:{MY:{nonCampaignOriginal:String(priceFor("MY","non_campaign")?.originalPrice??""),nonCampaignSelling:String(priceFor("MY","non_campaign")?.sellingPrice??""),campaignOriginal:String(priceFor("MY","campaign")?.originalPrice??""),campaignSelling:String(priceFor("MY","campaign")?.sellingPrice??"")},SG:{nonCampaignOriginal:String(priceFor("SG","non_campaign")?.originalPrice??""),nonCampaignSelling:String(priceFor("SG","non_campaign")?.sellingPrice??""),campaignOriginal:String(priceFor("SG","campaign")?.originalPrice??""),campaignSelling:String(priceFor("SG","campaign")?.sellingPrice??"")}},
      changeNote:stored ? `Changes from Version ${item.version}` : "Migrated from Fulfillment Sheet",
    });
    setComponents(item.components.map(line=>({...line})));
    setPlatforms((item.platforms?.length ? item.platforms : [{platform:"Shopee" as const,packageSku:item.packageSku}]).map(line=>({...line})));
    setCalculatorSettings(null);
    setShowCreate(true);
  }

  return <div className={`package-control${standaloneCreate?" standalone-create":""}`}>
    <div className="package-hero">
      <div><p className="kicker">OXM PACKAGE CONTROL</p><h2>Packages & Pricing</h2><p>负责人可以建立配套、选择平台与促销日期；每次组件增减都会留下版本历史。</p></div>
      <div className="package-hero-actions">
        <a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Google Sheet History</a>
        <span>{source==="sheet-migration-preview"?"Sheet Migration Preview":"Live Database"}</span>
        {canCreate&&storeId!=="all"&&<button onClick={openNew}>+ New Package</button>}
      </div>
    </div>

    <section className="metric-grid package-metrics">
      <article className="metric"><span>Total Packages</span><strong>{items.length}</strong><em>{storeName}</em></article>
      <article className="metric"><span>Active Now</span><strong>{active}</strong><em>Currently Selling</em></article>
      <article className="metric"><span>Scheduled</span><strong>{scheduled}</strong><em>Future promotions</em></article>
      <article className="metric warn"><span>Needs Review</span><strong>{drafts}</strong><em>Draft + Review</em></article>
    </section>

    <div className="package-controls">
      <div>{["All","Active","Scheduled","Draft","Review","Expired"].map(label=>{const value=label.toLowerCase();return <button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>})}</div>
      <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search package or platform SKU" />
    </div>
    {message&&<div className={`package-message ${messageType}`}>{message}{messageType==="warning"&&<a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Open History Sheet</a>}</div>}

    <div className="package-list">{visible.map(item=><article className="package-card" key={item.id}>
      <div className="package-card-head">
        <div><span className={`package-status ${item.status}`}>{item.status}</span><span className={`sync-status ${item.sheetSyncStatus ?? "pending"}`}>Sheet {item.sheetSyncStatus ?? "preview"}</span><h3>{item.name}</h3></div>
        <div className="package-price"><small>{item.market}</small><del>{money(item.originalPrice,item.market,source==="database")}</del><strong>{money(item.sellingPrice,item.market,source==="database")}</strong></div>
      </div>
      {item.priceSchedules?.length?<div className="package-schedule-summary">{item.priceSchedules.map(line=><div key={`${line.market}-${line.priceType}`}><span>{line.market} · {line.priceType==="campaign"?"Campaign":"Non-Campaign"}</span><b>{money(line.sellingPrice,line.market)}</b><small>{line.effectiveFrom} → {line.effectiveTo}</small></div>)}</div>:null}
      <div className="platform-skus">{(item.platforms?.length?item.platforms:[{platform:"Shopee" as const,packageSku:item.packageSku}]).map(platform=><div key={platform.platform}><span>{platform.platform}</span><b>{platform.packageSku}</b></div>)}</div>
      <div className="package-meta"><span>Version <b>v{item.version}</b></span><span>Promotion <b>{item.promotionType==="monthly"?"Full Month":"Custom Dates"}</b></span><span>Effective <b>{item.effectiveFrom} → {item.effectiveTo || "Open Ended"}</b></span><span>Discount <b>{item.originalPrice?Math.round((1-item.sellingPrice/item.originalPrice)*100):0}%</b></span></div>
      <div className="component-list">{item.components.map((line,index)=><div key={`${line.inventorySku}-${index}`}><span className={`component-kind ${line.kind}`}>{line.kind}</span><b>{line.inventorySku}</b><span>{line.name}</span><strong>× {line.quantity}</strong></div>)}</div>
      {openHistory===item.id&&<div className="version-history">{(item.history?.length?item.history:[{
        version:item.version,changeNote:"Imported from Fulfillment Sheet",promotionType:item.promotionType,effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,createdAt:"",createdBy:"",addedComponents:item.components,removedComponents:[],
      }]).map(line=><div className="history-entry" key={line.version}>
        <div><b>v{line.version}</b><span>{line.changeNote}</span><small>{line.effectiveFrom} → {line.effectiveTo || "Open Ended"} · Sheet {line.sheetSyncStatus ?? "preview"}</small></div>
        <div className="history-diff"><span className="added">+ {(line.addedComponents ?? []).map(lineText).join(", ") || "No Additions"}</span><span className="removed">− {(line.removedComponents ?? []).map(lineText).join(", ") || "No Removals"}</span></div>
        {line.calculatorSettings&&<div className="calculator-history"><b>Calculator Snapshot</b>{calculatorSnapshots(line.calculatorSettings).map(snapshot=><div key={snapshot.serviceScenario}><strong>{snapshot.serviceScenario}</strong><span>{snapshot.category}</span><span>Facebook {money(snapshot.facebookPrice,"MY")} → Shopee {money(snapshot.suggestedShopeePrice,"MY")}</span>{snapshot.mainProductQuantity?<span>主产品 {snapshot.mainProductQuantity} · Facebook PPU {snapshot.facebookPricePerUnit==null?"—":money(snapshot.facebookPricePerUnit,"MY")} · Customer PPU {snapshot.customerPricePerUnit==null?"—":money(snapshot.customerPricePerUnit,"MY")}</span>:null}<span>Commission {snapshot.commissionRate.toFixed(2)}% · Service {snapshot.serviceRate.toFixed(2)}% · Payout {money(snapshot.actualPayout,"MY")}</span></div>)}</div>}
      </div>)}</div>}
      <div className="package-card-foot"><span>{item.components.length} Inventory SKU Lines</span><button onClick={()=>setOpenHistory(openHistory===item.id?null:item.id)}>{openHistory===item.id?"Hide History":"View History"}</button><button onClick={()=>startVersion(item)}>{source==="database"?"New Version":"Migrate & Edit"}</button></div>
    </article>)}</div>
    {!visible.length&&<div className="package-empty"><strong>No Packages In This View</strong><span>Choose another store/filter or create the first package.</span></div>}

    {showCreate&&<div className={`package-modal${standaloneCreate?" standalone":""}`} role={standaloneCreate?undefined:"dialog"} aria-modal={standaloneCreate?undefined:"true"}><div className="package-form">
      <div className="package-form-head"><div><p className="kicker">{editingPackageId?"NEW VERSION":"NEW PACKAGE"}</p><h3>{editingPackageId?"Create Next Version":"Create A Package"}</h3><span>{storeName}{prefillQueue.length?` · ${prefillQueue.length} Ready Package${prefillQueue.length===1?"":"s"} Remaining`:""}</span></div><button onClick={closeCreate} aria-label="Close">×</button></div>

      {prefillBatch.length>0&&<section className="calculator-batch-transfer"><div><b>✓ {groupPrefills(prefillBatch).length} Calculator Package{groupPrefills(prefillBatch).length===1?"":"s"} Brought Over</b><span>同一个 Package 的 Non-Campaign 与 Campaign 价格已合并；完成当前表单后会自动继续下一项。</span></div><div className="calculator-batch-list">{groupPrefills(prefillBatch).map((group,index)=>{const nonCampaign=group.find(item=>item.calculatorSettings.serviceScenario==="Non-Campaign Day")??group[0];const campaign=group.find(item=>item.calculatorSettings.serviceScenario==="Campaign Day")??group[0];return <div className={index===0?"current":""} key={group[0].name}><span>{index===0?"Current":"Queued"}</span><b>{group[0].name}</b><strong><small>Non-Campaign</small>{money(nonCampaign.sellingPrice,"MY")}</strong><strong><small>Campaign</small>{money(campaign.sellingPrice,"MY")}</strong></div>})}</div></section>}

      <section className="form-section"><div className="form-section-title"><span>1</span><div><h4>Package Details</h4><p>名称与销售市场；MY / SG 共用同一个配套内容与活动日期</p></div></div>
        <div className="form-grid package-detail-grid">
          <label>Package Name<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Customer-Facing Package Name"/></label>
          <fieldset className="market-selector"><legend>Selling Markets</legend>{(["MY","SG"] as MarketName[]).map(market=><label key={market}><input type="checkbox" checked={form.markets.includes(market)} onChange={()=>toggleMarket(market)}/><b>{market}</b><small>{market==="MY"?"RM":"S$"}</small></label>)}</fieldset>
        </div>
        <div className="inline-platforms">{PLATFORM_NAMES.map(platform=>{
          const selected=platforms.some(item=>item.platform===platform);
          return <div className={selected?"selected":""} key={platform}>
            <div className="inline-platform-head"><label><input type="checkbox" checked={selected} onChange={()=>togglePlatform(platform)}/><b>{platform}</b></label>{selected&&<button type="button" onClick={()=>addPlatformListing(platform)}>+ Add Listing</button>}</div>
            {selected&&<div className="listing-skus">{platforms.map((line,index)=>line.platform===platform?<div key={`${platform}-${index}`}><input aria-label={`${platform} Listing ${platforms.filter((item,itemIndex)=>item.platform===platform&&itemIndex<=index).length} SKU`} value={line.packageSku} onChange={event=>updatePlatformSku(index,event.target.value)} placeholder={`Listing ${platforms.filter((item,itemIndex)=>item.platform===platform&&itemIndex<=index).length} SKU`}/>{platforms.filter(item=>item.platform===platform).length>1&&<button type="button" aria-label={`Remove ${platform} listing`} onClick={()=>removePlatformListing(index)}>×</button>}</div>:null)}</div>}
          </div>;
        })}</div>
        {calculatorSettings&&<div className="calculator-prefill">
          <div><b>✓ Calculator Settings Attached</b><span>保存 Package 后会一起记录在 Package History</span></div>
          <span>{calculatorSettings.category}</span>
          <span>Facebook {money(calculatorSettings.facebookPrice,"MY")} → Suggested Shopee {money(calculatorSettings.suggestedShopeePrice,"MY")}</span>
          {calculatorSettings.mainProductQuantity?<span>主产品 {calculatorSettings.mainProductQuantity} · Facebook PPU {calculatorSettings.facebookPricePerUnit==null?"—":money(calculatorSettings.facebookPricePerUnit,"MY")} · Customer PPU {calculatorSettings.customerPricePerUnit==null?"—":money(calculatorSettings.customerPricePerUnit,"MY")}</span>:null}
          <span>Commission {calculatorSettings.commissionRate.toFixed(2)}% · {calculatorSettings.serviceScenario} {calculatorSettings.serviceRate.toFixed(2)}% · Payout {money(calculatorSettings.actualPayout,"MY")}</span>
        </div>}
      </section>

      <section className="form-section pricing-section"><div className="form-section-title"><span>2</span><div><h4>Pricing & Promotion Periods</h4><p>同一个 Package 同时设定 Non-Campaign 与 Campaign；MY / SG 日期共用、价格分开</p></div></div>
        {([['nonCampaign','Non-Campaign'],['campaign','Campaign']] as const).map(([periodKey,title])=>{
          const period=form[periodKey];
          return <div className={`scenario-editor ${periodKey}`} key={periodKey}>
            <div className="scenario-editor-head"><div><b>{title}</b><span>{title==="Campaign"?"Campaign Day Price & Dates":"Always-On Price & Dates"}</span></div>{periodKey==="nonCampaign"&&<div className="promotion-toggle"><button type="button" className={period.promotionType==="monthly"?"active":""} onClick={()=>setForm({...form,[periodKey]:{...period,promotionType:"monthly"}})}>Full Month</button><button type="button" className={period.promotionType==="custom"?"active":""} onClick={()=>setForm({...form,[periodKey]:{...period,promotionType:"custom"}})}>Custom Dates</button></div>}</div>
            <div className="scenario-body"><div className="market-price-grid">{form.markets.map(market=>{
              const prefix=periodKey==="campaign"?"campaign":"nonCampaign";
              const originalKey=`${prefix}Original` as keyof typeof form.prices.MY;
              const sellingKey=`${prefix}Selling` as keyof typeof form.prices.MY;
              const same=Boolean(form.prices[market][originalKey])&&Number(form.prices[market][originalKey])===Number(form.prices[market][sellingKey]);
              return <div className={`market-price-card ${same?"same-price-warning":""}`} key={market}><strong>{market} <small>{market==="MY"?"RM":"S$"}</small></strong><label>Original Price <em>*</em><input required type="number" min="0.01" step="0.01" value={form.prices[market][originalKey]} onChange={event=>updatePrice(market,originalKey,event.target.value)}/></label><label>Selling Price<input required type="number" min="0.01" step="0.01" value={form.prices[market][sellingKey]} onChange={event=>updatePrice(market,sellingKey,event.target.value)}/></label>{same&&<div className="same-price-alert">⚠️ Original Price equals Selling Price — please double-check.</div>}</div>;
            })}</div>
            {periodKey==="campaign"?<div className="campaign-date-controls"><label>Campaign Month<input type="month" value={period.promotionMonth} onChange={event=>updatePromotionMonth(periodKey,event.target.value)}/></label><fieldset><legend>Campaign Events · Multi-Select</legend>{([['dday','D-Day'],['mid_month','Mid Month Madness'],['payday','Payday']] as const).map(([value,label])=><label key={value} className={form.campaign.campaignEvents.includes(value)?"selected":""}><input type="checkbox" checked={form.campaign.campaignEvents.includes(value)} onChange={()=>updateCampaignEvent(value)}/><span><b>{label}</b><small>{value==="dday"?"2 Days Before To Double Day":value==="mid_month"?"14th–15th":"24th–25th"}</small></span></label>)}</fieldset><div className="campaign-date-list">{form.campaign.campaignEvents.map(event=>{const dates=campaignDates(period.promotionMonth,event);return <span key={event}><b>{event==="dday"?"D-Day":event==="mid_month"?"Mid Month":"Payday"}</b>{dates.from||"—"} → {dates.to||"—"}</span>})}</div></div>:period.promotionType==="monthly"?<div className="date-fields"><label>Promotion Month<input type="month" value={period.promotionMonth} onChange={event=>updatePromotionMonth(periodKey,event.target.value)}/></label><div className="date-preview"><span>Start <b>{period.effectiveFrom||"—"}</b></span><span>End <b>{period.effectiveTo||"—"}</b></span></div></div>:<div className="date-fields"><label>Start Date<input type="date" value={period.effectiveFrom} onChange={event=>setForm({...form,[periodKey]:{...period,effectiveFrom:event.target.value}})}/></label><label>End Date<input type="date" value={period.effectiveTo} min={period.effectiveFrom} onChange={event=>setForm({...form,[periodKey]:{...period,effectiveTo:event.target.value}})}/></label></div>}
            </div>
          </div>;
        })}
      </section>

      <section className="form-section"><div className="form-section-title"><span>3</span><div><h4>OXM Inventory SKU Items</h4><p>新增、删除或改变数量都会记录在 History</p></div><button className="add-item-button" onClick={()=>setComponents([...components,blankLine()])}>+ Add Item</button></div>
        <div className="component-editor">{components.map((line,index)=><div className="component-row" key={index}>
          <input value={line.inventorySku} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,inventorySku:event.target.value}:item))} placeholder="OXM Inventory SKU"/>
          <input value={line.name} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,name:event.target.value}:item))} placeholder="Item Name"/>
          <input type="number" min="1" value={line.quantity} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,quantity:Number(event.target.value)}:item))}/>
          <button onClick={()=>setComponents(components.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remove ${line.inventorySku||"component"}`}>×</button>
        </div>)}</div>
      </section>

      <label className="change-note">Change Note<input value={form.changeNote} onChange={event=>setForm({...form,changeNote:event.target.value})} placeholder="What changed and why?"/></label>
      <div className="form-actions"><button className="secondary" onClick={closeCreate}>Cancel</button><button onClick={save} disabled={saving}>{saving?"Saving…":prefillQueue.length?`Create & Continue (${prefillQueue.length} More)`:editingPackageId?"Save New Version":"Create Package"}</button></div>
    </div></div>}
  </div>;
}
