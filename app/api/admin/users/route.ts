import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customerUsers, stores, tenantModulePermissions, userModulePermissions, userStoreAccess } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ALL_PORTAL_MODULE_IDS, isPortalModuleId } from "../../../module-permissions";

export const dynamic = "force-dynamic";
type Role = "customer" | "manager" | "superadmin";

async function authSuperAdmin() {
  const actor = await getChatGPTUser();
  if (!actor) return { error:Response.json({ error:"Authentication required" },{ status:401 }) };
  const db = await getDb();
  const [membership] = await db.select().from(customerUsers).where(eq(customerUsers.email,actor.email.toLowerCase())).limit(1);
  if (!membership?.active || membership.role !== "superadmin") return { error:Response.json({ error:"Super Admin access required" },{ status:403 }) };
  return { db, actor, membership };
}

async function portalUsers(db:Awaited<ReturnType<typeof getDb>>,tenantId:string) {
  const [users,tenantModules,tenantStores] = await Promise.all([
    db.select().from(customerUsers).where(eq(customerUsers.tenantId,tenantId)).orderBy(asc(customerUsers.email)),
    db.select().from(tenantModulePermissions).where(eq(tenantModulePermissions.tenantId,tenantId)),
    db.select({ id:stores.id,name:stores.name,platform:stores.platform }).from(stores).where(eq(stores.tenantId,tenantId)).orderBy(asc(stores.name)),
  ]);
  const userIds=users.map(user=>user.id);
  const [moduleRows,storeRows]=userIds.length?await Promise.all([db.select().from(userModulePermissions).where(inArray(userModulePermissions.userId,userIds)),db.select().from(userStoreAccess).where(inArray(userStoreAccess.userId,userIds))]):[[],[]];
  const clientDefaults = ALL_PORTAL_MODULE_IDS.filter(id=>tenantModules.find(row=>row.moduleId===id)?.enabled!==false);
  return { stores:tenantStores, clientDefaults, users:users.map(user=>({
    id:user.id,email:user.email,displayName:user.displayName??"",role:user.role,active:user.active,
    moduleAccessMode:user.moduleAccessMode,storeAccessMode:user.storeAccessMode,createdAt:user.createdAt,
    enabledModules:user.moduleAccessMode==="custom" ? ALL_PORTAL_MODULE_IDS.filter(id=>moduleRows.find(row=>row.userId===user.id&&row.moduleId===id)?.enabled===true) : (user.role==="customer"?clientDefaults:ALL_PORTAL_MODULE_IDS),
    storeIds:user.storeAccessMode==="selected" ? storeRows.filter(row=>row.userId===user.id).map(row=>row.storeId) : tenantStores.map(store=>store.id),
  })) };
}

export async function GET(){const auth=await authSuperAdmin();if("error" in auth)return auth.error;return Response.json(await portalUsers(auth.db,auth.membership.tenantId));}

export async function POST(request:Request){
  const auth=await authSuperAdmin();if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>null) as {email?:string;displayName?:string;role?:Role}|null;
  const email=body?.email?.trim().toLowerCase();const role=body?.role??"customer";
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter a valid email address"},{status:400});
  if(!["customer","manager","superadmin"].includes(role))return Response.json({error:"Invalid role"},{status:400});
  try{await auth.db.insert(customerUsers).values({email,displayName:body?.displayName?.trim()||null,tenantId:auth.membership.tenantId,role,active:true});}
  catch{return Response.json({error:"This email already has portal access"},{status:409});}
  return Response.json(await portalUsers(auth.db,auth.membership.tenantId),{status:201});
}

export async function PATCH(request:Request){
  const auth=await authSuperAdmin();if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>null) as {id?:number;displayName?:string;role?:Role;active?:boolean;moduleAccessMode?:"role_default"|"custom";enabledModules?:unknown[];storeAccessMode?:"all"|"selected";storeIds?:unknown[]}|null;
  if(!body?.id)return Response.json({error:"User ID is required"},{status:400});
  const [target]=await auth.db.select().from(customerUsers).where(and(eq(customerUsers.id,body.id),eq(customerUsers.tenantId,auth.membership.tenantId))).limit(1);
  if(!target)return Response.json({error:"User not found"},{status:404});
  if(target.id===auth.membership.id&&(body.active===false||body.role&&body.role!=="superadmin"))return Response.json({error:"You cannot remove your own Super Admin access"},{status:400});
  if(body.role&&!(["customer","manager","superadmin"] as string[]).includes(body.role))return Response.json({error:"Invalid role"},{status:400});
  if(body.moduleAccessMode==="custom"&&(!Array.isArray(body.enabledModules)||!body.enabledModules.every(isPortalModuleId)))return Response.json({error:"Invalid module selection"},{status:400});
  const tenantStores=await auth.db.select({id:stores.id}).from(stores).where(eq(stores.tenantId,auth.membership.tenantId));
  const validStoreIds=new Set(tenantStores.map(store=>store.id));
  if(body.storeAccessMode==="selected"&&(!Array.isArray(body.storeIds)||!body.storeIds.every(id=>typeof id==="string"&&validStoreIds.has(id))))return Response.json({error:"Invalid store selection"},{status:400});
  await auth.db.transaction(async tx=>{
    await tx.update(customerUsers).set({displayName:body.displayName?.trim()||null,role:body.role??target.role,active:body.active??target.active,moduleAccessMode:body.moduleAccessMode??target.moduleAccessMode,storeAccessMode:body.storeAccessMode??target.storeAccessMode}).where(eq(customerUsers.id,target.id));
    await tx.delete(userModulePermissions).where(eq(userModulePermissions.userId,target.id));
    if(body.moduleAccessMode==="custom"&&body.enabledModules?.length)await tx.insert(userModulePermissions).values(ALL_PORTAL_MODULE_IDS.map(moduleId=>({userId:target.id,moduleId,enabled:(body.enabledModules as string[]).includes(moduleId)})));
    await tx.delete(userStoreAccess).where(eq(userStoreAccess.userId,target.id));
    if(body.storeAccessMode==="selected"&&body.storeIds?.length)await tx.insert(userStoreAccess).values((body.storeIds as string[]).map(storeId=>({userId:target.id,storeId})));
  });
  return Response.json(await portalUsers(auth.db,auth.membership.tenantId));
}
