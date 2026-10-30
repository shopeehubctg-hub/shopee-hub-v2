"use client";
import {useEffect,useState} from 'react';
import {HEALTH_METRICS,healthMetricText,type StoreHealthData,type StoreHealthRow} from './store-health-model';
const stateLabel=(state:StoreHealthRow['state'])=>({attention:'Needs attention',incomplete:'Incomplete',no_flags:'No flags'}[state]);
const dateLabel=(date:string)=>new Intl.DateTimeFormat('en-MY',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
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
 return <section className="page store-health-page" aria-busy={loading}><header className="page-title"><div><h2>Store Health</h2>{data?.latestCheckDate&&<p>Last checked {dateLabel(data.latestCheckDate)}</p>}</div><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</button></header>
  {!canView?<article className="card">Store Health is unavailable for this account.</article>:loading?<article className="card" role="status">Loading Store Health…</article>:error?<article className="card" role="alert">{error}</article>:!data?.stores.length?<article className="card"><h3>No health check available</h3><p>There are no verified health metrics for {selectedStoreId==='all'?'your stores':'this store'} yet.</p></article>:selected?<>
   <div className={`store-health-state ${selected.state}`}>{stateLabel(selected.state)}</div><section className="metric-grid store-health-metrics">{HEALTH_METRICS.map(({key,label})=><article key={key} className={`metric${selected.flags.includes(key)?' danger':''}`}><span>{label}</span><strong>{healthMetricText(selected.metrics[key],key)}</strong></article>)}</section>
   {selected.flags.length>0&&<article className="card"><h3>Needs attention</h3><ul className="store-health-flags">{selected.flags.map(key=><li key={key}><span>{HEALTH_METRICS.find(metric=>metric.key===key)!.label}</span><strong>{healthMetricText(selected.metrics[key],key)}</strong></li>)}</ul></article>}
   {selected.state==='incomplete'&&<p className="store-health-note">Some metrics are unavailable.</p>}
  </>:<article className="card store-health-overview"><div className="card-head"><h3>Store checks</h3><span>{data.stores.length} stores</span></div><div className="store-health-table-wrap"><table className="store-health-table"><thead><tr><th>Store</th><th>Checked</th><th>Status</th>{HEALTH_METRICS.map(({key,label})=><th key={key}>{label}</th>)}</tr></thead><tbody>{data.stores.map(row=><tr key={row.storeId}><th scope="row">{row.storeName}</th><td>{dateLabel(row.checkDate)}</td><td><span className={`store-health-state ${row.state}`}>{stateLabel(row.state)}</span></td>{HEALTH_METRICS.map(({key})=><td key={key} className={row.flags.includes(key)?'store-health-flagged':''}>{healthMetricText(row.metrics[key],key)}</td>)}</tr>)}</tbody></table></div></article>}
 </section>;
}
