"use client";

import { useEffect, useMemo, useState } from "react";

type ComponentLine = { inventorySku:string; name:string; quantity:number; kind:"product"|"gift" };
type PlatformName = "Shopee"|"Lazada"|"TikTok Shop";
type PlatformLine = { platform:PlatformName; packageSku:string };
type HistoryLine = {
  version:number; changeNote:string; promotionType:"monthly"|"custom"; effectiveFrom:string; effectiveTo?:string|null;
  addedComponents?:ComponentLine[]; removedComponents?:ComponentLine[]; platforms?:PlatformLine[];
  sheetSyncStatus?:"pending"|"synced"|"failed"; createdAt:string; createdBy:string;
};
type PackageItem = {
  id:string; storeId:string; packageSku:string; name:string; market:string; status:string; version:number;
  promotionType:"monthly"|"custom"; originalPrice:number; sellingPrice:number; effectiveFrom:string; effectiveTo?:string|null;
  components:ComponentLine[]; platforms:PlatformLine[]; sheetSyncStatus?:"pending"|"synced"|"failed"; history?:HistoryLine[];
};
type Props = { storeId:string; storeName:string; canCreate?:boolean };

const PLATFORM_NAMES:PlatformName[] = ["Shopee","Lazada","TikTok Shop"];
const HISTORY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit#gid=2129880014";
const blankLine = ():ComponentLine => ({ inventorySku:"", name:"", quantity:1, kind:"product" });
const blankForm = () => ({
  name:"", market:"MY", status:"draft", promotionType:"monthly" as "monthly"|"custom", promotionMonth:"",
  effectiveFrom:"", effectiveTo:"", originalPrice:"", sellingPrice:"", changeNote:"Initial version",
});
const money = (value:number, market:string, stored=false) => `${market === "SG" ? "S$" : "RM"} ${(stored ? value / 100 : value).toFixed(2)}`;
const lineText = (line:ComponentLine) => `${line.inventorySku} ×${line.quantity}`;

function monthDates(month:string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from:"", to:"" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from:`${month}-01`, to:`${month}-${String(lastDay).padStart(2,"0")}` };
}

export function PackageControl({ storeId, storeName, canCreate=true }:Props) {
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

  async function load() {
    const response = await fetch(`/api/packages?storeId=${encodeURIComponent(storeId || "all")}`,{cache:"no-store"});
    if (response.ok) {
      const data=await response.json();
      setItems(data.packages ?? []);
      setSource(data.source ?? "");
    }
  }
  useEffect(()=>{ load(); },[storeId]);

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
  }

  function openNew() {
    resetForm();
    setMessage("");
    setShowCreate(true);
  }

  function togglePlatform(platform:PlatformName) {
    setPlatforms(current => current.some(item=>item.platform===platform)
      ? current.filter(item=>item.platform!==platform)
      : [...current,{platform,packageSku:""}]);
  }

  function updatePromotionMonth(month:string) {
    const dates = monthDates(month);
    setForm(current=>({...current,promotionMonth:month,effectiveFrom:dates.from,effectiveTo:dates.to}));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/packages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...form,storeId,storeName,components,platforms,packageId:editingPackageId}),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessageType("error");
      setMessage(data.error ?? "Unable to save package");
    } else {
      setMessageType(data.sheetSyncStatus==="synced"?"success":"warning");
      setMessage(`Version ${data.version} saved · ${data.added.length} added / ${data.removed.length} removed · Google Sheet ${data.sheetSyncStatus}`);
      setShowCreate(false);
      resetForm();
      await load();
    }
    setSaving(false);
  }

  function startVersion(item:PackageItem) {
    const stored = source === "database";
    const month = item.promotionType==="monthly" ? item.effectiveFrom.slice(0,7) : "";
    setEditingPackageId(stored ? item.id : null);
    setForm({
      name:item.name, market:item.market, status:"draft", promotionType:item.promotionType ?? "custom",
      promotionMonth:month, originalPrice:String(stored ? item.originalPrice/100 : item.originalPrice),
      sellingPrice:String(stored ? item.sellingPrice/100 : item.sellingPrice),
      effectiveFrom:item.effectiveFrom, effectiveTo:item.effectiveTo ?? "",
      changeNote:stored ? `Changes from Version ${item.version}` : "Migrated from Fulfillment Sheet",
    });
    setComponents(item.components.map(line=>({...line})));
    setPlatforms((item.platforms?.length ? item.platforms : [{platform:"Shopee" as const,packageSku:item.packageSku}]).map(line=>({...line})));
    setShowCreate(true);
  }

  return <div className="package-control">
    <div className="package-hero">
      <div><p className="kicker">OXM PACKAGE CONTROL</p><h2>Packages & Pricing</h2><p>负责人可以建立配套、选择平台与促销日期；每次组件增减都会留下版本历史。</p></div>
      <div className="package-hero-actions">
        <a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Google Sheet History</a>
        <span>{source==="sheet-migration-preview"?"Sheet migration preview":"Live database"}</span>
        {canCreate&&storeId!=="all"&&<button onClick={openNew}>+ New package</button>}
      </div>
    </div>

    <section className="metric-grid package-metrics">
      <article className="metric"><span>Total packages</span><strong>{items.length}</strong><em>{storeName}</em></article>
      <article className="metric"><span>Active now</span><strong>{active}</strong><em>Currently selling</em></article>
      <article className="metric"><span>Scheduled</span><strong>{scheduled}</strong><em>Future promotions</em></article>
      <article className="metric warn"><span>Needs review</span><strong>{drafts}</strong><em>Draft + review</em></article>
    </section>

    <div className="package-controls">
      <div>{["all","active","scheduled","draft","review","expired"].map(value=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{value}</button>)}</div>
      <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search package or platform SKU" />
    </div>
    {message&&<div className={`package-message ${messageType}`}>{message}{messageType==="warning"&&<a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Open History Sheet</a>}</div>}

    <div className="package-list">{visible.map(item=><article className="package-card" key={item.id}>
      <div className="package-card-head">
        <div><span className={`package-status ${item.status}`}>{item.status}</span><span className={`sync-status ${item.sheetSyncStatus ?? "pending"}`}>Sheet {item.sheetSyncStatus ?? "preview"}</span><h3>{item.name}</h3></div>
        <div className="package-price"><small>{item.market}</small><del>{money(item.originalPrice,item.market,source==="database")}</del><strong>{money(item.sellingPrice,item.market,source==="database")}</strong></div>
      </div>
      <div className="platform-skus">{(item.platforms?.length?item.platforms:[{platform:"Shopee" as const,packageSku:item.packageSku}]).map(platform=><div key={platform.platform}><span>{platform.platform}</span><b>{platform.packageSku}</b></div>)}</div>
      <div className="package-meta"><span>Version <b>v{item.version}</b></span><span>Promotion <b>{item.promotionType==="monthly"?"Full month":"Custom dates"}</b></span><span>Effective <b>{item.effectiveFrom} → {item.effectiveTo || "Open ended"}</b></span><span>Discount <b>{item.originalPrice?Math.round((1-item.sellingPrice/item.originalPrice)*100):0}%</b></span></div>
      <div className="component-list">{item.components.map((line,index)=><div key={`${line.inventorySku}-${index}`}><span className={`component-kind ${line.kind}`}>{line.kind}</span><b>{line.inventorySku}</b><span>{line.name}</span><strong>× {line.quantity}</strong></div>)}</div>
      {openHistory===item.id&&<div className="version-history">{(item.history?.length?item.history:[{
        version:item.version,changeNote:"Imported from Fulfillment Sheet",promotionType:item.promotionType,effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,createdAt:"",createdBy:"",addedComponents:item.components,removedComponents:[],
      }]).map(line=><div className="history-entry" key={line.version}>
        <div><b>v{line.version}</b><span>{line.changeNote}</span><small>{line.effectiveFrom} → {line.effectiveTo || "Open ended"} · Sheet {line.sheetSyncStatus ?? "preview"}</small></div>
        <div className="history-diff"><span className="added">+ {(line.addedComponents ?? []).map(lineText).join(", ") || "No additions"}</span><span className="removed">− {(line.removedComponents ?? []).map(lineText).join(", ") || "No removals"}</span></div>
      </div>)}</div>}
      <div className="package-card-foot"><span>{item.components.length} Inventory SKU lines</span><button onClick={()=>setOpenHistory(openHistory===item.id?null:item.id)}>{openHistory===item.id?"Hide history":"View history"}</button><button onClick={()=>startVersion(item)}>{source==="database"?"New version":"Migrate & edit"}</button></div>
    </article>)}</div>
    {!visible.length&&<div className="package-empty"><strong>No packages in this view</strong><span>Choose another store/filter or create the first package.</span></div>}

    {showCreate&&<div className="package-modal" role="dialog" aria-modal="true"><div className="package-form">
      <div className="package-form-head"><div><p className="kicker">{editingPackageId?"NEW VERSION":"NEW PACKAGE"}</p><h3>{editingPackageId?"Create next version":"Create a package"}</h3><span>{storeName}</span></div><button onClick={()=>setShowCreate(false)} aria-label="Close">×</button></div>

      <section className="form-section"><div className="form-section-title"><span>1</span><div><h4>Package details</h4><p>名称、市场与价格</p></div></div>
        <div className="form-grid">
          <label>Package name<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Customer-facing package name"/></label>
          <label>Market<select value={form.market} onChange={event=>setForm({...form,market:event.target.value})}><option>MY</option><option>SG</option></select></label>
          <label>Original price<input type="number" min="0" step="0.01" value={form.originalPrice} onChange={event=>setForm({...form,originalPrice:event.target.value})}/></label>
          <label>Selling price<input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={event=>setForm({...form,sellingPrice:event.target.value})}/></label>
        </div>
      </section>

      <section className="form-section"><div className="form-section-title"><span>2</span><div><h4>Selling platforms</h4><p>勾选平台；每个平台必须填写不同的 Package SKU</p></div></div>
        <div className="platform-picker">{PLATFORM_NAMES.map(platform=>{
          const selected = platforms.find(item=>item.platform===platform);
          return <div className={selected?"selected":""} key={platform}>
            <label className="platform-check"><input type="checkbox" checked={Boolean(selected)} onChange={()=>togglePlatform(platform)}/><b>{platform}</b></label>
            {selected&&<label>Package SKU<input value={selected.packageSku} onChange={event=>setPlatforms(current=>current.map(item=>item.platform===platform?{...item,packageSku:event.target.value}:item))} placeholder={`${platform} SKU`}/></label>}
          </div>;
        })}</div>
      </section>

      <section className="form-section"><div className="form-section-title"><span>3</span><div><h4>Promotion period</h4><p>选择整个月，或为短期活动指定日期</p></div></div>
        <div className="promotion-toggle"><button className={form.promotionType==="monthly"?"active":""} onClick={()=>setForm({...form,promotionType:"monthly"})}>Full month</button><button className={form.promotionType==="custom"?"active":""} onClick={()=>setForm({...form,promotionType:"custom"})}>Custom dates</button></div>
        {form.promotionType==="monthly"?<div className="date-fields"><label>Promotion month<input type="month" value={form.promotionMonth} onChange={event=>updatePromotionMonth(event.target.value)}/></label><div className="date-preview"><span>Start <b>{form.effectiveFrom||"—"}</b></span><span>End <b>{form.effectiveTo||"—"}</b></span></div></div>:<div className="date-fields"><label>Start date<input type="date" value={form.effectiveFrom} onChange={event=>setForm({...form,effectiveFrom:event.target.value})}/></label><label>End date<input type="date" value={form.effectiveTo} min={form.effectiveFrom} onChange={event=>setForm({...form,effectiveTo:event.target.value})}/></label></div>}
      </section>

      <section className="form-section"><div className="form-section-title"><span>4</span><div><h4>OXM Inventory SKU components</h4><p>新增、删除或改变数量都会记录在 History</p></div><button onClick={()=>setComponents([...components,blankLine()])}>+ Add line</button></div>
        <div className="component-editor">{components.map((line,index)=><div className="component-row" key={index}>
          <select value={line.kind} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,kind:event.target.value as "product"|"gift"}:item))}><option value="product">Product</option><option value="gift">Gift</option></select>
          <input value={line.inventorySku} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,inventorySku:event.target.value}:item))} placeholder="OXM Inventory SKU"/>
          <input value={line.name} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,name:event.target.value}:item))} placeholder="Item name"/>
          <input type="number" min="1" value={line.quantity} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,quantity:Number(event.target.value)}:item))}/>
          <button onClick={()=>setComponents(components.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remove ${line.inventorySku||"component"}`}>×</button>
        </div>)}</div>
      </section>

      <label className="change-note">Change note<input value={form.changeNote} onChange={event=>setForm({...form,changeNote:event.target.value})} placeholder="What changed and why?"/></label>
      <div className="form-actions"><button className="secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button onClick={save} disabled={saving}>{saving?"Saving…":editingPackageId?"Save new version":"Create package"}</button></div>
    </div></div>}
  </div>;
}
