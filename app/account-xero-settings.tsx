"use client";
import {Fragment,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {AccountResponse,AccountStoreRow} from './account-contract';
import type {AccountXeroGroup} from './account-xero-model';
import './account-xero-settings.css';

function invoiceDate(value:string|null|undefined){if(!value)return '—';const legacy=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);const date=new Date(legacy?Number(legacy[1]):value);return Number.isFinite(date.getTime())?date.toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'—';}

/** Source currency is displayed explicitly and never inferred from the store country. */
export function xeroDisplayMoney(value:string|null|undefined,currency:string){
 if(value==null||!/^\d+(?:\.\d{1,2})?$/.test(value))return '—';
 const [whole,fraction='']=value.split('.');return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction.padEnd(2,'0')}`;
}
export function XeroRowAmounts({row,field,active}:{row:AccountStoreRow;field:'invoiced'|'received'|'outstanding';active:boolean}){
 if(!active)return null;
 const actual=row.xeroActuals;
 if(!actual||actual.status==='not_synced'||!actual.byCurrency.length)return <span className="account-xero-muted" title="No synced invoices assigned to this client">—</span>;
 return <>{actual.byCurrency.map(amount=><span className="account-xero-money" key={amount.currency}>{xeroDisplayMoney(amount[field],amount.currency)}</span>)}{field==='invoiced'&&actual.status==='pending'&&<small className="account-xero-muted">Partial · invoices need review</small>}</>;
}
export function XeroInvoiceDetails({row}:{row:AccountStoreRow}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open&&!ref.current?.open)ref.current?.showModal();},[open]);
 if(!row.xeroActuals?.invoices.length)return null;
 return <><button type="button" className="account-xero-invoice-open" onClick={()=>setOpen(true)}>Invoices ({row.xeroActuals.invoices.length})</button>{open&&typeof document!=='undefined'&&createPortal(<dialog ref={ref} className="account-xero-invoice-dialog" aria-label={`Invoices for ${row.project||row.storeName}`} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><header><h3>{row.project||row.storeName} invoices</h3><button type="button" onClick={()=>setOpen(false)}>Close</button></header><p>Paid / applied includes allocations. Credits are shown separately.</p><div className="account-xero-invoice-scroll"><table><thead><tr><th>Invoice</th><th>Project</th><th>Date</th><th>Invoiced</th><th>Paid / applied</th><th>Credits</th><th>Outstanding</th></tr></thead><tbody>{row.xeroActuals.invoices.map(invoice=><tr key={invoice.invoiceId}><th>{invoice.xeroUrl?<a href={invoice.xeroUrl} target="_blank" rel="noopener noreferrer">{invoice.invoiceNumber??invoice.invoiceId}</a>:invoice.invoiceNumber??invoice.invoiceId}</th><td>{invoice.project??'—'}</td><td>{invoiceDate(invoice.date)}</td><td>{xeroDisplayMoney(invoice.gross,invoice.currency)}</td><td>{xeroDisplayMoney(invoice.amountPaid,invoice.currency)}</td><td>{xeroDisplayMoney(invoice.amountCredited,invoice.currency)}</td><td>{xeroDisplayMoney(invoice.amountDue,invoice.currency)}</td></tr>)}</tbody></table></div></dialog>,document.body)}</>;
}
export function AccountXeroSummary({data}:{data:AccountResponse}){
 const xero=data.xero;if(!xero?.configured)return null;
 const currencies=[...new Set([...xero.totals.map(t=>t.currency),...xero.collections.map(t=>t.currency)])];
 if(!currencies.length)return <p className="account-notice" role="status">{xero.lastError?'Accounting sync needs attention. Open Accounting settings.':xero.connected?'No synced invoices for this month.':'Connect Xero in Accounting settings to see invoices and receipts.'}</p>;
 return <section className="account-finance-overview" aria-label="Income by currency">{currencies.map(currency=>{const total=xero.totals.find(t=>t.currency===currency),cash=xero.collections.find(t=>t.currency===currency);return <section className="account-summary-market" key={currency} aria-label={`${currency} income overview`}><h3>{currency} income</h3><div className="account-overview-metrics">{[{label:'Cash received today',value:(!xero.today||xero.today===data.today)?cash?.todayCollected:null,period:data.today},{label:'Cash received',value:cash?.monthCollected,period:data.invoiceMonth},{label:'Invoiced',value:total?.gross,period:data.invoiceMonth},{label:'Outstanding',value:total?.amountDue,period:`Invoices in ${data.invoiceMonth}`}].map(metric=><article className="metric" key={metric.label}><span>{metric.label}</span><strong>{xeroDisplayMoney(metric.value,currency)}</strong><small>{metric.period}</small></article>)}</div></section>;})}</section>;
}
export function AccountXeroSettings({data,onSaved}:{data:AccountResponse;onSaved:()=>void}){
 const xero=data.xero;const [choices,setChoices]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const replay=useRef<{payload:string;id:string}|null>(null);
 const savedCallback=useRef(onSaved),workingRef=useRef(false);
 useEffect(()=>{savedCallback.current=onSaved;workingRef.current=busy;},[onSaved,busy]);
 // Preserve the existing visible-page five-minute source refresh after moving Xero into settings.
 useEffect(()=>{
  if(!xero?.configured||!xero.connected)return;
  const abort=new AbortController();let inFlight=false;
  const timer=window.setInterval(async()=>{
   if(document.visibilityState!=='visible'||workingRef.current||inFlight)return;
   inFlight=true;
   try{const response=await fetch('/api/integrations/xero/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:data.invoiceMonth}),signal:abort.signal});if(response.ok&&!abort.signal.aborted)savedCallback.current();}catch{/* Keep the last complete snapshot; manual sync exposes actionable errors. */}finally{inFlight=false;}
  },300_000);
  return()=>{abort.abort();window.clearInterval(timer);};
 },[xero?.configured,xero?.connected,data.invoiceMonth]);

 const [refreshPending,setRefreshPending]=useState(false);
 const awaitingSnapshot=useRef<AccountResponse|null>(null),lastVersions=useRef<string|null>(null);
 useEffect(()=>{
  const versions=JSON.stringify(data.xero?.groups.map(group=>[group.groupKey,group.expectedVersion]));
  const changed=lastVersions.current!==null&&lastVersions.current!==versions;lastVersions.current=versions;
  const savedReload=awaitingSnapshot.current!==null&&awaitingSnapshot.current!==data;
  if(!changed&&!savedReload)return;
  let current=true;
  queueMicrotask(()=>{if(!current)return;awaitingSnapshot.current=null;setRefreshPending(false);setChoices({});replay.current=null;});
  return()=>{current=false;};
 },[data]);
 const working=busy||refreshPending;
 if(!xero)return null;
 const targetSource=xero.targets??data.stores.map(row=>({unitKey:row.rosterKey??row.id,name:row.project||row.storeName,entity:row.entity??'',storeId:row.storeId,storeName:row.storeName}));
 const targets=targetSource.filter(row=>row.storeId&&row.entity?.trim()).map(row=>({key:row.unitKey,name:row.name,entity:row.entity}));
 const validTargets=new Set(targets.map(row=>row.key));
 const unresolved=xero.groups.filter(group=>group.invoiceCount>0&&!['mapped','split'].includes(group.status));
 const exact=unresolved.filter(group=>group.status==='candidate'&&group.candidateUnitKeys.length<=1&&group.suggestedUnitKey&&validTargets.has(group.suggestedUnitKey));
 async function save(groups:AccountXeroGroup[],auto=false,invoiceId?:string){
  const mappings=groups.map(group=>({contactId:group.contactId,categoryId:group.categoryId,optionId:group.optionId,unitKey:auto?group.suggestedUnitKey:choices[invoiceId?`${group.groupKey}:${invoiceId}`:group.groupKey],effectiveMonth:data.invoiceMonth,expectedVersion:group.expectedVersion,...(invoiceId?{invoiceId}:{})}));
  if(!mappings.length||mappings.some(row=>!row.unitKey||!validTargets.has(row.unitKey))){setError('Choose a client with a company name and linked store.');return;}
  const body={invoiceMonth:data.invoiceMonth,mappings},payload=JSON.stringify(body);if(replay.current?.payload!==payload)replay.current={payload,id:crypto.randomUUID()};
  setBusy(true);setError('');setMessage('');try{const response=await fetch('/api/admin/account/xero-mapping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,requestId:replay.current!.id})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save matching.');setChoices({});replay.current=null;awaitingSnapshot.current=data;setRefreshPending(true);setMessage('Client matching saved. Refreshing records…');onSaved();}catch(cause){setError(cause instanceof Error?cause.message:'Unable to save matching.');}finally{setBusy(false);}
 }
 async function connect(){setBusy(true);setError('');try{const response=await fetch('/api/integrations/xero/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});const result=await response.json();if(!response.ok||typeof result.authorizeUrl!=='string')throw Error('Unable to connect. Please try again.');window.location.assign(result.authorizeUrl);}catch(cause){setError(cause instanceof Error?cause.message:'Unable to connect.');setBusy(false);}}
 async function sync(){setBusy(true);setError('');setMessage('');try{const response=await fetch('/api/integrations/xero/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:data.invoiceMonth})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to sync.');setMessage('Accounting records updated.');onSaved();}catch(cause){setError(cause instanceof Error?cause.message:'Unable to sync.');}finally{setBusy(false);}}
 return <details className="account-xero-settings"><summary>Accounting settings{unresolved.length>0&&` (${unresolved.length} need matching)`}</summary><div className="account-xero-settings-body"><div className="account-xero-toolbar"><div><strong>{xero.organisationName||'Xero connection'}</strong><p>{xero.connected?'Connected':'Not connected'}{xero.lastSyncedAt&&` · Last synced ${new Date(xero.lastSyncedAt).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})+' MYT'}`}</p></div>{xero.connected?<button type="button" disabled={working} onClick={sync}>{busy?'Working…':'Sync records'}</button>:<button type="button" disabled={working||!xero.configured} onClick={connect}>Connect Xero</button>}</div>{!xero.configured&&<p role="status">Xero setup is unavailable. Ask your administrator to complete the connection settings.</p>}{xero.lastError&&<p role="status">Accounting sync needs attention. Try Sync records or reconnect.</p>}{xero.unmappedInvoiceCount>0&&<p>{xero.unmappedInvoiceCount} invoices need client matching. Their amounts are included in the overview but not assigned to a client.</p>}
 {xero.groups.length>0&&<><div className="account-xero-toolbar"><h4>Client matching</h4><button type="button" disabled={working||!exact.length} onClick={()=>save(exact,true)}>Apply {exact.length} exact matches</button></div><p className="account-xero-muted">Changes apply from invoice month {data.invoiceMonth}. Only clients with a company name and linked store are available.</p><div className="account-table-scroll"><table><thead><tr><th>Company</th><th>Project</th><th>Dashboard client</th><th>Action</th></tr></thead><tbody>{xero.groups.map(group=>{
 const perInvoice=group.candidateUnitKeys.length>1||(group.invoiceCount>1&&group.candidateUnitKeys.length!==1)||group.status==='partial'||group.status==='split';
 const invoiceChoices=group.invoiceChoices??[];
 return <Fragment key={group.groupKey}><tr><th>{group.companyName||'Company name unavailable'}<small>{perInvoice?`${group.mappedInvoiceCount??0} of ${group.invoiceCount} invoices matched`:group.status==='conflict'?'Previous match unavailable':group.status==='mapped'?'Matched':'Not matched'}</small></th><td>{group.project}</td><td>{perInvoice?<span>Match each invoice below</span>:<>{group.status==='candidate'&&group.suggestedUnitKey&&validTargets.has(group.suggestedUnitKey)&&<small className="account-xero-suggestion">Suggested: {targets.find(target=>target.key===group.suggestedUnitKey)?.name}</small>}<select aria-label={`Match ${group.companyName||group.contactId} ${group.project}`} disabled={working} value={choices[group.groupKey]??group.mappedUnitKey??''} onChange={event=>setChoices(current=>({...current,[group.groupKey]:event.target.value}))}><option value="">Choose client</option>{targets.map(target=><option key={target.key} value={target.key}>{target.name} · {target.entity}</option>)}</select></>}</td><td>{!perInvoice&&<button type="button" disabled={working||!validTargets.has(choices[group.groupKey]??'')} onClick={()=>save([group])}>Save match</button>}</td></tr>{perInvoice&&<tr><td colSpan={4}><div className="account-table-scroll"><table aria-label={`Invoice matching for ${group.companyName||group.contactId} ${group.project}`}><thead><tr><th>Invoice</th><th>Invoiced</th><th>Dashboard client</th><th>Action</th></tr></thead><tbody>{invoiceChoices.map(invoice=>{const choiceKey=`${group.groupKey}:${invoice.invoiceId}`;return <tr key={invoice.invoiceId}><th><a href={invoice.xeroUrl} target="_blank" rel="noopener noreferrer">{invoice.invoiceNumber??invoice.invoiceId}</a><small>{invoiceDate(invoice.date)}{invoice.status==='mapped'?' · Matched':''}</small></th><td>{xeroDisplayMoney(invoice.invoiced,invoice.currency)}</td><td><select aria-label={`Client for invoice ${invoice.invoiceNumber??invoice.invoiceId}`} disabled={working} value={choices[choiceKey]??invoice.mappedUnitKey??''} onChange={event=>setChoices(current=>({...current,[choiceKey]:event.target.value}))}><option value="">Choose client</option>{targets.map(target=><option key={target.key} value={target.key}>{target.name} · {target.entity}</option>)}</select></td><td><button type="button" disabled={working||!validTargets.has(choices[choiceKey]??'')} onClick={()=>save([group],false,invoice.invoiceId)}>Save invoice match</button></td></tr>;})}{!invoiceChoices.length&&<tr><td colSpan={4}>No invoices for this month. A company match cannot be applied to multiple clients.</td></tr>}</tbody></table></div></td></tr>}</Fragment>;
 })}</tbody></table></div></>}
 {error&&<p className="account-notice error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</div></details>;
}
