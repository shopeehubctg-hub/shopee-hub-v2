import "server-only";

import { and, eq } from "drizzle-orm";
import type { getDb } from "../db";
import { tenantModulePermissions, userModulePermissions, userStoreAccess } from "../db/schema";
import type { PortalModuleId } from "./module-permissions";

type Database = Awaited<ReturnType<typeof getDb>>;

export async function canAccessModule(db: Database, membership: { id:number; tenantId:string; role:"customer"|"manager"|"superadmin"; active:boolean; moduleAccessMode:"role_default"|"custom" }, moduleId: PortalModuleId) {
  if (!membership.active) return false;
  if (membership.role === "superadmin") return true;
  if (membership.moduleAccessMode === "custom") {
    const [permission] = await db.select({ enabled:userModulePermissions.enabled }).from(userModulePermissions)
      .where(and(eq(userModulePermissions.userId,membership.id),eq(userModulePermissions.moduleId,moduleId))).limit(1);
    return permission?.enabled === true;
  }
  if (membership.role === "manager") return true;
  const [permission] = await db.select({ enabled:tenantModulePermissions.enabled }).from(tenantModulePermissions)
    .where(and(eq(tenantModulePermissions.tenantId,membership.tenantId),eq(tenantModulePermissions.moduleId,moduleId))).limit(1);
  return permission?.enabled !== false;
}

export async function canAccessStore(db:Database,membership:{id:number;role:"customer"|"manager"|"superadmin";active:boolean;storeAccessMode:"all"|"selected"},storeId:string){
  if(!membership.active)return false;
  if(membership.role==="superadmin"||membership.storeAccessMode==="all"||storeId==="all")return true;
  const [row]=await db.select({id:userStoreAccess.id}).from(userStoreAccess).where(and(eq(userStoreAccess.userId,membership.id),eq(userStoreAccess.storeId,storeId))).limit(1);
  return Boolean(row);
}
