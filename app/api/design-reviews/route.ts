import {env} from "cloudflare:workers";
import {eq} from "drizzle-orm";
import {getDb} from "../../../db";
import {customerUsers,designReviewImages,designReviews} from "../../../db/schema";
import {getChatGPTUser} from "../../chatgpt-auth";
export const dynamic="force-dynamic";
type Meta={name:string;width:number;height:number;size:number;type:string};
type Finding={level:"pass"|"warning"|"fail";title:string;detail:string};

const categoryNames={package:"配套图",product:"产品图",description:"Description 图",banner:"Shop Banner",cover:"Cover Photo"} as const;
type Category=keyof typeof categoryNames;
function technical(meta:Meta,category:string):Finding[]{
  const max=category==="cover"?1048576:2097152;
  const size:Finding=meta.size<=max?{level:"pass",title:"文件容量",detail:(meta.size/1048576).toFixed(2)+" MB，符合上限。"}:{level:"fail",title:"文件容量超标",detail:(meta.size/1048576).toFixed(2)+" MB，要求不超过 "+max/1048576+" MB。"};
  const valid=category==="cover"?meta.width===1200&&meta.height===518:category==="description"?meta.width===1000&&meta.height===2000:category==="banner"?meta.width<=1200&&meta.height<=2200:meta.width===1080&&meta.height===1080;
  return [size,valid?{level:"pass",title:"画布尺寸",detail:meta.width+" × "+meta.height+"px，符合 "+categoryNames[category as Category]+" 标准。"}:{level:"fail",title:"画布尺寸不符合",detail:"目前为 "+meta.width+" × "+meta.height+"px，请按 "+categoryNames[category as Category]+" Requirement 调整。"},{level:"warning",title:"Logo／Watermark 对照",detail:"尚未配置这个品牌的标准参考文件，需由 Shopee Hub 确认。"}];
}
async function analyse(files:File[],metas:Meta[],category:Category){
  const key=process.env.OPENAI_API_KEY;if(!key)return null;
  const content:Array<Record<string,unknown>>=[{type:"input_text",text:"The user explicitly selected "+categoryNames[category]+". Review these Shopee images according to that category. Return JSON: {images:[{productType,detectedCategory,grammar:[{level,title,detail}],creative:[{level,title,detail}]}],advice:[string]}. Same image order. Grammar and creative levels may only be pass or warning. OCR English spelling and grammar, prohibited URL/email/phone/address/other platform/Return & Refund/non-English text and selling price; assess product type, product prominence, mobile readability, 2-3 key messages, USP, pain point, end result, ingredients, scene feeling and consistency. Give 3-6 concise actionable Chinese advice. Metadata: "+JSON.stringify(metas)}];
  for(const file of files){const bytes=new Uint8Array(await file.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));content.push({type:"input_image",image_url:"data:"+file.type+";base64,"+btoa(binary),detail:"high"})}
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5-mini",store:false,input:[{role:"user",content}],text:{format:{type:"json_object"}}})});
  if(!response.ok)return null;const data=await response.json() as {output_text?:string;output?:Array<{content?:Array<{text?:string}>}>};const text=data.output_text??data.output?.flatMap(i=>i.content??[]).map(i=>i.text??"").join("");
  try{return text?JSON.parse(text):null}catch{return null}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"请先登录后再上传图片。"},{status:401});
  const db=getDb();const [member]=await db.select({tenantId:customerUsers.tenantId}).from(customerUsers).where(eq(customerUsers.email,user.email.toLowerCase())).limit(1);
  if(!member)return Response.json({error:"此帐号还没有获分配顾客项目。"},{status:403});
  const form=await request.formData();const files=form.getAll("images").filter(v=>v instanceof File) as File[];
  const category=String(form.get("category")||"") as Category;
  if(!(category in categoryNames))return Response.json({error:"请先选择图片用途。"},{status:400});
  if(!files.length||files.length>20)return Response.json({error:"每次请上传 1 至 20 张图片。"},{status:400});
  if(files.some(f=>f.size>8388608||!/^image\/(png|jpeg|webp)$/i.test(f.type)))return Response.json({error:"只接受不超过 8MB 的 PNG、JPG 或 WEBP 图片。"},{status:400});
  let metas:Meta[];try{metas=JSON.parse(String(form.get("metadata")??"[]"))}catch{return Response.json({error:"图片资料无法读取，请重新上传。"},{status:400})}
  if(metas.length!==files.length)return Response.json({error:"图片资料不完整，请重新上传。"},{status:400});
  const ai=await analyse(files,metas,category) as null|{images?:Array<{productType?:string;detectedCategory?:string;grammar?:Finding[];creative?:Finding[]}>;advice?:string[]};
  const reviewId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const images=files.map((file,index)=>{const t=technical(metas[index],category),a=ai?.images?.[index];return{id:crypto.randomUUID(),fileName:file.name,detectedCategory:categoryNames[category],productType:a?.productType||"自动识别待 Shopee Hub 确认",grammar:a?.grammar?.length?a.grammar:[{level:"warning" as const,title:"AI 文字检查待连接",detail:"技术检查已完成；AI 文字服务连接后会自动显示完整结果。"}],technical:t,creative:a?.creative?.length?a.creative:[{level:"warning" as const,title:"等待 Shopee Hub 检查",detail:"画面吸引力、场景感和卖点清晰度需要最终人工确认。"}]}})
  const status=images.some(image=>image.technical.some(f=>f.level==="fail"))?"technical_failed" as const:"awaiting_review" as const;
  const advice=ai?.advice?.length?ai.advice:status==="technical_failed"?["先修正所有 FAILED 的尺寸或容量问题，再提交 Shopee Hub。","配置品牌标准 Logo 与 Watermark 后，可自动核对正确版本。","技术标准通过后，再优化手机阅读效果和场景感。"]:["当前没有硬性技术失败，已可提交 Shopee Hub 最终检查。","建议配置品牌标准 Logo 与 Watermark，提高一致性判断准确度。","最终确认时重点查看手机尺寸下的卖点清晰度。"];
  const bucket=(env as unknown as {DESIGN_UPLOADS?:R2Bucket}).DESIGN_UPLOADS;if(!bucket)return Response.json({error:"图片存储尚未连接，请稍后再试。"},{status:503});
  const keys=files.map((file,index)=>member.tenantId+"/"+reviewId+"/"+images[index].id+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_"));
  await Promise.all(files.map((file,index)=>bucket.put(keys[index],file.stream(),{httpMetadata:{contentType:file.type}})));
  await db.insert(designReviews).values({id:reviewId,tenantId:member.tenantId,storeId:String(form.get("storeId")||"all"),submittedBy:user.email,status,summary:{advice,imageCount:images.length,category},createdAt});
  await db.batch(images.map((image,index)=>db.insert(designReviewImages).values({id:image.id,reviewId,fileName:files[index].name,objectKey:keys[index],contentType:files[index].type,width:metas[index].width,height:metas[index].height,byteSize:files[index].size,detectedCategory:image.detectedCategory,result:image,createdAt})));
  return Response.json({reviewId,status,images,advice},{headers:{"Cache-Control":"private, no-store"}});
}
