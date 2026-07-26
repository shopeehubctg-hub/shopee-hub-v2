"use client";
import { useRef, useState } from "react";

type LocalImage={file:File;url:string;width:number;height:number};
type Finding={level:"pass"|"warning"|"fail";title:string;detail:string};
type ImageResult={id:string;fileName:string;previewUrl?:string;detectedCategory:string;productType:string;grammar:Finding[];technical:Finding[];creative:Finding[]};
type ReviewResult={reviewId:string;status:"technical_failed"|"awaiting_review";images:ImageResult[];advice:string[]};
const labels={pass:"PASS",warning:"注意",fail:"FAILED"} as const;

async function inspectFile(file:File):Promise<LocalImage>{
  const url=URL.createObjectURL(file); const image=new Image(); image.src=url; await image.decode();
  return {file,url,width:image.naturalWidth,height:image.naturalHeight};
}

export function DesignChecker({storeId}:{storeId:string}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [files,setFiles]=useState<LocalImage[]>([]);
  const [dragging,setDragging]=useState(false);
  const [stage,setStage]=useState<"idle"|"uploading"|"analysing"|"done">("idle");
  const [result,setResult]=useState<ReviewResult|null>(null);
  const [error,setError]=useState("");
  async function addFiles(incoming:FileList|File[]){
    setError(""); setResult(null); setStage("idle");
    const accepted=Array.from(incoming).filter(file=>/^image\/(png|jpeg|webp)$/i.test(file.type));
    if(!accepted.length){setError("请上传 PNG、JPG 或 WEBP 图片。");return}
    if(files.length+accepted.length>20){setError("每次最多上传 20 张图片。");return}
    const inspected=await Promise.all(accepted.map(inspectFile));
    setFiles(previous=>[...previous,...inspected]);
  }
  function removeFile(index:number){
    setFiles(current=>{URL.revokeObjectURL(current[index].url);return current.filter((_,i)=>i!==index)});
    setResult(null);setStage("idle");
  }
  async function runCheck(){
    if(!files.length)return; setError("");setResult(null);setStage("uploading");
    const form=new FormData(); form.set("storeId",storeId||"all");
    form.set("metadata",JSON.stringify(files.map(item=>({name:item.file.name,width:item.width,height:item.height,size:item.file.size,type:item.file.type}))));
    files.forEach(item=>form.append("images",item.file));
    const timer=setTimeout(()=>setStage(current=>current==="uploading"?"analysing":current),650);
    try{
      const response=await fetch("/api/design-reviews",{method:"POST",body:form}); const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"检查暂时无法完成");
      payload.images=payload.images.map((image:ImageResult,index:number)=>({...image,previewUrl:files[index]?.url}));
      setResult(payload);setStage("done");
    }catch(caught){setStage("idle");setError(caught instanceof Error?caught.message:"检查暂时无法完成")}finally{clearTimeout(timer)}
  }
  const technicalFailed=result?.status==="technical_failed";
  return <div className="design-checker">
    <section className="design-hero"><div><p className="kicker">DESIGN CHECKER</p><h2>上传图片，自动完成三轮检查</h2><p>无需填写产品类型。系统会同时检查英文、技术规范及画面吸引力。</p></div><div className="design-flow"><span><b>01</b>Grammar</span><i/><span><b>02</b>Compliance</span><i/><span><b>03</b>Creative</span></div></section>
    {!result&&<section className="upload-card card">
      <button className={"drop-zone "+(dragging?"dragging":"")} type="button" onClick={()=>inputRef.current?.click()} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files)}}>
        <span className="upload-symbol">↑</span><strong>把设计图拖到这里</strong><small>或点击选择图片 · PNG、JPG、WEBP · 最多 20 张</small>
      </button>
      <input ref={inputRef} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event=>event.target.files&&addFiles(event.target.files)}/>
      {!!files.length&&<><div className="upload-preview-grid">{files.map((item,index)=><article key={item.file.name+"-"+index}><img src={item.url} alt={item.file.name}/><button type="button" onClick={()=>removeFile(index)} aria-label={"移除 "+item.file.name}>×</button><div><b>{item.file.name}</b><small>{item.width} × {item.height} · {(item.file.size/1048576).toFixed(2)} MB</small></div></article>)}</div><div className="upload-actions"><span>{files.length} 张图片已准备</span><button type="button" onClick={runCheck} disabled={stage!=="idle"}>{stage==="uploading"?"安全上传中…":stage==="analysing"?"AI 正在同时分析…":"开始检查"}</button></div></>}
      {stage!=="idle"&&<div className="analysis-progress"><i/><span>{stage==="uploading"?"正在安全上传图片":"三项检查正在同时进行"}</span></div>}{error&&<p className="design-error">{error}</p>}
    </section>}
    {result&&<section className="design-results">
      <div className={"review-decision "+(technicalFailed?"failed":"waiting")}><div><span>{technicalFailed?"TECHNICAL COMPLIANCE FAILED":"READY FOR HUMAN REVIEW"}</span><h3>{technicalFailed?"请先修改技术问题":"等待 Shopee Hub 检查"}</h3><p>{technicalFailed?"至少一张图片未达到硬性规格。":"没有 Technical Compliance Failed，图片已进入审核队列。"}</p></div><strong>{technicalFailed?"需要修改":"等待检查"}</strong></div>
      <div className="result-toolbar"><div><p className="kicker">CHECK RESULT</p><h3>{result.images.length} 张图片</h3></div><button type="button" onClick={()=>{setResult(null);setStage("idle")}}>重新上传</button></div>
      <div className="result-list">{result.images.map((image,index)=><article className="result-card card" key={image.id}><div className="result-image"><img src={image.previewUrl} alt={image.fileName}/><span>{index+1}</span></div><div className="result-body"><header><div><h4>{image.fileName}</h4><p>AI 识别：{image.detectedCategory} · {image.productType}</p></div><span className={image.technical.some(item=>item.level==="fail")?"failed":"checked"}>{image.technical.some(item=>item.level==="fail")?"FAILED":"CHECKED"}</span></header><div className="finding-columns">{[["Grammar",image.grammar],["Technical Compliance",image.technical],["吸引力 · 场景感",image.creative]].map(([title,items])=><section key={String(title)}><h5>{String(title)}</h5>{(items as Finding[]).map((item,itemIndex)=><div className={"finding "+item.level} key={itemIndex}><b>{labels[item.level]} · {item.title}</b><p>{item.detail}</p></div>)}</section>)}</div></div></article>)}</div>
      <aside className="ai-advice"><div className="ai-mark">AI</div><div><p className="kicker">AI 分析建议</p><h3>建议这样修改</h3><ol>{result.advice.map((item,index)=><li key={index}>{item}</li>)}</ol><small>AI 建议用于加快修改；最终采用与否由 Shopee Hub 审核确认。</small></div></aside>
    </section>}
  </div>
}
