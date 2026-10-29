'use client';
import {useEffect,useState} from 'react';
import {weekBounds} from './live-leaderboard-model';
type Board={period:{start:string;end:string};status:'pending'|'partial'|'complete';shops:Array<{rank:number;name:string;salesCents:number}>;pending:Array<{name:string}>;updated:string|null};
const date=(s:string)=>new Date(s+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const money=(cents:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
export function OverviewLiveLeaderboard({canView=false,refreshKey=0}:{canView?:boolean;refreshKey?:number}){
 const [offset,setOffset]=useState(-1),[data,setData]=useState<Board|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const period=weekBounds(new Date(),offset);
 useEffect(()=>{if(!canView){setData(null);setLoading(false);return;}const controller=new AbortController();setLoading(true);setData(null);setError('');
  fetch('/api/overview/live-leaderboard?week='+period.start,{signal:controller.signal,cache:'no-store'}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to load leaderboard.');if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[canView,period.start,refreshKey,retry]);
 return <section className="card weekly-live" aria-label="Weekly Live Leaderboard"><div className="card-head"><div><h3>Weekly Live Leaderboard</h3>{canView&&<p className="sales-muted">{date(period.start)} – {date(period.end)} · MYT</p>}</div>{canView&&<div className="weekly-live-controls"><button type="button" onClick={()=>setOffset(v=>v-1)} aria-label="Previous week">‹</button><button type="button" onClick={()=>setOffset(-1)}>Last week</button><button type="button" onClick={()=>setOffset(v=>v+1)} disabled={offset>=0} aria-label="Next week">›</button></div>}</div>
 {!canView?<div className="sales-locked"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Locked" role="img"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> ••••••</div>:loading?<p role="status">Loading leaderboard…</p>:error?<p role="alert">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:data?.status==='pending'?<p className="sales-muted" role="status">Weekly sales pending.</p>:data&&<>
  <div className="weekly-live-meta"><span>{data.shops.length}/8 stores updated{data.status==='partial'?' · Incomplete ranking':''}</span>{data.updated&&<span>Last updated {new Date(data.updated).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'})} MYT</span>}</div>
  <div className="sales-table-wrap"><table><thead><tr><th scope="col">Rank</th><th scope="col">Store</th><th scope="col">Weekly Sales</th></tr></thead><tbody>{data.shops.map(shop=><tr key={shop.name}><td>{shop.rank}</td><th scope="row">{shop.name}</th><td>{money(shop.salesCents)}</td></tr>)}{data.pending.map(shop=><tr key={shop.name}><td>—</td><th scope="row">{shop.name}</th><td className="sales-muted">Pending</td></tr>)}</tbody></table></div>
 </>}
 </section>;
}
