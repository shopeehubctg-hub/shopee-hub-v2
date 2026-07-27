import {env} from "cloudflare:workers";
import {and,eq,gte,sql} from "drizzle-orm";
import {getDb} from "../../../db";
import {customerUsers,designReviewImages,designReviews} from "../../../db/schema";
import {getChatGPTUser} from "../../chatgpt-auth";
export const dynamic="force-dynamic";

type Meta={name:string;width:number;height:number;size:number;type:string};
type Finding={level:"pass"|"warning"|"fail";title:string;detail:string};
type AiResult={productType:string;grammar:Finding[];creative:Finding[];advice:string[]};
type FailureReason="rate_limit"|"timeout"|"invalid_json"|"model_unavailable"|"server_error"|"http"|"config";

const categoryNames={package:"配套图",product:"产品图（9张图）",description:"Description 图",banner:"Shop Banner",cover:"Cover Photo"} as const;
const categoryRules={
  package:["1080 × 1080，Max 2MB","数量必须与配套一致并清楚 Label","Free Gift 样品、数量和名称必须对应","可显示 Worth／Off／Discount"],
  product:["1080 × 1080，Max 2MB","盒装至少占 25% 或高度 270px；罐装／支装至少占 50% 或高度 540px","必须有 Watermark，只保留 2–3 个重点","检查 USP、Pain Point、End Result、Ingredients、手机可读性、风格与场景感","禁止卖价"],
  description:["1000 × 2000，Max 2MB","Landing Page 且有画面感","顺序为 Certification、How It Works、After Sales、FAQ／Ingredients、Testi／Before & After","Non-Preferred 最多 3 张；Preferred 最多 12 张"],
  banner:["宽度 Max 1200、高度 Max 2200、Max 2MB","建议直式 1080 × 1350 或横式 1200 × 675","可做连续 Landing Page","内容可含公司背景、代言人、产品陈列、步骤、认证、服务、优惠、会员和推荐"],
  cover:["1200 × 518，Max 1MB","设计简单","建议 Slogan、产品、场景、Logo 或代言人","禁止 Email、地址、电话号码和其他平台"]
} as const;
type Category=keyof typeof categoryNames;

class ProviderFailure extends Error{constructor(public reason:FailureReason,message:string){super(message)}}

function technical(meta:Meta,category:string):Finding[]{
  const max=category==="cover"?1048576:2097152;
  const size:Finding=meta.size<=max?{level:"pass",title:"文件容量",detail:(meta.size/1048576).toFixed(2)+" MB，符合上限。"}:{level:"fail",title:"文件容量超标",detail:(meta.size/1048576).toFixed(2)+" MB，要求不超过 "+max/1048576+" MB。"};
  const valid=category==="cover"?meta.width===1200&&meta.height===518:category==="description"?meta.width===1000&&meta.height===2000:category==="banner"?meta.width<=1200&&meta.height<=2200:meta.width===1080&&meta.height===1080;
  const findings:Finding[]=[size,valid?{level:"pass",title:"画布尺寸",detail:meta.width+" × "+meta.height+"px，符合 "+categoryNames[category as Category]+" 标准。"}:{level:"fail",title:"画布尺寸不符合",detail:"目前为 "+meta.width+" × "+meta.height+"px，请按 "+categoryNames[category as Category]+" Requirement 调整。"}];
  if(category==="product"||category==="package")findings.push({level:"warning",title:"Watermark 对照",detail:"此类别需要 Watermark；尚未配置品牌标准参考文件。"});
  return findings;
}

function runtimeValue(key:string){
  const workerEnv=env as unknown as Record<string,unknown>;
  const value=workerEnv[key]??process.env[key];
  return typeof value==="string"?value:"";
}
function maxOutputTokens(){const value=Number(runtimeValue("AI_MAX_OUTPUT_TOKENS")||1600);return Math.min(1800,Math.max(1200,Number.isFinite(value)?value:1600))}
function timeoutMs(){const value=Number(runtimeValue("AI_PROVIDER_TIMEOUT_MS")||25000);return Math.min(45000,Math.max(5000,Number.isFinite(value)?value:25000))}
async function imageBase64(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer());let binary="";
  for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
  return btoa(binary);
}
function prompt(category:Category,meta:Meta){
  return [
    "你是 Shopee Hub Design Reviewer。只审核这一张图。",
    "类别："+categoryNames[category],
    "只使用以下 Requirement，不要加入其他类别或无关 Requirement："+categoryRules[category].join("；"),
    "图片资料："+meta.width+"×"+meta.height+"px，"+(meta.size/1048576).toFixed(2)+"MB。",
    "OCR 文字并检查英文 spelling、grammar、大小写、标点、网址、Email、电话、地址、其他平台、Return & Refund、非英文文字及卖价；再检查产品类型、第一眼卖点、产品突出度、手机可读性、重点数量与场景感。",
    "Grammar 与 Creative 的 level 只能是 pass 或 warning。用简洁中文，只输出 JSON。",
    'JSON：{"productType":"string","grammar":[{"level":"pass|warning","title":"string","detail":"string"}],"creative":[{"level":"pass|warning","title":"string","detail":"string"}],"advice":["string"]}'
  ].join("\n");
}
const responseSchema={
  type:"object",required:["productType","grammar","creative","advice"],
  properties:{
    productType:{type:"string"},
    grammar:{type:"array",items:{type:"object",required:["level","title","detail"],properties:{level:{type:"string",enum:["pass","warning"]},title:{type:"string"},detail:{type:"string"}}}},
    creative:{type:"array",items:{type:"object",required:["level","title","detail"],properties:{level:{type:"string",enum:["pass","warning"]},title:{type:"string"},detail:{type:"string"}}}},
    advice:{type:"array",items:{type:"string"}}
  }
};
function cleanFinding(value:unknown):Finding|null{
  if(!value||typeof value!=="object")return null;const item=value as Record<string,unknown>;
  if(item.level!=="pass"&&item.level!=="warning")return null;
  if(typeof item.title!=="string"||typeof item.detail!=="string")return null;
  return {level:item.level,title:item.title.slice(0,80),detail:item.detail.slice(0,500)};
}
function parseAiJson(text:string):AiResult{
  try{
    const first=text.indexOf("{"),last=text.lastIndexOf("}");if(first<0||last<first)throw new Error();
    const value=JSON.parse(text.slice(first,last+1)) as Record<string,unknown>;
    const grammar=Array.isArray(value.grammar)?value.grammar.map(cleanFinding).filter((item):item is Finding=>Boolean(item)).slice(0,8):[];
    const creative=Array.isArray(value.creative)?value.creative.map(cleanFinding).filter((item):item is Finding=>Boolean(item)).slice(0,8):[];
    const advice=Array.isArray(value.advice)?value.advice.filter((item):item is string=>typeof item==="string").map(item=>item.slice(0,500)).slice(0,6):[];
    if(typeof value.productType!=="string"||!grammar.length||!creative.length||!advice.length)throw new Error();
    return {productType:value.productType.slice(0,120),grammar,creative,advice};
  }catch{throw new ProviderFailure("invalid_json","Invalid JSON")}
}
async function fetchProvider(url:string,init:RequestInit){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs());
  try{return await fetch(url,{...init,signal:controller.signal})}
  catch(error){if(error instanceof Error&&error.name==="AbortError")throw new ProviderFailure("timeout","Timeout");throw new ProviderFailure("http","Provider request failed")}
  finally{clearTimeout(timer)}
}
async function providerErrorMessage(response:Response){
  try{const payload=await response.json() as {error?:{message?:string}};return payload.error?.message||""}catch{return ""}
}
function groqFailure(status:number,detail:string){
  const normalized=detail.toLowerCase();
  if(status===400&&normalized.includes("at least 2 pixels"))return new ProviderFailure("http","图片像素太小，宽和高都必须至少 2px。请重新导出图片后再上传");
  if(status===400&&(normalized.includes("image")||normalized.includes("decode")))return new ProviderFailure("http","Groq 无法读取这张图片。请重新导出为标准 RGB PNG 或 JPG 后再上传");
  if(status===400)return new ProviderFailure("http","Groq 拒绝了图片请求（400）。请重新导出为标准 RGB PNG 或 JPG 后再上传；若仍失败，请稍后重试");
  if(status===401||status===403)return new ProviderFailure("config","Groq API Key 无效或没有 Qwen 3.6 27B 权限，请管理员检查 API Key");
  if(status===429)return new ProviderFailure("rate_limit","Groq 今日额度或请求频率已达上限，请稍后再试");
  if(status===503||normalized.includes("over capacity"))return new ProviderFailure("server_error","Groq 目前服务繁忙（503）。请稍后再按「开始审核」重试");
  if(status>=500)return new ProviderFailure("server_error","Groq 服务暂时异常（"+status+"）。请稍后再按「开始审核」重试");
  return new ProviderFailure("http","Groq 请求失败（"+status+"）。请稍后重试");
}
async function callGemini(file:File,meta:Meta,category:Category):Promise<AiResult>{
  const key=runtimeValue("GEMINI_API_KEY");if(!key)throw new ProviderFailure("config","Gemini API key is not configured");
  const data=await imageBase64(file);
  const model=runtimeValue("GEMINI_MODEL")||"gemini-3.6-flash";
  const response=await fetchProvider("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt(category,meta)},{inlineData:{mimeType:file.type,data}}]}],generationConfig:{thinkingConfig:{thinkingLevel:"minimal"},maxOutputTokens:maxOutputTokens(),responseMimeType:"application/json",responseJsonSchema:responseSchema}})});
  if(response.status===429)throw new ProviderFailure("rate_limit","429 Rate Limit");
  if(response.status===404)throw new ProviderFailure("model_unavailable","Model unavailable");
  if(response.status>=500)throw new ProviderFailure("server_error","Gemini server error ("+response.status+")");
  if(!response.ok)throw new ProviderFailure("http","Gemini request failed ("+response.status+")");
  const payload=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
  return parseAiJson(payload.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"");
}
async function callGroq(file:File,meta:Meta,category:Category):Promise<AiResult>{
  const key=runtimeValue("GROQ_API_KEY");if(!key)throw new ProviderFailure("config","Groq API key is not configured");
  const data=await imageBase64(file);
  let response:Response;
  try{response=await fetchProvider("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"qwen/qwen3.6-27b",messages:[{role:"user",content:[{type:"text",text:prompt(category,meta)},{type:"image_url",image_url:{url:"data:"+file.type+";base64,"+data}}]}],response_format:{type:"json_object"},reasoning_effort:"none",max_completion_tokens:maxOutputTokens()})})}
  catch(error){if(error instanceof ProviderFailure&&error.reason==="timeout")throw new ProviderFailure("timeout","Groq 响应超时。请稍后再按「开始审核」重试");throw error}
  if(!response.ok)throw groqFailure(response.status,await providerErrorMessage(response));
  const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>};
  return parseAiJson(payload.choices?.[0]?.message?.content||"");
}
function fallbackLabel(reason:FailureReason){return reason==="rate_limit"?"429 Rate Limit":reason==="timeout"?"Timeout":reason==="model_unavailable"?"Model unavailable":reason==="server_error"?"Gemini server error":"Invalid JSON"}
async function analyse(file:File,meta:Meta,category:Category){
  try{return {result:await callGemini(file,meta,category),provider:"gemini" as const,fallbackReason:null}}
  catch(error){
    if(!(error instanceof ProviderFailure))throw error;
    if(!(["rate_limit","timeout","invalid_json","model_unavailable","server_error"] as FailureReason[]).includes(error.reason))throw error;
    return {result:await callGroq(file,meta,category),provider:"groq" as const,fallbackReason:fallbackLabel(error.reason)};
  }
}
function klDayStart(){const date=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);return new Date(date+"T00:00:00+08:00").toISOString()}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"请先登录后再上传图片。"},{status:401});
  const db=getDb();const [member]=await db.select({tenantId:customerUsers.tenantId}).from(customerUsers).where(eq(customerUsers.email,user.email.toLowerCase())).limit(1);
  if(!member)return Response.json({error:"此帐号还没有获分配顾客项目。"},{status:403});
  const form=await request.formData();const files=form.getAll("images").filter(value=>value instanceof File) as File[];
  const category=String(form.get("category")||"") as Category;
  if(!(category in categoryNames))return Response.json({error:"请先选择图片用途。"},{status:400});
  if(files.length!==1)return Response.json({error:"一次只审核 1 张图片。"},{status:400});
  if(files[0].size>8388608||!/^image\/(png|jpeg|webp)$/i.test(files[0].type))return Response.json({error:"只接受不超过 8MB 的 PNG、JPG 或 WEBP 图片。"},{status:400});
  let metas:Meta[];try{metas=JSON.parse(String(form.get("metadata")??"[]"))}catch{return Response.json({error:"图片资料无法读取，请重新上传。"},{status:400})}
  if(metas.length!==1)return Response.json({error:"图片资料不完整，请重新上传。"},{status:400});
  const file=files[0],meta=metas[0],technicalFindings=technical(meta,category),hasTechnicalFailure=technicalFindings.some(finding=>finding.level==="fail");
  let ai:AiResult|null=null,provider:"gemini"|"groq"|"local"="local",fallbackReason:string|null=null,dailyUsage=0;
  const dailyLimit=Math.max(1,Number(runtimeValue("AI_DAILY_REVIEW_QUOTA")||1000)||1000);
  if(!hasTechnicalFailure){
    const [usage]=await db.select({count:sql<number>`count(*)`}).from(designReviews).where(and(eq(designReviews.tenantId,member.tenantId),gte(designReviews.createdAt,klDayStart())));
    dailyUsage=Number(usage?.count||0)+1;
    try{const outcome=await analyse(file,meta,category);ai=outcome.result;provider=outcome.provider;fallbackReason=outcome.fallbackReason}
    catch(error){
      const message=error instanceof ProviderFailure?error.message:"AI review failed";
      const status=error instanceof ProviderFailure&&error.reason==="config"?503:502;
      return Response.json({error:"AI 审核暂时无法完成："+message+"。"},{status});
    }
  }
  const reviewId=crypto.randomUUID(),imageId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const image={id:imageId,fileName:file.name,detectedCategory:categoryNames[category],productType:ai?.productType||"等待技术问题修正",grammar:ai?.grammar||[{level:"warning" as const,title:"尚未发送 AI",detail:"技术规格失败，系统没有消耗 AI 审核额度。"}],technical:technicalFindings,creative:ai?.creative||[{level:"warning" as const,title:"尚未发送 AI",detail:"请先修正 Technical Compliance Failed。"}]};
  const status=hasTechnicalFailure?"technical_failed" as const:"awaiting_review" as const;
  const advice=ai?.advice||["先修正所有 FAILED 的尺寸或容量问题，再重新提交审核。"];
  const bucket=(env as unknown as {DESIGN_UPLOADS?:R2Bucket}).DESIGN_UPLOADS;if(!bucket)return Response.json({error:"图片存储尚未连接，请稍后再试。"},{status:503});
  const objectKey=member.tenantId+"/"+reviewId+"/"+image.id+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  await bucket.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type}});
  await db.insert(designReviews).values({id:reviewId,tenantId:member.tenantId,storeId:String(form.get("storeId")||"all"),submittedBy:user.email,status,summary:{advice,imageCount:1,category,provider,fallbackReason},createdAt});
  await db.insert(designReviewImages).values({id:image.id,reviewId,fileName:file.name,objectKey,contentType:file.type,width:meta.width,height:meta.height,byteSize:file.size,detectedCategory:image.detectedCategory,result:image,createdAt});
  return Response.json({reviewId,status,images:[image],advice,provider,fallbackReason,quotaWarning:dailyUsage>0&&dailyUsage>=Math.ceil(dailyLimit*.8),dailyUsage,dailyLimit},{headers:{"Cache-Control":"private, no-store"}});
}
