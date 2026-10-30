'use client';
import {useEffect,useState} from 'react';
import {monthBounds,weekBounds} from './live-leaderboard-model';
type Shop={rank:number;name:string;salesCents:number;observed:boolean};
type Board={period:{start:string;end:string};status:'pending'|'partial'|'complete';shops:Shop[];updated:string|null;through:string|null};
const date=(s:string)=>new Date(s+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const money=(cents:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
export function LeaderboardRanking({shops,pending=false}:{shops:Shop[];pending?:boolean}){
 const leaders=pending?[]:shops.filter(shop=>shop.observed&&shop.salesCents>0).slice(0,3);
 const leaderNames=new Set(leaders.map(shop=>shop.name));
 const remaining=shops.filter(shop=>!leaderNames.has(shop.name));
 const podium=leaders.length===3?[leaders[1],leaders[0],leaders[2]]:leaders;
 return <div className="live-ranking">
  {podium.length>0&&<div className="live-podium" aria-label="Top stores">{podium.map(shop=><article className={`live-podium-card live-place-${shop.rank}`} key={shop.name} aria-label={`Rank ${shop.rank}: ${shop.name}`}><span className="live-medal" aria-hidden="true">{shop.rank}</span><span className="live-store" title={shop.name}>{shop.name}</span><strong>{money(shop.salesCents)}</strong></article>)}</div>}
  {remaining.length>0&&<ol className="live-ranking-list" aria-label="Store rankings">{remaining.map(shop=><li key={shop.name}><span className="live-row-rank">{pending?'—':shop.rank}</span><span className="live-row-name" title={shop.name}>{shop.name}</span><strong>{money(shop.salesCents)}</strong></li>)}</ol>}
 </div>;
}
export function OverviewLiveLeaderboard({canView=false,refreshKey=0}:{canView?:boolean;refreshKey?:number}){
 const [mode,setMode]=useState<'weekly'|'monthly'>('monthly'),[weekOffset,setWeekOffset]=useState(-1),[monthOffset,setMonthOffset]=useState(0);
 const [data,setData]=useState<Board|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const weekly=mode==='weekly',offset=weekly?weekOffset:monthOffset,setOffset=weekly?setWeekOffset:setMonthOffset;
 const period=weekly?weekBounds(new Date(),offset):monthBounds(new Date(),offset);
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>{if(controller.signal.aborted)return;if(!canView){setData(null);setLoading(false);return;}setLoading(true);setData(null);setError('');});if(!canView)return()=>controller.abort();
  fetch('/api/overview/live-leaderboard?mode='+mode+'&'+(weekly?'week='+period.start:'month='+period.start.slice(0,7)),{signal:controller.signal,cache:'no-store'}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error||'Unable to load leaderboard.');if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[canView,mode,weekly,period.start,refreshKey,retry]);
 return <section className="card weekly-live" aria-label="Live Sales Leaderboard"><div className="card-head"><h3>Live Leaderboard</h3>{canView&&<div className="sales-trend-tabs" role="group" aria-label="Leaderboard period">{(['weekly','monthly'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='weekly'?'Weekly':'Monthly'}</button>)}</div>}</div>
 {canView&&<div className="live-period-row"><span>{date(period.start)} – {date(period.end)}</span><div className="weekly-live-controls"><button type="button" onClick={()=>setOffset(v=>v-1)} aria-label={weekly?'Previous week':'Previous month'}>‹</button><button className="live-reset" type="button" onClick={()=>setOffset(weekly?-1:0)}>{weekly?'Last week':'This month'}</button><button type="button" onClick={()=>setOffset(v=>v+1)} disabled={offset>=0} aria-label={weekly?'Next week':'Next month'}>›</button></div></div>}
 {!canView?<div className="sales-locked"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Locked" role="img"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> ••••••</div>:loading?<p className="live-state" role="status">Loading leaderboard…</p>:error?<p className="live-state" role="alert">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:data&&<>
  {data.status==='pending'&&<p className="live-state sales-muted" role="status">No sales updates yet.</p>}
  <LeaderboardRanking shops={data.shops} pending={data.status==='pending'}/>
  {(data.updated||data.status==='partial')&&<p className="live-updated">{data.status==='partial'?`${data.shops.filter(shop=>shop.observed).length}/${data.shops.length} stores updated · `:''}{data.updated?'Updated '+new Date(data.updated).toLocaleString('en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'})+' MYT':''}</p>}
 </>}
 </section>;
}
