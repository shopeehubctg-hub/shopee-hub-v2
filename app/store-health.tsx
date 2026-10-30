"use client";
import {useEffect,useState,type CSSProperties} from 'react';
import {HEALTH_METRICS,healthMetricText,type StoreHealthData,type StoreHealthRow} from './store-health-model';
import './store-health-design.css';
const stateLabel=(state:StoreHealthRow['state'])=>({attention:'Needs attention',incomplete:'Incomplete',no_flags:'No flags'}[state]);
const dateLabel=(date:string)=>new Intl.DateTimeFormat('en-MY',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
function Coverage({available,total}:{available:number;total:number}){
 const percentage=total?available/total*100:0;
 return <div className="health-design-coverage"><div className="health-design-ring" style={{'--coverage':`${percentage}%`} as CSSProperties} role="img" aria-label={`${available} of ${total} metrics available`}><div><strong>{available}<span>/{total}</span></strong><small>Metrics available</small></div></div></div>;
}
export function StoreHealth({storeId,initialStoreId='all',refreshKey=0,canView=false}:{storeId?:string;initialStoreId?:string;refreshKey?:number;canView?:boolean}){
 const selectedStoreId=storeId??initialStoreId;
 const [data,setData]=useState<StoreHealthData|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [refresh,setRefresh]=useState(0);
 useEffect(()=>{const controller=new AbortController();
  // Discard stale store data while changing the global Store selector.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setLoading(canView);setError('');setData(null);if(!canView)return;
  fetch(`/api/store-health?storeId=${encodeURIComponent(selectedStoreId)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error??'Unable to load Store Health.');if(!controller.signal.aborted)setData(result);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Unable to load Store Health.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[selectedStoreId,refresh,refreshKey,canView]);
 const selected=selectedStoreId!=='all'?data?.stores[0]:null;
 const stores=data?.stores??[];
 const available=stores.reduce((sum,row)=>sum+HEALTH_METRICS.filter(({key})=>row.metrics[key]!==null).length,0);
 const flags=stores.reduce((sum,row)=>sum+row.flags.length,0);
 const counts={attention:stores.filter(row=>row.state==='attention').length,incomplete:stores.filter(row=>row.state==='incomplete').length,no_flags:stores.filter(row=>row.state==='no_flags').length};
 return <section className="page store-health-page health-design" aria-busy={loading}><header className="page-title health-design-title"><div><h2>Store Health</h2>{data?.latestCheckDate&&<p>Last checked {dateLabel(data.latestCheckDate)}</p>}</div><button type="button" disabled={loading||!canView} onClick={()=>setRefresh(value=>value+1)}>Refresh</button></header>
  {!canView?<article className="health-design-empty">Store Health is unavailable for this account.</article>:loading?<article className="health-design-empty" role="status">Loading Store Health…</article>:error?<article className="health-design-empty" role="alert">{error}</article>:!stores.length?<article className="health-design-empty"><h3>No health check available</h3><p>There are no verified health metrics for {selectedStoreId==='all'?'your stores':'this store'} yet.</p></article>:<>
   <section className="health-design-hero" aria-label={selected?'Latest store check':'Latest store checks'}><div className="health-design-hero-copy"><span className="health-design-eyebrow">Latest check</span><h3>{selected?stateLabel(selected.state):'Your stores, at a glance'}</h3><p>{selected?selected.storeName:`${stores.length} stores checked`}</p><div className="health-design-hero-meta"><span>{flags} flagged {flags===1?'metric':'metrics'}</span><span>{data?.latestCheckDate?dateLabel(data.latestCheckDate):'—'}</span></div>{selected&&<p className="health-design-hero-note">{selected.state==='incomplete'?'Some metrics are unavailable.':selected.flags.length?'Review the flagged metrics below.':'No flags recorded in this check.'}</p>}</div><Coverage available={available} total={stores.length*HEALTH_METRICS.length}/></section>
   {selected?<>
    <section className="health-design-metrics" aria-label="Health metrics">{HEALTH_METRICS.map(({key,label,unit})=>{const value=selected.metrics[key];const flagged=selected.flags.includes(key);return <article key={key} className={`health-design-metric${flagged?' is-flagged':''}`}><div className="health-design-metric-top"><span>{label}</span>{flagged&&<span className="health-design-dot" aria-label="Flagged"/>}</div><strong>{healthMetricText(value,key)}</strong>{unit==='%'&&value!==null?<><div className="health-design-bar" aria-hidden="true"><span style={{width:`${value}%`}}/></div><small>Reported rate · 0–100%</small></>:<small>{value===null?'Not available':flagged?'Flagged in latest check':'Latest reported value'}</small>}</article>;})}</section>
    {selected.flags.length>0&&<section className="health-design-attention"><div><h3>Review next</h3><p>{selected.flags.length} flagged {selected.flags.length===1?'metric':'metrics'}</p></div><ul>{selected.flags.map(key=><li key={key}><span>{HEALTH_METRICS.find(metric=>metric.key===key)!.label}</span><strong>{healthMetricText(selected.metrics[key],key)}</strong></li>)}</ul></section>}
   </>:<>
    <section className="health-design-summary" aria-label="Check status summary">{(['attention','incomplete','no_flags'] as const).map(state=><article key={state} className={`health-design-summary-card ${state}`}><span className="health-design-status-icon" aria-hidden="true">{state==='attention'?'!':state==='incomplete'?'…':'✓'}</span><div><strong>{counts[state]}</strong><span>{stateLabel(state)}</span></div></article>)}</section>
    <section className="health-design-checks"><div className="health-design-section-head"><h3>Store checks</h3><span>{stores.length} stores</span></div><div className="health-design-table-wrap"><table className="health-design-table"><thead><tr><th>Store</th><th>Status</th>{HEALTH_METRICS.map(({key,label})=><th key={key}>{label}</th>)}</tr></thead><tbody>{stores.map(row=><tr key={row.storeId}><th scope="row">{row.storeName}</th><td><span className={`health-design-badge ${row.state}`}>{stateLabel(row.state)}</span></td>{HEALTH_METRICS.map(({key})=><td key={key} className={row.flags.includes(key)?'is-flagged':''}>{healthMetricText(row.metrics[key],key)}</td>)}</tr>)}</tbody></table></div></section>
   </>}
  </>}
 </section>;
}
