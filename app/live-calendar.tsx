"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calendarRange, storeCalendarAnchor, storeDateKey } from "./live-calendar-model";

type Store = { id:string; name:string; platform:string; timeZone:string };
type Session = { id:string; store_id:string; title:string; start_at:string; end_at:string; time_zone:string; status:"scheduled"|"cancelled"; internal_note?:string|null };
type CalendarData = { stores:Store[]; sessions:Session[]; canManage:boolean; unregisteredStores?:string[]; registryError?:string|null };
type View = "month"|"week"|"list";
type Form = { id?:string; storeId:string; title:string; startLocal:string; endLocal:string; timeZone:string; internalNote:string };

const dateKey = (date:Date) => date.toISOString().slice(0,10);
const addDays = (date:Date, days:number) => new Date(date.getTime()+days*86400000);
const localValue = (iso:string) => new Date(new Date(iso).getTime()+8*60*60*1000).toISOString().slice(0,16);
const formatTime = (iso:string,zone:string) => new Intl.DateTimeFormat("en-MY",{timeZone:zone,day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));
const formatDay = (date:Date) => new Intl.DateTimeFormat("en-MY",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}).format(date);
const dayOf = storeDateKey;

export function LiveCalendar({initialStoreId,initialView="month"}:{initialStoreId:string;initialView?:View}) {
  const [view,setView]=useState<View>(initialView);
  const [anchor,setAnchor]=useState(()=>storeCalendarAnchor());
  const [filterOverride,setFilterOverride]=useState<string|null>(null);
  const [data,setData]=useState<CalendarData|null>(null);
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [form,setForm]=useState<Form|null>(null);
  const [overlap,setOverlap]=useState<Session[]>([]);
  const [saving,setSaving]=useState(false);
  const modalRef=useRef<HTMLDivElement>(null);
  const formOpen=Boolean(form);
  const filter=filterOverride??(data?.stores.some(store=>store.id===initialStoreId)?initialStoreId:"all");
  const range=useMemo(()=>calendarRange(view,anchor),[view,anchor]);

  useEffect(()=>{
    let cancelled=false;
    // Query lifecycle reset prevents old sessions appearing under a new date range.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    const params=new URLSearchParams({from:range.from,to:range.to,storeId:filter});
    fetch(`/api/live-calendar?${params}`,{cache:"no-store"}).then(async response=>{
      const result=await response.json();
      if (!response.ok) throw new Error(result.error||"Unable to load live sessions");
      if (!cancelled) { setData(result); setError(""); }
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Unable to load live sessions");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[range.from,range.to,filter,refresh]);

  useEffect(()=>{
    if(!formOpen)return;
    const trigger=document.activeElement as HTMLElement|null;
    modalRef.current?.querySelector<HTMLSelectElement>("select")?.focus();
    return()=>{trigger?.focus();};
  },[formOpen]);

  const stores=data?.stores??[];
  const byStore=new Map(stores.map(store=>[store.id,store]));
  const sessions=loading||error?[]:data?.sessions??[];
  const filtered=sessions.filter(session=>filter==="all"||session.store_id===filter);
  const scheduled=filtered.filter(session=>session.status==="scheduled");
  const title=view==="month"?new Intl.DateTimeFormat("en-MY",{timeZone:"UTC",month:"long",year:"numeric"}).format(anchor)
    :view==="week"?`${formatDay(range.startDay)} – ${formatDay(addDays(range.endDay,-1))}`:"Upcoming sessions";

  function changePeriod(direction:number) {
    if (view==="month") setAnchor(new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+direction,1)));
    else setAnchor(addDays(anchor,view==="week"?7*direction:30*direction));
  }
  function beginAdd() {
    const store=stores.find(item=>item.id===filter)??stores[0];
    if (!store) return;
    const day=dateKey(addDays(anchor,anchor<storeCalendarAnchor()?0:1));
    setForm({storeId:store.id,title:"",startLocal:`${day}T20:00`,endLocal:`${day}T21:00`,timeZone:store.timeZone,internalNote:""});
    setOverlap([]);setMessage("");
  }
  function beginEdit(session:Session) {
    setForm({id:session.id,storeId:session.store_id,title:session.title==="Live session"?"":session.title,startLocal:localValue(session.start_at),endLocal:localValue(session.end_at),timeZone:session.time_zone,internalNote:session.internal_note??""});
    setOverlap([]);setMessage("");
  }
  async function save(confirmOverlap=false) {
    if (!form) return;
    setSaving(true);setError("");
    try {
      const response=await fetch("/api/live-calendar",{method:form.id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,confirmOverlap})});
      const result=await response.json();
      if(response.status===409&&Array.isArray(result.overlaps)){setOverlap(result.overlaps);return;}
      if(!response.ok)throw new Error(result.error||"Unable to save live session");
      setForm(null);setOverlap([]);setRefresh(value=>value+1);setMessage(form.id?"Live session updated.":"Live session scheduled.");
    } catch(cause){setError(cause instanceof Error?cause.message:"Unable to save live session");}
    finally{setSaving(false);}
  }
  async function cancel(session:Session) {
    if(!window.confirm(`Cancel ${session.title}?`))return;
    setSaving(true);setError("");
    try {
      const response=await fetch("/api/live-calendar",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:session.id,action:"cancel"})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Unable to cancel live session");
      setRefresh(value=>value+1);setMessage("Live session cancelled.");
    } catch(cause){setError(cause instanceof Error?cause.message:"Unable to cancel live session");}
    finally{setSaving(false);}
  }
  async function registerStore(name:string) {
    setSaving(true);setError("");
    try {
      const response=await fetch("/api/live-calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"registerStore",directoryName:name})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Unable to register store");
      setMessage(`${name} registered. It is now available for scheduling and store permissions.`);
      setRefresh(value=>value+1);
    } catch(cause){setError(cause instanceof Error?cause.message:"Unable to register store");}
    finally{setSaving(false);}
  }

  function card(session:Session) {
    const store=byStore.get(session.store_id);
    return <article className={`live-event${session.status==="cancelled"?" cancelled":""}`} key={session.id}>
      <div><strong>{session.title||"Live session"}</strong><span>{store?.name??"Store"} · {formatTime(session.start_at,session.time_zone)} – {dayOf(session.start_at)!==dayOf(session.end_at)?formatTime(session.end_at,session.time_zone):new Intl.DateTimeFormat("en-MY",{timeZone:session.time_zone,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(session.end_at))} ({session.time_zone==="Asia/Singapore"?"SGT":"MYT"})</span></div>
      {session.status==="cancelled"?<b className="live-cancelled">Cancelled</b>:data?.canManage&&<div className="live-event-actions"><button onClick={()=>beginEdit(session)} disabled={saving||loading}>Edit</button><button onClick={()=>cancel(session)} disabled={saving||loading}>Cancel</button></div>}
    </article>;
  }
  const days=view==="month"?Array.from({length:42},(_,index)=>addDays(range.startDay,index)):
    view==="week"?Array.from({length:7},(_,index)=>addDays(range.startDay,index)):[];

  return <section className="live-calendar">
    <header className="live-header"><div><h2>Live Calendar</h2><p>{data?.canManage?"Plan livestreams for each store.":"Upcoming livestreams for your stores."}</p></div>{data?.canManage&&<button className="live-primary" onClick={beginAdd} disabled={loading||saving||!stores.length}>+ Add live</button>}</header>
    <div className="live-toolbar">
      <div className="live-period"><button onClick={()=>changePeriod(-1)} aria-label="Previous period">‹</button><strong>{title}</strong><button onClick={()=>changePeriod(1)} aria-label="Next period">›</button><button onClick={()=>setAnchor(storeCalendarAnchor())}>Today</button></div>
      <div className="live-filters">{stores.length>1&&<label>Store<select aria-label="Calendar store" value={filter} onChange={event=>setFilterOverride(event.target.value)}><option value="all">All Stores</option>{stores.map(store=><option key={store.id} value={store.id}>{store.name} · {store.platform}</option>)}</select></label>}<div className="live-views" aria-label="Calendar view">{(["month","week","list"] as const).map(item=><button key={item} className={view===item?"active":""} onClick={()=>setView(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div></div>
    </div>
    {error&&!form&&<p className="live-error" role="alert">{error}</p>}{message&&<p className="live-message" role="status">{message}</p>}
    {data?.canManage&&data.registryError&&<p className="live-error" role="status">{data.registryError}</p>}
    {data?.canManage&&Boolean(data.unregisteredStores?.length)&&<details className="live-unregistered"><summary>{data.unregisteredStores!.length} Link Directory stores need calendar registration</summary><p>Register a store to schedule it and grant selected customers access. Check its market before registering.</p><div>{data.unregisteredStores!.map(name=><div key={name}><span>{name}</span><button disabled={saving} onClick={()=>registerStore(name)}>Register {/\bSG\b|Singapore|\.sg$/i.test(name)?"SG":"MY"} store</button></div>)}</div></details>}
    {!loading&&!error&&stores.length>0&&filtered.length===0&&view!=="list"&&<p className="live-empty">No live sessions scheduled.</p>}
    {loading?<p className="live-empty">Loading live sessions…</p>:error?<p className="live-empty">Unable to display the calendar.</p>:!stores.length?<p className="live-empty">No stores assigned for Live Calendar. Contact your administrator.</p>:view==="list"?<div className="live-list">{scheduled.length?scheduled.map(card):<p className="live-empty">No live sessions scheduled.</p>}{data?.canManage&&filtered.filter(session=>session.status==="cancelled").map(card)}</div>:<div className={`live-grid ${view}`}><div className="live-weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><span key={day}>{day}</span>)}</div><div className="live-days">{days.map(day=>{const key=dateKey(day);const events=filtered.filter(session=>dayOf(session.start_at)===key);return <section key={key} className={`live-day${key===storeDateKey()?" today":""}`}><time dateTime={key}>{view==="month"?day.getUTCDate():formatDay(day)}</time><div>{events.map(card)}</div></section>;})}</div></div>}
    {form&&<div className="live-modal-backdrop"><div className="live-modal" ref={modalRef} onKeyDown={event=>{if(event.key==="Escape"&&!saving){event.preventDefault();setForm(null);}if(event.key==="Tab"){const elements=modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea');if(!elements?.length)return;const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}} role="dialog" aria-modal="true" aria-label={form.id?"Edit live session":"Add live session"}><h3>{form.id?"Edit live session":"Add live session"}</h3><div className="live-form"><label>Store<select value={form.storeId} onChange={event=>{const store=byStore.get(event.target.value);if(store){setForm({...form,storeId:store.id,timeZone:store.timeZone});setOverlap([]);}}}>{stores.map(store=><option key={store.id} value={store.id}>{store.name} · {store.platform}</option>)}</select></label><label>Date and start<input type="datetime-local" value={form.startLocal} onChange={event=>{setForm({...form,startLocal:event.target.value});setOverlap([]);}} required/></label><label>End<input type="datetime-local" value={form.endLocal} onChange={event=>{setForm({...form,endLocal:event.target.value});setOverlap([]);}} required/></label><label>Store time zone<input value={form.timeZone} readOnly/></label><label>Title (optional)<input maxLength={120} value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="Live session"/></label><label>Internal note (admin only)<textarea maxLength={2000} value={form.internalNote} onChange={event=>setForm({...form,internalNote:event.target.value})}/></label></div>{error&&<p className="live-error" role="alert">{error}</p>}<p className="live-preview">Preview: {form.startLocal.replace("T"," ")} – {form.endLocal.replace("T"," ")} ({form.timeZone==="Asia/Singapore"?"SGT":"MYT"})</p>{overlap.length>0&&<p className="live-overlap" role="alert">This store has {overlap.length} overlapping live session{overlap.length===1?"":"s"}. Check the times before confirming.</p>}<div className="live-modal-actions"><button onClick={()=>setForm(null)} disabled={saving}>Close</button><button className="live-primary" onClick={()=>save(overlap.length>0)} disabled={saving}>{saving?"Saving…":overlap.length>0?"Save despite overlap":form.id?"Save changes":"Schedule live"}</button></div></div></div>}
  </section>;
}
