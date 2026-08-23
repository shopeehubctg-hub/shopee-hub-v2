import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customerUsers, tenantModulePermissions } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ALL_PORTAL_MODULE_IDS, isPortalModuleId } from "../../../module-permissions";

export const dynamic = "force-dynamic";

async function requireSuperAdmin() {
  const user = await getChatGPTUser();
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const db = await getDb();
  const [membership] = await db.select({ tenantId: customerUsers.tenantId, role: customerUsers.role })
    .from(customerUsers)
    .where(eq(customerUsers.email, user.email.toLowerCase()))
    .limit(1);
  if (!membership || membership.role !== "superadmin") return { error: Response.json({ error: "Super Admin access required" }, { status: 403 }) };
  return { db, membership };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  const rows = await auth.db.select().from(tenantModulePermissions)
    .where(eq(tenantModulePermissions.tenantId, auth.membership.tenantId));
  const configured = new Map(rows.map((row) => [row.moduleId, row.enabled]));
  return Response.json({ enabledModules: ALL_PORTAL_MODULE_IDS.filter((id) => configured.get(id) !== false) });
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as { enabledModules?: unknown[] } | null;
  if (!body || !Array.isArray(body.enabledModules) || !body.enabledModules.every(isPortalModuleId)) {
    return Response.json({ error: "enabledModules must contain valid portal module IDs" }, { status: 400 });
  }
  const enabled = new Set(body.enabledModules);
  await auth.db.transaction(async (tx) => {
    for (const moduleId of ALL_PORTAL_MODULE_IDS) {
      await tx.insert(tenantModulePermissions).values({ tenantId: auth.membership.tenantId, moduleId, enabled: enabled.has(moduleId) })
        .onConflictDoUpdate({
          target: [tenantModulePermissions.tenantId, tenantModulePermissions.moduleId],
          set: { enabled: enabled.has(moduleId), updatedAt: new Date().toISOString() },
          setWhere: and(eq(tenantModulePermissions.tenantId, auth.membership.tenantId), eq(tenantModulePermissions.moduleId, moduleId)),
        });
    }
  });
  return Response.json({ enabledModules: ALL_PORTAL_MODULE_IDS.filter((id) => enabled.has(id)) });
}
