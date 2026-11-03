import "server-only";

import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { tenantModulePermissions, userModulePermissions } from "../db/schema";
import { effectiveAccessIds, type PortalModuleId } from "./module-permissions";

import {dbStoreAccessIds} from "./store-access";

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
  return (await dbStoreAccessIds(db,membership)).has(storeId);
}
