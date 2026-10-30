import "server-only";

import { getChatGPTUser } from "./chatgpt-auth";
import { effectiveAccessIds, type PortalModuleId } from "./module-permissions";
import { supabaseRest } from "./supabase-rest";
import { canonicalStoreId } from "./live-calendar-model";

// An explicit administrative capability, never a role default or client module.
export type PermissionMember = {
  id: number; email: string; display_name: string | null; tenant_id: string;
  role: "customer" | "manager" | "superadmin"; active: boolean;
  module_access_mode: "role_default" | "custom"; store_access_mode: "all" | "selected";
  created_at: string; can_manage_permissions: boolean;
};
export type PermissionContext = {
  member: PermissionMember; actor: string; isSuperAdmin: boolean;
  grantableModules: PortalModuleId[]; storeIds: string[];
};

export function samePermissionOrigin(request: Request) {
  return request.headers.get("sec-fetch-site") !== "cross-site"
    && request.headers.get("origin") === new URL(request.url).origin;
}

export function effectivePermissionModules(member: Pick<PermissionMember, "role" | "module_access_mode">,
  tenantRows: Array<{module_id: string; enabled: boolean}>, userRows: Array<{module_id: string; enabled: boolean}>) {
  return effectiveAccessIds(member.role,member.module_access_mode,new Map(tenantRows.map(row=>[row.module_id,row.enabled])),new Set(userRows.filter(row=>row.enabled).map(row=>row.module_id)));
}

export async function permissionManagement(request?: Request): Promise<PermissionContext | {error: Response}> {
  if (request && !samePermissionOrigin(request)) return {error: Response.json({error: "Reload Permission Settings before saving"}, {status: 403})};
  const user = await getChatGPTUser();
  if (!user) return {error: Response.json({error: "Authentication required"}, {status: 401})};
  const actor = user.email.toLowerCase();
  const [member] = await supabaseRest<PermissionMember[]>(`customer_users?select=*&email=eq.${encodeURIComponent(actor)}&limit=1`);
  if (!member?.active) return {error: Response.json({error: "Permission Settings access required"}, {status: 403})};
  const [tenants, userRows, tenantRows, stores, assigned] = await Promise.all([
    supabaseRest<Array<{active: boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`),
    supabaseRest<Array<{module_id: string; enabled: boolean}>>(`user_module_permissions?select=module_id,enabled&user_id=eq.${member.id}`),
    supabaseRest<Array<{module_id: string; enabled: boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(member.tenant_id)}`),
    supabaseRest<Array<{id: string}>>(`stores?select=id&tenant_id=eq.${encodeURIComponent(member.tenant_id)}`),
    member.store_access_mode === "selected" ? supabaseRest<Array<{store_id: string}>>(`user_store_access?select=store_id&enabled=eq.true&user_id=eq.${member.id}`) : Promise.resolve([]),
  ]);
  const isSuperAdmin = member.role === "superadmin";
  if (!tenants[0]?.active || !isSuperAdmin && member.can_manage_permissions !== true)
    return {error: Response.json({error: "Permission Settings access required"}, {status: 403})};
  const assignedIds = new Set(assigned.map(row => canonicalStoreId(row.store_id)));
  const storeIds = stores.filter(store => canonicalStoreId(store.id) === store.id)
    .filter(store => isSuperAdmin || member.store_access_mode === "all" || assignedIds.has(store.id)).map(store => store.id);
  return {member, actor, isSuperAdmin, storeIds, grantableModules: effectivePermissionModules(member, tenantRows, userRows)} satisfies PermissionContext;
}

export function manageablePermissionUser(auth: PermissionContext, target: PermissionMember, targetStores: string[], delegated: boolean) {
  return auth.isSuperAdmin || target.role === "customer" && target.id !== auth.member.id && !delegated
    && (target.store_access_mode !== "all" || auth.member.store_access_mode === "all")
    && targetStores.every(id => auth.storeIds.includes(id));
}

export function permissionSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/PERMISSION_ACCESS_DENIED|PERMISSION_SCOPE|PERMISSION_PROTECTED/.test(message)) return Response.json({error: "This change is outside your authorized access. Refresh Permission Settings."}, {status: 403});
  if (/PERMISSION_VERSION|PERMISSION_REQUEST_CONFLICT/.test(message)) return Response.json({error: "This user changed. Refresh Permission Settings before saving."}, {status: 409});
  if (/PERMISSION_INVALID|PERMISSION_SELF/.test(message)) return Response.json({error: "Check the user, modules and store selection."}, {status: 400});
  return Response.json({error: "Unable to save permissions. No partial permission changes were saved. Please try again."}, {status: 503});
}
