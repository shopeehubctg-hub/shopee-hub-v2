"use client";

import { useEffect, useMemo, useState } from "react";

type ComponentLine = { inventorySku:string; name:string; quantity:number; kind:"product"|"gift" };
type HistoryLine = { version:number; changeNote:string; effectiveFrom:string; effectiveTo?:string|null; originalPrice?:number; sellingPrice?:number; createdAt:string; createdBy:string };
type PackageItem = { id:string; storeId:string; packageSku:string; name:string; market:string; channel:string; status:string; version:number; originalPrice:number; sellingPrice:number; effectiveFrom:string; effectiveTo?:string|null; components:ComponentLine[]; history?:HistoryLine[] };
type Props = { storeId:string; storeName:string; canCreate?:boolean };

const blankLine = ():ComponentLine => ({ inventorySku:"", name:"", quantity:1, kind:"product" });
const money = (value:number, market:string, stored=false) => `${market === "SG" ? "S$" : "RM"} ${(stored ? value / 100 : value).toFixed(2)}`;

export function PackageControl({ storeId, storeName, canCreate=true }:Props) {
  const [items,setItems] = useState<PackageItem[]>([]);
  const [source,setSource] = useState("");
  const [filter,setFilter] = useState("all");
  const [search,setSearch] = useState("");
  const [showCreate,setShowCreate] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [editingPackageId,setEditingPackageId] = useState<string|null>(null);
  const [openHistory,setOpenHistory] = useState<string|null>(null);
  const [form,setForm] = useState({ packageSku:"",name:"",market:"MY",channel:"Shopee",status:"draft",originalPrice:"",sellingPrice:"",effectiveFrom:"",effectiveTo:"",changeNote:"Initial version" });
  const [components,setComponents] = useState<ComponentLine[]>([blankLine()]);
  async function load() {
    const response = await fetch(`/api/packages?storeId=${encodeURIComponent(storeId || "all")}`,{cache:"no-store"});
    if (response.ok) { const data=await response.json(); setItems(data.packages ?? []); setSource(data.source ?? ""); }
  }
  useEffect(()=>{ load(); },[storeId]);
  const visible = useMemo(()=>items.filter(item => (filter==="all"||item.status===filter) && `${item.packageSku} ${item.name}`.toLowerCase().includes(search.toLowerCase())),[items,filter,search]);
  const active = items.filter(item=>item.status==="active").length;
  const scheduled = items.filter(item=>item.status==="scheduled").length;
  const drafts = items.filter(item=>item.status==="draft"||item.status==="review").length;
  async function save() {
    setSaving(true); setMessage("");
    const response = await fetch("/api/packages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,storeId,components,packageId:editingPackageId})});
    const data = await response.json();
    if (!response.ok) setMessage(data.error ?? "Unable to save package");
    else { setMessage(`Package saved as Version ${data.version}`); setShowCreate(false); setEditingPackageId(null); setForm({packageSku:"",name:"",market:"MY",channel:"Shopee",status:"draft",originalPrice:"",sellingPrice:"",effectiveFrom:"",effectiveTo:"",changeNote:"Initial version"}); setComponents([blankLine()]); await load(); }
    setSaving(false);
  }
  function startVersion(item:PackageItem) {
    const stored = source === "database";
    setEditingPackageId(stored ? item.id : null);
    setForm({ packageSku:item.packageSku, name:item.name, market:item.market, channel:item.channel, status:"draft", originalPrice:String(stored ? item.originalPrice/100 : item.originalPrice), sellingPrice:String(stored ? item.sellingPrice/100 : item.sellingPrice), effectiveFrom:item.effectiveFrom, effectiveTo:item.effectiveTo ?? "", changeNote:stored ? `Changes from Version ${item.version}` : "Migrated from Fulfillment Sheet" });
    setComponents(item.components.map(line=>({...line})));
    setShowCreate(true);
  }
  return <div className="package-control">
    <div className="package-hero">
      <div><p className="kicker">OXM PACKAGE CONTROL</p><h2>Packages & Pricing</h2><p>一个地方管理 Package SKU、Inventory SKU、价格版本与生效日期。</p></div>
      <div className="package-hero-actions"><span>{source==="sheet-migration-preview"?"Sheet migration preview":"Live database"}</span>{canCreate&&storeId!=="all"&&<button onClick={()=>setShowCreate(true)}>+ New package</button>}</div>
    </div>
    <section className="metric-grid package-metrics"><article className="metric"><span>Total packages</span><strong>{items.length}</strong><em>{storeName}</em></article><article className="metric"><span>Active now</span><strong>{active}</strong><em>Currently selling</em></article><article className="metric"><span>Scheduled</span><strong>{scheduled}</strong><em>Future price/content</em></article><article className="metric warn"><span>Needs review</span><strong>{drafts}</strong><em>Draft + review</em></article></section>
    <div className="package-controls"><div>{["all","active","scheduled","draft","review","expired"].map(x=><button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x}</button>)}</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Package SKU or name" /></div>
    {message&&<div className="package-message">{message}</div>}
    <div className="package-list">{visible.map(item=><article className="package-card" key={item.id}>
      <div className="package-card-head"><div><span className={`package-status ${item.status}`}>{item.status}</span><b>{item.packageSku}</b><h3>{item.name}</h3></div><div className="package-price"><small>{item.market} · {item.channel}</small><del>{money(item.originalPrice,item.market,source==="database")}</del><strong>{money(item.sellingPrice,item.market,source==="database")}</strong></div></div>
      <div className="package-meta"><span>Version <b>v{item.version}</b></span><span>Effective <b>{item.effectiveFrom} → {item.effectiveTo || "Open ended"}</b></span><span>Discount <b>{Math.round((1-(source==="database"?item.sellingPrice/item.originalPrice:item.sellingPrice/item.originalPrice))*100)}%</b></span></div>
      <div className="component-list">{item.components.map((line,i)=><div key={`${line.inventorySku}-${i}`}><span className={`component-kind ${line.kind}`}>{line.kind}</span><b>{line.inventorySku}</b><span>{line.name}</span><strong>× {line.quantity}</strong></div>)}</div>
      {openHistory===item.id&&<div className="version-history">{(item.history?.length?item.history:[{version:item.version,changeNote:source==="database"?"Current version":"Imported from Fulfillment Sheet",effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,createdAt:"",createdBy:""}]).map(line=><div key={line.version}><b>v{line.version}</b><span>{line.changeNote}</span><small>{line.effectiveFrom} → {line.effectiveTo || "Open ended"}</small></div>)}</div>}
      <div className="package-card-foot"><span>{item.components.length} Inventory SKU lines</span><button onClick={()=>setOpenHistory(openHistory===item.id?null:item.id)}>{openHistory===item.id?"Hide history":"View history"}</button><button onClick={()=>startVersion(item)}>{source==="database"?"New version":"Migrate & edit"}</button></div>
    </article>)}</div>
    {!visible.length&&<div className="package-empty"><strong>No packages in this view</strong><span>Choose another store/filter or create the first package.</span></div>}
    {showCreate&&<div className="package-modal" role="dialog" aria-modal="true"><div className="package-form">
      <div className="package-form-head"><div><p className="kicker">{editingPackageId?"NEW VERSION":"NEW PACKAGE"}</p><h3>{editingPackageId?"Create next version":"Create Version 1"}</h3><span>{storeName}</span></div><button onClick={()=>setShowCreate(false)} aria-label="Close">×</button></div>
      <div className="form-grid"><label>Package SKU<input value={form.packageSku} onChange={e=>setForm({...form,packageSku:e.target.value})} placeholder="e.g. AGP01AUG"/></label><label>Package name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Customer-facing name"/></label><label>Market<select value={form.market} onChange={e=>setForm({...form,market:e.target.value})}><option>MY</option><option>SG</option></select></label><label>Channel<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}><option>Shopee</option><option>Lazada</option><option>TikTok Shop</option></select></label><label>Original price<input type="number" value={form.originalPrice} onChange={e=>setForm({...form,originalPrice:e.target.value})}/></label><label>Selling price<input type="number" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/></label><label>Effective from<input type="date" value={form.effectiveFrom} onChange={e=>setForm({...form,effectiveFrom:e.target.value})}/></label><label>Effective to<input type="date" value={form.effectiveTo} onChange={e=>setForm({...form,effectiveTo:e.target.value})}/></label></div>
      <div className="component-editor"><div><h4>Inventory SKU components</h4><button onClick={()=>setComponents([...components,blankLine()])}>+ Add line</button></div>{components.map((line,index)=><div className="component-row" key={index}><select value={line.kind} onChange={e=>setComponents(components.map((x,i)=>i===index?{...x,kind:e.target.value as "product"|"gift"}:x))}><option value="product">Product</option><option value="gift">Gift</option></select><input value={line.inventorySku} onChange={e=>setComponents(components.map((x,i)=>i===index?{...x,inventorySku:e.target.value}:x))} placeholder="OXM Inventory SKU"/><input value={line.name} onChange={e=>setComponents(components.map((x,i)=>i===index?{...x,name:e.target.value}:x))} placeholder="Item name"/><input type="number" min="1" value={line.quantity} onChange={e=>setComponents(components.map((x,i)=>i===index?{...x,quantity:Number(e.target.value)}:x))}/><button onClick={()=>setComponents(components.filter((_,i)=>i!==index))}>×</button></div>)}</div>
      <label className="change-note">Change note<input value={form.changeNote} onChange={e=>setForm({...form,changeNote:e.target.value})}/></label>
      <div className="form-actions"><button className="secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button onClick={save} disabled={saving}>{saving?"Saving…":editingPackageId?"Save new version":"Save draft"}</button></div>
    </div></div>}
  </div>;
}
