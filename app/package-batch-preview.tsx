"use client";
import {useState} from "react";
import type {PreviewPackage} from "./package-batch-excel";
export function PackageBatchPreview(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [rows,setRows]=useState<PreviewPackage[]>([]);
 return <section className="batch-trial"><button type="button" onClick={()=>setOpen(!open)}>Batch Upload · Staging Preview</button>{open&&<div>
 <h3>Preview your package Excel</h3><p>Test preview only — no packages are saved. Prices are in MYR / SGD. Use one store per file.</p>
 <p>Fill Original Price, platform SKU and dates in Packages. Add one row per inventory item in Package Items, using the matching Package Code. Leave Campaign Price blank to use Normal Price.</p>
 <button type="button" onClick={async()=>{try{(await import("./package-batch-excel")).downloadBatch([]);}catch{setError("Template download failed. Please retry.");}}}>Download Blank Template</button>
 <label> Upload Excel <input type="file" accept=".xlsx" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError("");setRows([]);try{if(file.size>5*1024*1024)throw new Error("Please use a file smaller than 5 MB.");setRows((await import("./package-batch-excel")).readBatch(await file.arrayBuffer()));}catch(err){setError(err instanceof Error?err.message:"Unable to read workbook.");}finally{setBusy(false);e.target.value="";}}}/></label>
 {busy&&<p role="status">Reading workbook…</p>}{error&&<p role="alert">{error}</p>}
 {rows.length>0&&<p role="status">{rows.length} packages · {rows.reduce((n,r)=>n+r.items.length,0)} inventory rows · {rows.filter(r=>r.issues.length).length} packages need attention</p>}
 {rows.map((r,i)=><article key={i}><h4>{r.name||"Unnamed package"} · {r.code}</h4>{r.prices.map(v=><p key={v}>{v}</p>)}<p>{r.period}</p><p>{r.items.join(" · ")}</p>{r.issues.length>0&&<ul>{r.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}</article>)}
 </div>}</section>;
}
