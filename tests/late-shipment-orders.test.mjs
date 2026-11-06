import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const adapters = {
  "chatgpt-auth": "export const getChatGPTUser=async()=>globalThis.shipments.actor;",
  "account-ledger": 'export const malaysiaDate=()=>"2026-11-06";',
  "module-access": "export const canAccessModule=async()=>globalThis.shipments.moduleAllowed;",
  "deployment-isolation": 'export const assertDeploymentIsolation=()=>"staging";',
  db: "export const getDb=async()=>globalThis.shipments.db;",
};
const bundle = await build({
  entryPoints: ["app/api/late-shipment-orders/route.ts"], bundle: true, write: false,
  platform: "node", format: "esm",
  plugins: [{ name: "adapters", setup(plugin) {
    plugin.onResolve({ filter: /\/(chatgpt-auth|account-ledger|module-access|deployment-isolation|db)$/ }, args => ({
      path: args.path.split("/").at(-1), namespace: "shipments-test",
    }));
    plugin.onLoad({ filter: /.*/, namespace: "shipments-test" }, ({ path }) => ({ contents: adapters[path] }));
  } }],
});
const { GET } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const request = (store = "all") => new Request("https://example.invalid/api/late-shipment-orders?storeId=" + store);

function setup() {
  const state = {
    actor: { email: "customer@example.invalid" }, moduleAllowed: true,
    member: { id: 1, active: true, tenantId: "j-packaging", role: "customer" },
    scope: ["store-a", "ended"], reads: 0,
    registry: [
      { id: "store-a", tenant_id: "j-packaging", name: "Shop A", display_name: "Current A", platform: "Shopee" },
      { id: "store-b", tenant_id: "j-packaging", name: "Shop B", platform: "Shopee" },
      { id: "ended", tenant_id: "j-packaging", name: "Ended", platform: "Shopee", service_status: "ended" },
    ],
    source: [],
  };
  state.db = {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({
      limit: async () => state.member ? [{ customer_users: state.member }] : [],
    }) }) }) }),
    execute: async query => {
      const sql = query.queryChunks.flatMap(chunk => chunk.value ?? [chunk]).join(" ");
      if (sql.includes("permission_effective_stores")) return [{ ids: state.scope }];
      if (sql.includes("public.late_shipment_orders")) {
        state.reads++;
        assert.match(sql, /where alert_date =\s*2026-11-06\s*::date/);
        return state.source.filter(row => row.alert_date === "2026-11-06");
      }
      if (sql.includes("public.stores")) return state.registry;
      if (sql.includes("public.link_directory_stores")) return [];
      throw Error("Unexpected read");
    },
  };
  globalThis.shipments = state;
  return state;
}
const row = (order_no, store_name, alert_date = "2026-11-06") => ({ order_no, store_name, alert_date, expire_time: null });

test("stale alerts return a successful empty state", async () => {
  setup().source = [row("OLD", "Shop A", "2026-11-04")];
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { orders: [] });
});

test("all stores only returns authorized current-day orders and canonical labels", async () => {
  setup().source = [row("A", "Shop A"), row("B", "Shop B"), row("C", "Ended"), row("OLD", "Shop A", "2026-11-04")];
  const response = await GET(request());
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.deepEqual(await response.json(), { orders: [{ key: "store-a:A", orderNo: "A", storeName: "Current A", expiresAt: null }] });
});

test("unauthorized store, module and tenant never read order source", async () => {
  const state = setup();
  assert.equal((await GET(request("store-b"))).status, 403);
  state.moduleAllowed = false;
  assert.equal((await GET(request())).status, 403);
  state.moduleAllowed = true;
  state.member.tenantId = "another-tenant";
  assert.equal((await GET(request())).status, 403);
  assert.equal(state.reads, 0);
});

test("ambiguous aliases across tenants fail closed", async () => {
  const state = setup();
  state.registry.push({ id: "foreign", tenant_id: "another-tenant", name: "Shop A", platform: "Shopee" });
  state.source = [row("A", "Shop A")];
  assert.deepEqual(await (await GET(request())).json(), { orders: [] });
});
