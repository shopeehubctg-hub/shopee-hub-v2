import { getDb } from "../../../../db";
import { customerUsers, dashboardSnapshots, managementActions, stores, tenants } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

const ADMIN_EMAIL = "shopeehub.ctg@gmail.com";

type ImportPayload = {
  tenant: { id: string; name: string; customerEmail: string };
  store: { id: string; name: string; bigSellerName: string };
  period: { start: string; end: string };
  dashboard: Record<string, unknown>;
  actions?: Array<{ date: string; category: string; title: string; detail: string; impact: string }>;
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const suppliedSecret = request.headers.get("x-import-secret");
  const secretAuthorized = Boolean(process.env.BIGSELLER_IMPORT_SECRET) && suppliedSecret === process.env.BIGSELLER_IMPORT_SECRET;
  const ownerAuthorized = Boolean(user && user.email.toLowerCase() === ADMIN_EMAIL);
  if (!ownerAuthorized && !secretAuthorized) {
    return Response.json({ error: "Administrator access required" }, { status: 403 });
  }

  const body = await request.json() as ImportPayload;
  if (!body.tenant?.id || !body.tenant?.name || !body.tenant?.customerEmail || !body.store?.id || !body.period?.start || !body.period?.end) {
    return Response.json({ error: "Tenant, customer email, store and period are required" }, { status: 400 });
  }

  const db = getDb();
  await db.insert(tenants).values({ id: body.tenant.id, name: body.tenant.name }).onConflictDoUpdate({
    target: tenants.id,
    set: { name: body.tenant.name, active: true },
  });
  await db.insert(customerUsers).values({
    email: body.tenant.customerEmail.toLowerCase(), tenantId: body.tenant.id, role: "customer",
  }).onConflictDoUpdate({ target: customerUsers.email, set: { tenantId: body.tenant.id } });
  await db.insert(stores).values({
    id: body.store.id, tenantId: body.tenant.id, name: body.store.name, bigSellerName: body.store.bigSellerName,
  }).onConflictDoUpdate({ target: stores.id, set: { tenantId: body.tenant.id, name: body.store.name, bigSellerName: body.store.bigSellerName } });
  await db.insert(dashboardSnapshots).values({
    tenantId: body.tenant.id,
    storeId: body.store.id,
    periodStart: body.period.start,
    periodEnd: body.period.end,
    payload: body.dashboard,
  });
  if (body.actions?.length) {
    await db.insert(managementActions).values(body.actions.map((action) => ({
      tenantId: body.tenant.id,
      storeId: body.store.id,
      actionDate: action.date,
      category: action.category,
      title: action.title,
      detail: action.detail,
      impact: action.impact,
    })));
  }

  return Response.json({ ok: true, tenantId: body.tenant.id, storeId: body.store.id });
}
