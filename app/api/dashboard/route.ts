import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, dashboardSnapshots, managementActions, stores, tenants } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const db = getDb();
  const [membership] = await db.select({ tenantId: customerUsers.tenantId })
    .from(customerUsers)
    .where(eq(customerUsers.email, user.email.toLowerCase()))
    .limit(1);
  if (!membership) return Response.json({ error: "No customer dashboard is assigned to this account" }, { status: 403 });

  const [tenant] = await db.select().from(tenants).where(and(eq(tenants.id, membership.tenantId), eq(tenants.active, true))).limit(1);
  if (!tenant) return Response.json({ error: "Customer dashboard is inactive" }, { status: 403 });

  const tenantStores = await db.select().from(stores).where(eq(stores.tenantId, tenant.id));
  const requestedStoreId = new URL(request.url).searchParams.get("storeId");
  const allStoresRequested = requestedStoreId === "all";
  const selectedStore = requestedStoreId && !allStoresRequested
    ? tenantStores.find((store) => store.id === requestedStoreId)
    : (allStoresRequested ? undefined : tenantStores[0]);
  if (requestedStoreId && !allStoresRequested && !selectedStore) return Response.json({ error: "Store access denied" }, { status: 403 });
  const latest = await db.select().from(dashboardSnapshots)
    .where(selectedStore
      ? and(eq(dashboardSnapshots.tenantId, tenant.id), eq(dashboardSnapshots.storeId, selectedStore.id))
      : eq(dashboardSnapshots.tenantId, tenant.id))
    .orderBy(desc(dashboardSnapshots.importedAt), desc(dashboardSnapshots.id))
    .limit(1);
  const actions = await db.select().from(managementActions)
    .where(selectedStore
      ? and(eq(managementActions.tenantId, tenant.id), eq(managementActions.storeId, selectedStore.id))
      : eq(managementActions.tenantId, tenant.id))
    .orderBy(desc(managementActions.actionDate), desc(managementActions.id))
    .limit(20);

  return Response.json({
    customer: { id: tenant.id, name: tenant.name },
    stores: tenantStores.map(({ id, name, platform }) => ({ id, name, platform })),
    selectedStoreId: allStoresRequested ? "all" : (selectedStore?.id ?? null),
    snapshot: latest[0] ?? null,
    actions,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
