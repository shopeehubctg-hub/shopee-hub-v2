"use client";
import {useRef,useState} from "react";

type LocalImage={file:File;url:string;width:number;height:number};
type Finding={level:"pass"|"warning"|"fail";title:string;detail:string};
type ImageResult={id:string;fileName:string;previewUrl?:string;detectedCategory:string;productType:string;grammar:Finding[];technical:Finding[];creative:Finding[]};
type ReviewResult={reviewId:string;status:"technical_failed"|"awaiting_review";images:ImageResult[];advice:string[];provider?:"gemini"|"groq"|"local";fallbackReason?:string|null;quotaWarning?:boolean;dailyUsage?:number;dailyLimit?:number};
const labels={pass:"PASS",warning:"注意",fail:"FAILED"} as const;
const categories=[
  {id:"package",label:"配套图",requirement:"1080 × 1080 · Max 2MB",rules:["画面数量必须与实际配套数量完全一致，并放大或 Label 清楚","必须有清楚的配套 Label","Free Gift 样品、数量和名称必须对应显示","可显示 Worth／Off／Discount，让顾客清楚优惠价值"]},
  {id:"product",label:"产品图（9张图）",requirement:"1080 × 1080 · Max 2MB",rules:["每张都必须能独立成为主图，并具备成交吸引力","盒装产品至少占画面 25% 或产品高度至少 270px","罐装／支装产品至少占画面 50% 或产品高度至少 540px","必须有 Watermark；每张只保留 2–3 个重点","整套需覆盖 USP、Pain Point、End Result、Ingredients，各 1–2 张","文字不可太小或太多，手机第一眼必须看到重点","整套风格一致并尽量有场景感","主图禁止出现产品或配套卖价"]},
  {id:"description",label:"Description 图",requirement:"1000 × 2000 · Max 2MB",rules:["作为 Landing Page 补充 9 张图未呈现的内容","内容必须有画面感","整套顺序必须为 Certification → How It Works → After Sales → FAQ／全部 Ingredients → Testi／Before & After","Non-Preferred Seller 最多 3 张；Preferred Seller 最多 12 张"]},
  {id:"banner",label:"Shop Banner",requirement:"Max 1200 × 2200 · Max 2MB",rules:["宽度最多 1200px，高度最多 2200px","建议尺寸：直式 1080 × 1350；横式 1200 × 675","可使用连贯 Landing Page 形式","内容可涵盖公司背景、代言人、产品陈列、使用步骤、认证奖项、服务、优惠、会员活动和强力推荐"]},
  {id:"cover",label:"Cover Photo",requirement:"1200 × 518 · Max 1MB",rules:["设计以简单为主","建议包含 Slogan、产品、场景、Logo 或代言人","禁止出现 Email、地址、电话号码和其他平台"]},
] as const;

async function inspectFile(file:File):Promise<LocalImage>{
  const url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
  return {file,url,width:image.naturalWidth,height:image.naturalHeight};
}
function localTechnical(item:LocalImage,category:string):Finding[]{
  const selected=categories.find(option=>option.id===category);
  const max=category==="cover"?1048576:2097152;
  const dimensions=category==="cover"?item.width===1200&&item.height===518:category==="description"?item.width===1000&&item.height===2000:category==="banner"?item.width<=1200&&item.height<=2200:item.width===1080&&item.height===1080;
  const findings:Finding[]=[
    item.file.size<=max?{level:"pass",title:"文件容量",detail:(item.file.size/1048576).toFixed(2)+" MB，符合上限。"}:{level:"fail",title:"文件容量超标",detail:(item.file.size/1048576).toFixed(2)+" MB；"+selected?.label+"要求不超过 "+max/1048576+" MB。"},
    dimensions?{level:"pass",title:"画布尺寸",detail:item.width+" × "+item.height+"px，符合标准。"}:{level:"fail",title:"画布尺寸不符合",detail:"目前为 "+item.width+" × "+item.height+"px；要求为 "+selected?.requirement+"。"},
  ];
  if(category==="product"||category==="package")findings.push({level:"warning",title:"Watermark 对照",detail:"此类别需要 Watermark；等待配置品牌标准参考文件后核对正确版本。"});
  return findings;
}

export function DesignChecker({storeId}:{storeId:string}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<LocalImage|null>(null);
  const [dragging,setDragging]=useState(false);
  const [category,setCategory]=useState("");
  const [stage,setStage]=useState<"idle"|"uploading"|"analysing"|"done">("idle");
  const [result,setResult]=useState<ReviewResult|null>(null);
  const [error,setError]=useState("");
  async function addFile(incoming:FileList|File[]){
    setError("");setResult(null);setStage("idle");
    const accepted=Array.from(incoming).filter(item=>/^image\/(png|jpeg|webp)$/i.test(item.type));
    if(!accepted.length){setError("请上传 PNG、JPG 或 WEBP 图片。");return}
    if(accepted.length>1){setError("一次只审核 1 张图，请重新选择单张图片。");return}
    if(file)URL.revokeObjectURL(file.url);
    setFile(await inspectFile(accepted[0]));
  }
  function removeFile(){if(file)URL.revokeObjectURL(file.url);setFile(null);setResult(null);setStage("idle")}
  async function runCheck(){
    if(!category){setError("请先选择图片用途。");return}
    if(!file)return;setError("");setResult(null);setStage("uploading");
    const local:ImageResult={id:"local",fileName:file.file.name,previewUrl:file.url,detectedCategory:categories.find(option=>option.id===category)?.label||category,productType:"等待 AI 识别",grammar:[{level:"warning",title:"等待 AI 检查",detail:"技术检查通过后自动检查文字。"}],technical:localTechnical(file,category),creative:[{level:"warning",title:"等待 AI 检查",detail:"技术检查通过后自动分析画面。"}]};
    if(local.technical.some(finding=>finding.level==="fail")){
      setResult({reviewId:"local",status:"technical_failed",images:[local],advice:["先修正所有 FAILED 的尺寸或文件容量问题，再重新提交。"],provider:"local"});setStage("done");return;
    }
    const timer=setTimeout(()=>setStage(current=>current==="uploading"?"analysing":current),450);
    try{
      const form=new FormData();form.set("storeId",storeId||"all");form.set("category",category);
      form.set("metadata",JSON.stringify([{name:file.file.name,width:file.width,height:file.height,size:file.file.size,type:file.file.type}]));form.append("images",file.file);
      const response=await fetch("/api/design-reviews",{method:"POST",body:form});
      const text=await response.text();let payload:ReviewResult&{error?:string};
      try{payload=JSON.parse(text)}catch{throw new Error(response.status===413||/Payload Too Large/i.test(text)?"图片仍超过服务器传输上限，请先压缩至 Requirement 内。":"服务器返回了无法读取的结果，请重新尝试。")}
      if(!response.ok)throw new Error(payload.error||"检查暂时无法完成");
      payload.images[0].previewUrl=file.url;setResult(payload);setStage("done");
    }catch(caught){setStage("idle");setError(caught instanceof Error?caught.message:"检查暂时无法完成")}finally{clearTimeout(timer)}
  }
  const technicalFailed=result?.status==="technical_failed";
  const technicalFailures=result?.images.flatMap(image=>image.technical.filter(finding=>finding.level==="fail"))??[];
  const primaryTechnicalFailure=technicalFailures[0];
  const providerLabel=result?.provider==="groq"?"Groq · Qwen 3.6 27B":result?.provider==="gemini"?"Gemini 3.6 Flash":"Dashboard Technical Check";
  return <div className="design-checker">
    <section className="design-hero"><div><p className="kicker">DESIGN REQUIREMENT</p><h2>上传 1 张设计图，自动完成技术与 AI 审核</h2><p>先执行 Dashboard Technical Check；通过后才发送对应类别 Requirement 给 AI。</p></div><div className="design-flow"><span><b>01</b>Technical</span><i/><span><b>02</b>Gemini</span><i/><span><b>03</b>Result</span></div></section>
    <section className="ai-routing-card card"><div><span>PRIMARY</span><strong>Gemini 3.6 Flash</strong><small>当前账号可用的首选审核模型</small></div><i>→</i><div><span>FALLBACK</span><strong>Groq · Qwen 3.6 27B</strong><small>429 / Timeout / Model unavailable / Invalid JSON 自动切换</small></div><ul><li>max_output_tokens: 1600</li><li>一次 1 张图</li><li>最多 fallback 1 次</li><li>仅发送所选 Requirement</li></ul></section>
    {!result&&<section className="upload-card card">
      <div className="category-step"><div><span>STEP 1</span><h3>这张是什么图？</h3><p>系统只会把所选类别的 Requirement 发送给审核模型。</p></div><div className="category-picker">{categories.map(item=><button type="button" key={item.id} className={category===item.id?"selected":""} onClick={()=>setCategory(item.id)}><b>{item.label}</b><small>{item.requirement}</small></button>)}</div>{category&&<div className="category-requirements"><strong>{categories.find(item=>item.id===category)?.label} 检查标准</strong><ul>{categories.find(item=>item.id===category)?.rules.map(rule=><li key={rule}>{rule}</li>)}</ul></div>}</div>
      <div className="upload-step-title"><span>STEP 2</span><h3>上传 1 张图片</h3></div>
      <button className={"drop-zone "+(dragging?"dragging":"")} type="button" onClick={()=>inputRef.current?.click()} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);addFile(event.dataTransfer.files)}}><span className="upload-symbol">↑</span><strong>把 1 张设计图拖到这里</strong><small>或点击选择 · PNG、JPG、WEBP</small></button>
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>event.target.files&&addFile(event.target.files)}/>
      {file&&<><div className="upload-preview-grid single"><article><img src={file.url} alt={file.file.name}/><button type="button" onClick={removeFile} aria-label={"移除 "+file.file.name}>×</button><div><b>{file.file.name}</b><small>{file.width} × {file.height} · {(file.file.size/1048576).toFixed(2)} MB</small></div></article></div><div className="upload-actions"><span>1 张图片已准备</span><button type="button" onClick={runCheck} disabled={stage!=="idle"}>{stage==="uploading"?"Technical Check…":stage==="analysing"?"AI 审核中…":"开始审核"}</button></div></>}
      {stage!=="idle"&&<div className="analysis-progress"><i/><span>{stage==="uploading"?"正在执行 Dashboard Technical Check":"Gemini 审核中；异常时会自动切换 Groq"}</span></div>}{error&&<p className="design-error">{error}</p>}
    </section>}
    {result&&<section className="design-results">
      {result.quotaWarning&&<div className="quota-warning"><b>DAILY QUOTA WARNING</b><span>今日 AI 审核额度已使用 {result.dailyUsage} / {result.dailyLimit}（达到 80%）。</span></div>}
      <div className={"review-decision "+(technicalFailed?"failed":"waiting")}><div><span>{technicalFailed?"TECHNICAL COMPLIANCE FAILED":"AI REVIEW COMPLETE"}</span><h3>{technicalFailed?(primaryTechnicalFailure?.title||"技术规格不符合"):"审核结果已返回"}</h3>{technicalFailed?<><p>{primaryTechnicalFailure?.detail||"图片没有达到所选类别的技术规格。"}</p><p className="failure-action">请根据以上建议修改后再上传。图片尚未发送给 AI，不会消耗审核额度。</p>{technicalFailures.length>1&&<ul className="technical-failure-list">{technicalFailures.slice(1).map((finding,index)=><li key={index}><b>{finding.title}：</b>{finding.detail}</li>)}</ul>}</>:<p>结果仍由 Shopee Hub 作最终确认。</p>}</div><strong>{technicalFailed?"修改后再上传":providerLabel}</strong></div>
      {result.fallbackReason&&<div className="fallback-note"><b>已自动切换 Groq</b><span>Gemini 出现 {result.fallbackReason}；本次仅执行 1 次 fallback。</span></div>}
      <div className="result-toolbar"><div><p className="kicker">CHECK RESULT</p><h3>1 张图片</h3></div><button type="button" onClick={()=>{setResult(null);setStage("idle")}}>重新上传</button></div>
      <div className="result-list">{result.images.map((image,index)=><article className="result-card card" key={image.id}><div className="result-image"><img src={image.previewUrl} alt={image.fileName}/><span>{index+1}</span></div><div className="result-body"><header><div><h4>{image.fileName}</h4><p>AI 识别：{image.detectedCategory} · {image.productType}</p></div><span className={image.technical.some(item=>item.level==="fail")?"failed":"checked"}>{image.technical.some(item=>item.level==="fail")?"FAILED":"CHECKED"}</span></header><div className="finding-columns">{[["Grammar",image.grammar],["Technical Compliance",image.technical],["吸引力 · 场景感",image.creative]].map(([title,items])=><section key={String(title)}><h5>{String(title)}</h5>{(items as Finding[]).map((item,itemIndex)=><div className={"finding "+item.level} key={itemIndex}><b>{labels[item.level]} · {item.title}</b><p>{item.detail}</p></div>)}</section>)}</div></div></article>)}</div>
      <aside className="ai-advice"><div className="ai-mark">AI</div><div><p className="kicker">AI 分析建议</p><h3>建议这样修改</h3><ol>{result.advice.map((item,index)=><li key={index}>{item}</li>)}</ol><small>AI 建议用于加快修改；最终采用与否由 Shopee Hub 审核确认。</small></div></aside>
    </section>}
  </div>;
}
