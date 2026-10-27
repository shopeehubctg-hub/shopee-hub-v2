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
const request = (method, body) => new Request("https://portal.test/api/admin/stores", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const requestId = "11111111-1111-4111-8111-111111111111";
const month = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
const effectiveMonth = `${month.find(part => part.type === "year").value}-${month.find(part => part.type === "month").value}`;
const details = { adsTopUpOwner: "Shopee Hub", storeGroupLink: "https://chat.whatsapp.com/group", googleDriveLink: "https://drive.google.com/store", projectLinks: [{ project: "Launch", href: "https://chat.whatsapp.com/launch", driveLink: "https://drive.google.com/launch" }] };
const setup = { name: "Demo", market: "MY", legalEntity: "Demo Sdn Bhd", effectiveMonth, feeRule: { type: "fixed", basis: "fixed_monthly", currency: "MYR", fixedAmount: "120.00" }, requestId, ...details };
let state;
beforeEach(() => {
  globalThis.__user = { email: "admin@example.test" };
  state = { stores: [], calls: [], requests: new Map(), member: { tenant_id: "tenant-1", role: "superadmin", active: true } };
  globalThis.__rest = async (path, init = {}) => {
    const table = new URL(path, "https://rest.test/").pathname.slice(1);
    const body = init.body ? JSON.parse(init.body) : null;
    if (table === "customer_users") return [state.member];
    if (table === "stores") return state.stores;
    if (table === "rpc/account_create_store_with_setup") {
      state.calls.push({ table, body });
      const prior = state.requests.get(body.p_request_id);
      if (prior) return prior;
      const row = { id: body.p_store_id, tenant_id: body.p_tenant, name: body.p_name, display_name: null, bigseller_name: body.p_source_name, platform: `Shopee ${body.p_market}` };
      state.stores.push(row);
      const result = { id: row.id, version: "1" };
      state.requests.set(body.p_request_id, result);
      return result;
    }
    if (table === "rpc/account_update_store_with_company") {
      state.calls.push({ table, body });
      const row = state.stores.find(store => store.id === body.p_store_id);
      row.display_name = body.p_name;
      return { id: row.id, version: body.p_entity === null ? null : "2" };
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
  assert.equal(state.calls[0].body.p_entity, "Demo Sdn Bhd");
  assert.equal(state.calls[0].body.p_details.projectLinks[0].driveLink, "https://drive.google.com/launch");
  assert.equal(state.calls[0].body.p_rule.fixedAmount, "120.00");
});

test("same request ID retries return the same store and Account version", async () => {
  const first = await (await api.POST(request("POST", setup))).json();
  const second = await (await api.POST(request("POST", setup))).json();
  assert.equal(state.stores.length, 1);
  assert.equal(first.store.id, second.store.id);
  assert.equal(first.store.accountUnit.latestVersion, second.store.accountUnit.latestVersion);
});

test("invalid Account fee prevents any store RPC call", async () => {
  const response = await api.POST(request("POST", { ...setup, feeRule: { ...setup.feeRule, fixedAmount: "oops" } }));
  assert.equal(response.status, 400);
  assert.equal(state.calls.length, 0);
});

test("edit sends company version and directory details through one RPC", async () => {
  state.stores = [{ id: "shopee-demo", tenant_id: "tenant-1", name: "Demo", display_name: null, bigseller_name: "Demo", platform: "Shopee MY" }];
  const response = await api.PATCH(request("PATCH", { id: "shopee-demo", name: "Demo New", legalEntity: "New Company Sdn Bhd", effectiveMonth, accountRosterKey: "store:shopee-demo", expectedAccountVersion: "1", requestId, ...details }));
  assert.equal(response.status, 200);
  assert.equal(state.calls[0].table, "rpc/account_update_store_with_company");
  assert.equal(state.calls[0].body.p_entity, "New Company Sdn Bhd");
  assert.equal(state.calls[0].body.p_roster_key, "store:shopee-demo");
  assert.equal(state.stores[0].display_name, "Demo New");
});

test("v2 Rate Card and SG FX setup cannot silently fall through to the legacy store RPC", async () => {
  for (const market of ["MY", "SG"]) {
    const response = await api.POST(request("POST", { name: "New store", market, requestId, accountSetup: { version: 2, legalEntity: "Company", effectiveMonth, clientType: "Internal", billingCurrency: "MYR", inputCurrency: market === "SG" ? "SGD" : "MYR", rateCard: { id: "internal-new", version: 1 }, fxPolicy: market === "SG" ? "fixed" : "none", fxRate: market === "SG" ? "3.2" : undefined } }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /preview-only.*No store was created/);
  }
  assert.equal(state.calls.length, 0);
  assert.equal(state.stores.length, 0);
});
