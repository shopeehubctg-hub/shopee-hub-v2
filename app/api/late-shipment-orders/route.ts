import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, tenants } from "../../../db/schema";
import { malaysiaDate } from "../../account-ledger";
import { assertDeploymentIsolation } from "../../deployment-isolation";
import { getChatGPTUser } from "../../chatgpt-auth";
import { canonicalStoreId } from "../../live-calendar-model";
import { canAccessModule } from "../../module-access";
import { sourceStoreResolver, type SourceStore } from "../../source-store-mapping";
import roster from "../../account-roster-data.json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

type RegistryStore = SourceStore & { service_status: string | null };
type DirectoryStore = { tenant_id: string; store_id: string; store_name: string };
type SourceOrder = { order_no: string; store_name: string; expire_time: Date | string | null };
type ImportRun = { status: string; rows_written: number | string | null; expected_rows: number | string | null; finished_at: string | null };

export async function GET(request: Request) {
  try {
    if (assertDeploymentIsolation() === "local") return reply({ error: "Orders are unavailable" }, 404);
    const actor = await getChatGPTUser();
    if (!actor) return reply({ error: "Authentication required" }, 401);

    const db = await getDb();
    const [member] = await db.select().from(customerUsers)
      .innerJoin(tenants, and(eq(tenants.id, customerUsers.tenantId), eq(tenants.active, true)))
      .where(eq(customerUsers.email, actor.email.toLowerCase())).limit(1)
      .then(rows => rows.map(row => row.customer_users));

    // The source table has no tenant key and belongs to the Shopee Hub roster.
    if (!member?.active || member.tenantId !== roster.tenantId || !await canAccessModule(db, member, "orders")) {
      return reply({ error: "Orders access denied" }, 403);
    }

    const [scope] = await db.execute<{ ids: string[] }>(sql`
      select public.permission_effective_stores(${member.tenantId}, ${member.id}) as ids
    `);
    const selected = canonicalStoreId(new URL(request.url).searchParams.get("storeId") || "all");
    if (!Array.isArray(scope?.ids)) throw Error("Store access cannot be verified");
    const allowed = new Set(scope.ids);
    if (selected !== "all" && !allowed.has(selected)) return reply({ error: "Store access denied" }, 403);
    if (!allowed.size) return reply({ orders: [], importStatus: "ready" });

    const today = malaysiaDate();
    // The staging pilot can run before its importer has a job receipt table.
    const [receiptTable] = await db.execute<{ available: boolean }>(sql`
      select to_regclass('public.job_runs') is not null as available
    `);
    const [run] = receiptTable?.available ? await db.execute<ImportRun>(sql`
      select status, rows_written, expected_rows, finished_at from public.job_runs
      where job_name = 'late_shipment' and business_date = ${today}::date
      order by finished_at desc nulls last, id desc limit 1
    `) : [];
    const rows = await db.execute<SourceOrder>(sql`
      select order_no, store_name, expire_time
      from public.late_shipment_orders
      where alert_date = ${today}::date
      order by expire_time asc nulls last, id asc
      limit 5001
    `);
    if (rows.length > 5000) throw Error("Late shipment read limit exceeded");
    const incomplete = Boolean(run && (run.status !== "success" || !run.finished_at));
    if (rows.length === 0) {
      const confirmedEmpty = run && !incomplete && String(run.rows_written) === "0" && String(run.expected_rows) === "0";
      return reply({
        orders: [],
        importStatus: confirmedEmpty ? "ready" : run ? "incomplete" : "not_imported",
      });
    }

    const [registry, directory] = await Promise.all([
      db.execute<RegistryStore>(sql`
        select s.id, s.tenant_id, s.name, s.display_name, s.bigseller_name, s.platform,
               to_jsonb(s)->>'service_status' as service_status
        from public.stores s order by s.id limit 5001
      `),
      db.execute<DirectoryStore>(sql`
        select tenant_id, store_id, store_name
        from public.link_directory_stores order by store_id limit 5001
      `),
    ]);
    if (registry.length > 5000 || directory.length > 5000) throw Error("Store registry read limit exceeded");

    const resolveStore = sourceStoreResolver(member.tenantId, [...registry], [...directory]);
    const ended = new Set(registry.filter(store => store.service_status === "ended").map(store => store.id));
    if (ended.has(selected)) return reply({ error: "Store access denied" }, 403);
    const orders = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const store = resolveStore(row.store_name);
      if (!store || !/^Shopee(?: |$)/i.test(store.platform) || ended.has(store.id) ||
          !allowed.has(store.id) || (selected !== "all" && store.id !== selected)) continue;
      const key = `${store.id}:${row.order_no}`;
      if (seen.has(key)) continue;
      seen.add(key);
      orders.push({ key, orderNo: row.order_no, storeName: store.display_name ?? store.name, expiresAt: row.expire_time });
    }
    return reply({ orders, importStatus: incomplete ? "incomplete" : "ready" });
  } catch {
    return reply({ error: "Unable to load orders. Please try again." }, 503);
  }
}
