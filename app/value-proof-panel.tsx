"use client";
import { useState } from "react";

export type ValueAction={
  id:number;storeId:string;actionDate:string;category:string;title:string;detail:string;impact:string;
  status:"draft"|"approved"|"in_progress"|"completed";ownerEmail:string|null;dueDate:string|null;
  createdBy:string|null;approvedBy:string|null;evidenceUrl:string|null;resultSummary:string|null;
  resultType:string|null;resultAmount:string|null;resultCurrency:string|null;resultSource:string|null;
  resultVerifiedAt:string|null;resultSubmittedBy:string|null;
};
type Props={actions:ValueAction[];storeId:string;stores:{id:string;name:string}[];role:string;actorEmail:string;onSaved:()=>void};
const resultLabels:Record<string,string>={verified_saving:"Verified cost saving",sales_change:"Sales change",unattributed:"Influence, not solely attributable",risk_reduction:"Risk reduced"};
export function ValueProofPanel({actions,storeId,stores,role,actorEmail,onSaved}:Props){
  const manager=role==="manager"||role==="superadmin";
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [draft,setDraft]=useState({category:"Pricing",title:"",detail:"",impact:"",ownerEmail:"",dueDate:""});
  const [selected,setSelected]=useState<number|null>(null);
  const [result,setResult]=useState({status:"in_progress",evidenceUrl:"",resultSummary:"",resultType:"unattributed",resultAmount:"",resultCurrency:"MYR",resultSource:""});
  async function save(payload:Record<string,unknown>,method:"POST"|"PATCH"){
    setError("");setNotice("");setBusy(true);
    try{
      const response=await fetch("/api/value-actions",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error??"Unable to save action.");
      setNotice(method==="POST"?"Draft saved for a second manager to approve.":"Action updated.");
      onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save action.");}
    finally{setBusy(false)}
  }
  return <section className="value-proof" aria-label="Shopee Hub value proof">
    <div className="page-title"><div><p className="kicker">SHOPEE HUB VALUE</p><h2>What we found, did and achieved</h2></div><span className="warning-pill">{actions.filter(action=>action.status!=="draft").length} reviewed records</span></div>
    <p>Each record shows the issue, approved action, owner, due date, evidence and result. Financial impact appears only with a source.</p>
    {manager&&storeId!=="all"&&<form className="card" onSubmit={event=>{event.preventDefault();void save({storeId,...draft},"POST");}}>
      <h3>Record an opportunity or risk</h3>
      <div className="value-proof-form">
        <label>Category<select value={draft.category} onChange={event=>setDraft({...draft,category:event.target.value})}><option>Pricing</option><option>Platform fees</option><option>Advertising</option><option>Inventory</option><option>Fulfilment</option><option>Fake seller</option><option>Customer service</option><option>Client request</option><option>Other</option></select></label>
        <label>Title<input required maxLength={200} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <label>Issue and action<textarea required value={draft.detail} onChange={event=>setDraft({...draft,detail:event.target.value})}/></label>
        <label>Expected impact<input required value={draft.impact} onChange={event=>setDraft({...draft,impact:event.target.value})}/></label>
        <label>Owner email<input type="email" value={draft.ownerEmail} onChange={event=>setDraft({...draft,ownerEmail:event.target.value})}/></label>
        <label>Due date<input type="date" value={draft.dueDate} onChange={event=>setDraft({...draft,dueDate:event.target.value})}/></label>
      </div><button type="submit" disabled={busy}>Save draft</button>
    </form>}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="value-proof-list">{actions.length?actions.map(action=><article className="card value-proof-item" key={action.id}>
      <div className="card-head"><div><p className="kicker">{action.category} · {stores.find(store=>store.id===action.storeId)?.name??action.storeId}</p><h3>{action.title}</h3></div><strong>{action.status.replace("_"," ")}</strong></div>
      <p><b>Opportunity or risk:</b> {action.detail}</p><p><b>Expected impact:</b> {action.impact}</p>
      <p><b>Owner:</b> {action.ownerEmail??"To assign"} · <b>Due:</b> {action.dueDate??"To set"} · <b>Action date:</b> {action.actionDate}</p>
      {action.approvedBy&&<p><b>Approved by:</b> {action.approvedBy}</p>}
      {action.evidenceUrl&&<p><a href={action.evidenceUrl} target="_blank" rel="noopener noreferrer">Execution evidence →</a></p>}
      {action.resultSummary&&<p className="value-proof-result"><b>{action.resultVerifiedAt?"Verified result:":"Result awaiting review:"}</b> {action.resultSummary}<br/><small>{resultLabels[action.resultType??""]??action.resultType}{action.resultAmount&&action.resultCurrency?" · "+action.resultCurrency+" "+action.resultAmount:""}{action.resultSource?" · Source: "+action.resultSource:""}</small></p>}
      {manager&&action.status==="draft"&&(action.createdBy===actorEmail?<p>Awaiting another manager to approve.</p>:<button disabled={busy} onClick={()=>void save({storeId:action.storeId,actionId:action.id,operation:"approve"},"PATCH")}>Approve for client view</button>)}
      {manager&&action.resultSummary&&!action.resultVerifiedAt&&(action.resultSubmittedBy===actorEmail?<p>Awaiting another manager to verify the result.</p>:<button disabled={busy} onClick={()=>void save({storeId:action.storeId,actionId:action.id,operation:"verify_result"},"PATCH")}>Verify result for client view</button>)}
      {manager&&action.status!=="draft"&&<div>
        <button type="button" onClick={()=>setSelected(selected===action.id?null:action.id)}>{selected===action.id?"Close update":"Record progress or result"}</button>
        {selected===action.id&&<div className="value-proof-form">
          <label>Progress<select value={result.status} onChange={event=>setResult({...result,status:event.target.value})}><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label>
          <label>Evidence URL<input type="url" value={result.evidenceUrl} onChange={event=>setResult({...result,evidenceUrl:event.target.value})}/></label>
          <button disabled={busy} onClick={()=>void save({storeId:action.storeId,actionId:action.id,operation:"progress",status:result.status,evidenceUrl:result.evidenceUrl},"PATCH")}>Save progress</button>
          <label>Result summary<textarea value={result.resultSummary} onChange={event=>setResult({...result,resultSummary:event.target.value})}/></label>
          <label>Result type<select value={result.resultType} onChange={event=>setResult({...result,resultType:event.target.value})}>{Object.entries(resultLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          {(result.resultType==="verified_saving"||result.resultType==="sales_change")&&<>
            <label>Exact amount<input inputMode="decimal" value={result.resultAmount} onChange={event=>setResult({...result,resultAmount:event.target.value})}/></label>
            <label>Currency<input value={result.resultCurrency} onChange={event=>setResult({...result,resultCurrency:event.target.value})}/></label>
            <label>Source reference<input value={result.resultSource} onChange={event=>setResult({...result,resultSource:event.target.value})}/></label>
          </>}
          <button disabled={busy} onClick={()=>void save({storeId:action.storeId,actionId:action.id,operation:"result",...result},"PATCH")}>Save result</button>
        </div>}
      </div>}
    </article>):<article className="card"><h3>No reviewed actions yet</h3><p>Action records appear after a manager reviews them.</p></article>}</div>
  </section>;
}
