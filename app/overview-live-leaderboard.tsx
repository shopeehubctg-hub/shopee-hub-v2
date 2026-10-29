'use client';
import {useEffect,useState} from 'react';
import {monthBounds,weekBounds} from './live-leaderboard-model';
type Board={period:{start:string;end:string};status:'pending'|'partial'|'complete';shops:Array<{rank:number;name:string;salesCents:number;observed:boolean}>;updated:string|null;through:string|null};
const date=(s:string)=>new Date(s+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const money=(cents:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
export function OverviewLiveLeaderboard({canView=false,refreshKey=0}:{canView?:boolean;refreshKey?:number}){
 const [mode,setMode]=useState<'weekly'|'monthly'>('monthly'),[weekOffset,setWeekOffset]=useState(-1),[monthOffset,setMonthOffset]=useState(0);
 const [data,setData]=useState<Board|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const weekly=mode==='weekly',offset=weekly?weekOffset:monthOffset,setOffset=weekly?setWeekOffset:setMonthOffset;
 const period=weekly?weekBounds(new Date(),offset):monthBounds(new Date(),offset);
 useEffect(()=>{if(!canView){setData(null);setLoading(false);return;}const controller=new AbortController();setLoading(true);setData(null);setError('');
  fetch('/api/overview/live-leaderboard?mode='+mode+'&'+(weekly?'week='+period.start:'month='+period.start.slice(0,7)),{signal:controller.signal,cache:'no-store'}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to load leaderboard.');if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[canView,mode,weekly,period.start,refreshKey,retry]);
 return <section className="card weekly-live" aria-label="Live Sales Leaderboard"><div className="card-head"><div><h3>Live Sales Leaderboard</h3>{canView&&<p className="sales-muted">{date(period.start)} – {date(period.end)} · MYT</p>}</div>{canView&&<div className="weekly-live-toolbar"><div className="sales-trend-tabs" role="group" aria-label="Leaderboard period">{(['weekly','monthly'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='weekly'?'Weekly':'Monthly'}</button>)}</div><div className="weekly-live-controls"><button type="button" onClick={()=>setOffset(v=>v-1)} aria-label={weekly?'Previous week':'Previous month'}>‹</button><button type="button" onClick={()=>setOffset(weekly?-1:0)}>{weekly?'Last week':'This month'}</button><button type="button" onClick={()=>setOffset(v=>v+1)} disabled={offset>=0} aria-label={weekly?'Next week':'Next month'}>›</button></div></div>}</div>
 {!canView?<div className="sales-locked"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Locked" role="img"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> ••••••</div>:loading?<p role="status">Loading leaderboard…</p>:error?<p role="alert">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:data&&<>
  <div className="weekly-live-meta">{data.status==='pending'?<span role="status">No sales updated for this period.</span>:<span>{data.through?'Through '+date(data.through):''}</span>}{data.updated&&<span>Last updated {new Date(data.updated).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'})} MYT</span>}</div>
  {data.shops.length>0&&<div className="sales-table-wrap"><table><thead><tr><th scope="col">Rank</th><th scope="col">Store</th><th scope="col">{weekly?'Weekly Sales':'Monthly Sales'}</th></tr></thead><tbody>{data.shops.map(shop=><tr key={shop.name}><td>{data.status==='pending'?'—':shop.rank}</td><th scope="row">{shop.name}</th><td>{money(shop.salesCents)}</td></tr>)}</tbody></table></div>}
 </>}
 </section>;
}
