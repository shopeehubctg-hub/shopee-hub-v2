import "server-only";

import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { stores, tenantModulePermissions, userModulePermissions, userStoreAccess } from "../db/schema";
import { effectiveAccessIds, type PortalModuleId } from "./module-permissions";

type Database = Awaited<ReturnType<typeof getDb>>;

export async function canAccessModule(db: Database, membership: { id:number; tenantId:string; role:"customer"|"manager"|"superadmin"; active:boolean; moduleAccessMode:"role_default"|"custom" }, moduleId: PortalModuleId) {
  if (!membership.active) return false;
  if (membership.role === "superadmin") return true;
  const [tenantRows,userRows]=await Promise.all([
    db.select({moduleId:tenantModulePermissions.moduleId,enabled:tenantModulePermissions.enabled}).from(tenantModulePermissions).where(eq(tenantModulePermissions.tenantId,membership.tenantId)),
    db.select({moduleId:userModulePermissions.moduleId,enabled:userModulePermissions.enabled,additiveGrant:userModulePermissions.additiveGrant}).from(userModulePermissions).where(eq(userModulePermissions.userId,membership.id)),
  ]);
  return effectiveAccessIds(membership.role,membership.moduleAccessMode,new Map(tenantRows.map(row=>[row.moduleId,row.enabled])),new Set(userRows.filter(row=>row.enabled&&!row.additiveGrant).map(row=>row.moduleId)),new Set(userRows.filter(row=>row.enabled&&row.additiveGrant).map(row=>row.moduleId))).includes(moduleId);
}

export async function canAccessStore(db:Database,membership:{id:number;tenantId:string;role:"customer"|"manager"|"superadmin";active:boolean;storeAccessMode:"all"|"selected"},storeId:string){
  if(!membership.active||!storeId||storeId==="all")return false;
  const [tenantStore]=await db.select({id:stores.id}).from(stores)
    .where(and(eq(stores.id,storeId),eq(stores.tenantId,membership.tenantId))).limit(1);
  if(!tenantStore)return false;
  if(membership.role==="superadmin"||membership.storeAccessMode==="all")return true;
  const [row]=await db.select({id:userStoreAccess.id}).from(userStoreAccess).where(and(eq(userStoreAccess.userId,membership.id),eq(userStoreAccess.storeId,storeId),eq(userStoreAccess.enabled,true))).limit(1);
  return Boolean(row);
}
