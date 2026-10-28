import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, managementActionEvents, managementActions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { canAccessModule, canAccessStore } from "../../module-access";
import { malaysiaDate } from "../../ad-balance-validation.js";

export const dynamic="force-dynamic";
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const amountPattern=/^(0|[1-9]\d*)(\.\d{1,2})?$/;
type WriteBody={
  storeId?:string; actionId?:number; operation?:"approve"|"progress"|"result"|"verify_result";
  category?:string;title?:string;detail?:string;impact?:string;ownerEmail?:string;dueDate?:string;
  status?:"in_progress"|"completed";evidenceUrl?:string;resultSummary?:string;
  resultType?:"verified_saving"|"sales_change"|"unattributed"|"risk_reduction";
  resultAmount?:string;resultCurrency?:string;resultSource?:string;
};

async function authorizedWrite(storeId:string){
  const user=await getChatGPTUser();
  if(!user)return {error:Response.json({error:"Authentication required"},{status:401})} as const;
  const db=await getDb();
  const [membership]=await db.select().from(customerUsers).where(eq(customerUsers.email,user.email.toLowerCase())).limit(1);
  if(!membership?.active||!["manager","superadmin"].includes(membership.role))return {error:Response.json({error:"Manager access required"},{status:403})} as const;
  if(!await canAccessModule(db,membership,"actions")||!await canAccessStore(db,membership,storeId))return {error:Response.json({error:"Store access denied"},{status:403})} as const;
  return {db,membership,email:user.email.toLowerCase()} as const;
}
const invalid=(message:string)=>Response.json({error:message},{status:400});
function safeUrl(value:string){
  try{const url=new URL(value);return url.protocol==="https:"?url.toString():null}catch{return null}
}

export async function POST(request:Request){
  if(process.env.SHOPEE_VALUE_PROOF_ENABLED!=="1")return Response.json({error:"Value proof is not enabled"},{status:503});
  const body=await request.json().catch(()=>null) as WriteBody|null;
  if(!body?.storeId||!body.category?.trim()||!body.title?.trim()||!body.detail?.trim()||!body.impact?.trim()||!body.dueDate)return invalid("Store, category, title, detail, expected impact and due date are required.");
  if(!datePattern.test(body.dueDate)||Number.isNaN(Date.parse(body.dueDate)))return invalid("Enter a valid due date.");
  if([body.category,body.title,body.detail,body.impact].some(value=>(value?.length??0)>2000))return invalid("Action text is too long.");
  const auth=await authorizedWrite(body.storeId);if("error" in auth)return auth.error;
  const today=malaysiaDate();
  const row=await auth.db.transaction(async tx=>{
    const [action]=await tx.insert(managementActions).values({
      tenantId:auth.membership.tenantId,storeId:body.storeId!,actionDate:today,
      category:body.category!.trim(),title:body.title!.trim(),detail:body.detail!.trim(),impact:body.impact!.trim(),
      ownerEmail:body.ownerEmail?.trim().toLowerCase()||auth.email,dueDate:body.dueDate||null,createdBy:auth.email,
    }).returning();
    await tx.insert(managementActionEvents).values({actionId:action.id,tenantId:action.tenantId,storeId:action.storeId,eventType:"created",actorEmail:auth.email,detail:{title:action.title,dueDate:action.dueDate}});
    return action;
  });
  return Response.json({action:row},{status:201});
}

export async function PATCH(request:Request){
  if(process.env.SHOPEE_VALUE_PROOF_ENABLED!=="1")return Response.json({error:"Value proof is not enabled"},{status:503});
  const body=await request.json().catch(()=>null) as WriteBody|null;
  if(!body?.storeId||!Number.isSafeInteger(body.actionId)||!body.operation)return invalid("Store, action and operation are required.");
  const auth=await authorizedWrite(body.storeId);if("error" in auth)return auth.error;
  const [current]=await auth.db.select().from(managementActions).where(and(eq(managementActions.id,body.actionId!),eq(managementActions.tenantId,auth.membership.tenantId),eq(managementActions.storeId,body.storeId))).limit(1);
  if(!current)return Response.json({error:"Action not found"},{status:404});
  if(body.operation==="approve"){
    if(current.status!=="draft")return Response.json({error:"Only draft actions can be approved"},{status:409});
    if(current.createdBy===auth.email)return Response.json({error:"Another manager must approve this action"},{status:403});
    const row=await auth.db.transaction(async tx=>{
      const [action]=await tx.update(managementActions).set({status:"approved",approvedBy:auth.email,approvedAt:new Date().toISOString(),clientVisibleAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
        .where(and(eq(managementActions.id,current.id),eq(managementActions.status,"draft"),eq(managementActions.updatedAt,current.updatedAt))).returning();
      if(!action)return null;
      await tx.insert(managementActionEvents).values({actionId:action.id,tenantId:action.tenantId,storeId:action.storeId,eventType:"approved",actorEmail:auth.email,detail:{status:"approved"}});
      return action;
    });
    return row?Response.json({action:row}):Response.json({error:"Action changed; reload and review"},{status:409});
  }
  if(current.status==="draft")return Response.json({error:"Approve the action before recording progress or results"},{status:409});
  if(body.operation==="verify_result"){
    if(!current.resultSummary||!current.resultType||current.resultVerifiedAt)return Response.json({error:"No pending result to verify"},{status:409});
    const [submitted]=await auth.db.select().from(managementActionEvents)
      .where(and(eq(managementActionEvents.actionId,current.id),eq(managementActionEvents.eventType,"result")))
      .orderBy(desc(managementActionEvents.id)).limit(1);
    if(!submitted||submitted.actorEmail===auth.email)return Response.json({error:"Another manager must verify this result"},{status:403});
    const row=await auth.db.transaction(async tx=>{
      const [action]=await tx.update(managementActions).set({resultVerifiedAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
        .where(and(eq(managementActions.id,current.id),isNull(managementActions.resultVerifiedAt),eq(managementActions.updatedAt,current.updatedAt))).returning();
      if(!action)return null;
      await tx.insert(managementActionEvents).values({actionId:action.id,tenantId:action.tenantId,storeId:action.storeId,eventType:"result",actorEmail:auth.email,detail:{verification:true,resultType:action.resultType,resultAmount:action.resultAmount}});
      return action;
    });
    return row?Response.json({action:row}):Response.json({error:"Action changed; reload and review"},{status:409});
  }
  if(body.operation==="progress"){
    if(body.status!=="in_progress"&&body.status!=="completed")return invalid("Choose a valid progress status.");
    const evidenceUrl=body.evidenceUrl?.trim()?safeUrl(body.evidenceUrl.trim()):null;
    if(body.evidenceUrl?.trim()&&!evidenceUrl)return invalid("Evidence must use an HTTPS link.");
    if(body.status==="completed"&&!evidenceUrl&&!current.evidenceUrl)return invalid("Execution evidence is required before completion.");
    const row=await auth.db.transaction(async tx=>{
      const [action]=await tx.update(managementActions).set({status:body.status,evidenceUrl:evidenceUrl??current.evidenceUrl,updatedAt:new Date().toISOString()})
        .where(and(eq(managementActions.id,current.id),eq(managementActions.status,current.status),eq(managementActions.updatedAt,current.updatedAt))).returning();
      if(!action)return null;
      await tx.insert(managementActionEvents).values({actionId:action.id,tenantId:action.tenantId,storeId:action.storeId,eventType:"progress",actorEmail:auth.email,detail:{status:body.status,evidenceUrl}});
      return action;
    });
    return row?Response.json({action:row}):Response.json({error:"Action changed; reload and review"},{status:409});
  }
  if(body.operation!=="result")return invalid("Unknown operation.");
  if(current.resultVerifiedAt)return Response.json({error:"Verified results are locked; record a new action for a correction"},{status:409});
  if(!body.resultSummary?.trim()||!body.resultType)return invalid("Result summary and classification are required.");
  const quantified=body.resultType==="verified_saving"||body.resultType==="sales_change";
  if(quantified&&(!body.resultAmount||!amountPattern.test(body.resultAmount)||!body.resultCurrency||!body.resultSource?.trim()))return invalid("A quantified result needs an exact amount, currency and source.");
  if(quantified&&!/^[A-Z]{3}$/.test(body.resultCurrency??""))return invalid("Use a three-letter currency code.");
  if(!quantified&&body.resultAmount)return invalid("Unattributed or risk results cannot carry a monetary amount.");
  const evidenceUrl=body.evidenceUrl?.trim()?safeUrl(body.evidenceUrl.trim()):current.evidenceUrl;
  if(body.evidenceUrl?.trim()&&!evidenceUrl)return invalid("Evidence must use an HTTPS link.");
  if(quantified&&!evidenceUrl)return invalid("A quantified result needs an evidence link.");
  const row=await auth.db.transaction(async tx=>{
    const [action]=await tx.update(managementActions).set({
      resultSummary:body.resultSummary!.trim(),resultType:body.resultType,
      resultAmount:quantified?body.resultAmount:null,resultCurrency:quantified?body.resultCurrency!.trim():null,
      resultSource:quantified?body.resultSource!.trim():null,resultVerifiedAt:null,
      evidenceUrl,updatedAt:new Date().toISOString(),
    }).where(and(eq(managementActions.id,current.id),eq(managementActions.status,current.status),eq(managementActions.updatedAt,current.updatedAt))).returning();
    if(!action)return null;
    await tx.insert(managementActionEvents).values({actionId:action.id,tenantId:action.tenantId,storeId:action.storeId,eventType:"result",actorEmail:auth.email,detail:{resultType:action.resultType,resultAmount:action.resultAmount,resultCurrency:action.resultCurrency,resultSource:action.resultSource}});
    return action;
  });
  return row?Response.json({action:row}):Response.json({error:"Action changed; reload and review"},{status:409});
}
