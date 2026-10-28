import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve("esbuild", { paths: [dirname(require.resolve("vite"))] })));
const bundled = await build({
  entryPoints: ["app/api/admin/stores/route.ts"], bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "api-stubs", setup(build) {
    build.onResolve({ filter: /^(server-only|.*\/chatgpt-auth|.*\/supabase-rest)$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({
      contents: args.path === "server-only" ? "" : args.path === "chatgpt-auth"
        ? "export async function getChatGPTUser(){return globalThis.__user;}"
        : "export async function supabaseRest(path,init){return globalThis.__rest(path,init);}", loader: "js",
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const request = (method, body) => new Request("https://portal.test/api/admin/stores", { method, headers: { "Content-Type": "application/json", Origin: "https://portal.test" }, body: JSON.stringify(body) });
const requestId = "11111111-1111-4111-8111-111111111111";
const month = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
const effectiveMonth = `${month.find(part => part.type === "year").value}-${month.find(part => part.type === "month").value}`;
const details = { adsTopUpOwner: "Shopee Hub", storeGroupLink: "https://chat.whatsapp.com/group", googleDriveLink: "https://drive.google.com/store", projectLinks: [{ project: "Launch", href: "https://chat.whatsapp.com/launch", driveLink: "https://drive.google.com/launch" }] };
const accountSetup = { version: 2, legalEntity: "Demo Sdn Bhd", effectiveMonth, clientType: "External", rateCard: { id: "external-10", version: 2 }, feeRule: { type: "fixed", basis: "fixed_monthly", currency: "MYR", fixedAmount: "120.00" }, inputCurrency: "MYR", billingCurrency: "MYR", fxPolicy: "none" };
const setup = { name: "Demo", market: "MY", accountSetup, requestId, ...details };
let state;
beforeEach(() => {
  globalThis.__user = { email: "admin@example.test" };
  state = { stores: [], calls: [], requests: new Map(), member: { tenant_id: "tenant-1", role: "superadmin", active: true } };
  globalThis.__rest = async (path, init = {}) => {
    const table = new URL(path, "https://rest.test/").pathname.slice(1);
    const body = init.body ? JSON.parse(init.body) : null;
    if (table === "customer_users") return [state.member];
    if (table === "tenants") return [{ active: state.tenantActive ?? true }];
    if (table === "stores") return state.stores;
    if (table === "rpc/account_create_store_with_setup_v2") {
      state.calls.push({ table, body });
      if (state.failRpc) throw new Error(state.failRpc);
      const prior = state.requests.get(body.p_request_id);
      if (prior) return prior;
      const row = { id: body.p_store_id, tenant_id: body.p_tenant, name: body.p_name, display_name: null, bigseller_name: body.p_source_name, platform: `Shopee ${body.p_market}` };
      state.stores.push(row);
      const result = { id: row.id, version: "1" };
      state.requests.set(body.p_request_id, result);
      return result;
    }
    if (table === "rpc/account_update_store_with_setup_v2") {
      state.calls.push({ table, body });
      if (state.failRpc) throw new Error(state.failRpc);
      const row = state.stores.find(store => store.id === body.p_store_id);
      row.display_name = body.p_name;
      return { id: row.id, version: body.p_setup === null ? null : "2" };
    }
    throw new Error(`Unexpected table ${table}`);
  };
});

test("only Super Admin may create a store with Account setup", async () => {
  state.member.role = "customer";
  assert.equal((await api.POST(request("POST", setup))).status, 403);
  state.member.role = "superadmin";
  const response = await api.POST(request("POST", setup));
  assert.equal(response.status, 201);
  assert.equal(state.stores.length, 1);
  assert.equal(state.calls[0].body.p_setup.legalEntity, "Demo Sdn Bhd");
  assert.equal(state.calls[0].body.p_details.projectLinks[0].driveLink, "https://drive.google.com/launch");
  assert.equal(state.calls[0].body.p_setup.feeRule.fixedAmount, "120.00");
});

test("same request ID retries return the same store and Account version", async () => {
  const first = await (await api.POST(request("POST", setup))).json();
  const second = await (await api.POST(request("POST", setup))).json();
  assert.equal(state.stores.length, 1);
  assert.equal(first.store.id, second.store.id);
  assert.equal(first.store.accountUnit.latestVersion, second.store.accountUnit.latestVersion);
});

test("invalid Account fee prevents any store RPC call", async () => {
  const response = await api.POST(request("POST", { ...setup, accountSetup: { ...accountSetup, feeRule: { ...accountSetup.feeRule, fixedAmount: "oops" } } }));
  assert.equal(response.status, 400);
  assert.equal(state.calls.length, 0);
});

test("edit sends company version and directory details through one RPC", async () => {
  for (const market of ["MY", "SG", "TH", "PH"]) {
    const id = `shopee-demo-${market.toLowerCase()}`;
    state.stores = [{ id, tenant_id: "tenant-1", name: "Demo", display_name: null, bigseller_name: "Demo", platform: `Shopee ${market}` }];
    const response = await api.PATCH(request("PATCH", { id, name: "Demo New", legalEntity: "New Company Sdn Bhd", effectiveMonth, accountRosterKey: `store:${id}`, expectedAccountVersion: "1", requestId: crypto.randomUUID(), ...details }));
    assert.equal(response.status, 200, market);
    const call = state.calls.at(-1);
    assert.equal(call.table, "rpc/account_update_store_with_setup_v2");
    assert.deepEqual(call.body.p_setup, { version: 2, legalEntity: "New Company Sdn Bhd", effectiveMonth });
    assert.equal(call.body.p_roster_key, `store:${id}`);
    assert.equal(call.body.p_market, market);
    assert.equal(call.body.p_source_name, "Demo");
    assert.equal(state.stores[0].display_name, "Demo New");
  }
});

test("all four markets use the v2 RPC and preserve market currency and FX policy", async () => {
  const currencies = { MY: "MYR", SG: "SGD", TH: "THB", PH: "PHP" };
  for (const market of ["MY", "SG", "TH", "PH"]) {
    const fxPolicy = market === "MY" ? "none" : "bnm-service-average";
    const response = await api.POST(request("POST", { ...setup, name: `New ${market}`, market, requestId: crypto.randomUUID(), accountSetup: { ...accountSetup, inputCurrency: currencies[market], fxPolicy } }));
    assert.equal(response.status, 201, market);
    assert.equal(state.calls.at(-1).body.p_setup.inputCurrency, currencies[market]);
    assert.equal(state.calls.at(-1).body.p_setup.fxPolicy, fxPolicy);
  }
  assert.equal(state.stores.length, 4);
});

test("invalid SG FX or cross-site Origin never calls the store RPC", async () => {
  assert.equal((await api.POST(request("POST", { ...setup, market: "SG", accountSetup: { ...accountSetup, inputCurrency: "SGD" } }))).status, 400);
  assert.equal((await api.POST(request("POST", { ...setup, accountSetup: { ...accountSetup, rateCard: { id: "external-10", version: 0 } } }))).status, 400);
  assert.equal((await api.POST(request("POST", { ...setup, market: "TH", accountSetup: { ...accountSetup, inputCurrency: "MYR", fxPolicy: "bnm-service-average" } }))).status, 400);
  const crossSite = new Request("https://portal.test/api/admin/stores", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.test" }, body: JSON.stringify(setup) });
  assert.equal((await api.POST(crossSite)).status, 403);
  assert.equal(state.calls.length, 0);
});

test("stale Rate Card and unavailable v2 RPC fail without a partial store", async () => {
  state.failRpc = 'Supabase REST 400: {"code":"P0001","message":"RATE_CARD_VERSION_CONFLICT"}';
  assert.equal((await api.POST(request("POST", setup))).status, 409);
  state.failRpc = 'Supabase REST 404: {"code":"PGRST202","message":"Function not found"}';
  assert.equal((await api.POST(request("POST", setup))).status, 503);
  assert.equal(state.stores.length, 0);
});
