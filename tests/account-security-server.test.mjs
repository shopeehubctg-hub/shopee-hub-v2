import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
function load(path, mockedRequire, environment = {}) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", "process", source)(mockedRequire, exports, { env: environment });
  return exports;
}
const mainToken = randomBytes(32).toString("base64url");
const stepUpToken = randomBytes(32).toString("base64url");
function fixture(enabled = "1") {
  const calls = [];
  const cookieValues = { primary: "signed-primary", stepup: stepUpToken };
  const state = { role: "superadmin", rpc: true, throwAt: "", routeEmail: "admin@example.test" };
  const mockedRequire = name => {
    if (name === "server-only") return {};
    if (name === "node:crypto") return realRequire(name);
    if (name === "next/headers") return { cookies: async () => {
      if (state.throwAt === "cookies") throw Error("cookie store unavailable");
      return { get: key => ({ shopee_hub_portal_session: cookieValues.primary, shopee_hub_account_stepup: cookieValues.stepup })[key]
        ? { value: ({ shopee_hub_portal_session: cookieValues.primary, shopee_hub_account_stepup: cookieValues.stepup })[key] } : undefined };
    } };
    if (name === "./chatgpt-auth") return {
      PORTAL_SESSION_COOKIE: "shopee_hub_portal_session",
      readPortalSessionWithId: value => value === "signed-primary" ? { email: "admin@example.test", sessionId: mainToken } : null,
      getChatGPTUser: async () => state.routeEmail ? { email: state.routeEmail } : null,
    };
    if (name === "./supabase-rest") return { supabaseRest: async (path, init) => {
      calls.push([path, init]);
      if (state.throwAt === "database") throw Error("database unavailable");
      if (path.startsWith("customer_users?")) return [{ id: "1234567890123456789", tenant_id: "tenant-a", role: state.role, active: true }];
      if (path.startsWith("tenants?")) return [{ id: "tenant-a", active: true }];
      if (path === "rpc/account_session_valid") return state.rpc;
      throw Error("unexpected query " + path);
    } };
    throw Error("unexpected dependency " + name);
  };
  const server = load("app/account-security-server.ts", mockedRequire,
    enabled === null ? {} : { SHOPEE_ACCOUNT_SECURITY_ENABLED: enabled });
  return { server, state, calls, cookieValues };
}

test("default-off mode preserves current behavior without reading cookies or database", async () => {
  const { server, calls } = fixture(null);
  assert.equal(await server.accountAccessGranted(), true);
  assert.equal(await server.accountSecurityGate(), null);
  assert.deepEqual(calls, []);
});

test("enabled mode uses signed main ID and random step-up digests for the atomic RPC", async () => {
  const { server, calls } = fixture();
  assert.equal(await server.accountAccessGranted(), true);
  const [path, init] = calls.at(-1);
  assert.equal(path, "rpc/account_session_valid");
  const body = JSON.parse(init.body);
  assert.equal(body.p_tenant_id, "tenant-a");
  assert.equal(body.p_user_id, "1234567890123456789");
  assert.equal(body.p_primary_digest, "\\x" + createHash("sha256").update(Buffer.from(mainToken, "base64url")).digest("hex"));
  assert.equal(body.p_stepup_digest, "\\x" + createHash("sha256").update(Buffer.from(stepUpToken, "base64url")).digest("hex"));
  assert.equal(init.method, "POST");
});

test("missing tokens, non-admin role, RPC rejection and storage errors fail closed", async () => {
  for (const change of [
    f => { f.cookieValues.primary = undefined; },
    f => { f.cookieValues.stepup = undefined; },
    f => { f.cookieValues.stepup = "invalid"; },
    f => { f.state.role = "manager"; },
    f => { f.state.rpc = false; },
    f => { f.state.throwAt = "cookies"; },
    f => { f.state.throwAt = "database"; },
  ]) {
    const f = fixture(); change(f);
    assert.equal(await f.server.accountAccessGranted(), false);
    const response = await f.server.accountSecurityGate();
    assert.equal(response.status, 423);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});

test("signed-cookie subject must match the identity existing routes will use", async () => {
  const matching = fixture();
  assert.equal(await matching.server.accountAccessGranted(), true);
  for (const routeEmail of ["different@example.test", "", null]) {
    const f = fixture(); f.state.routeEmail = routeEmail;
    assert.equal(await f.server.accountAccessGranted(), false, String(routeEmail));
    assert.equal(f.calls.some(([path]) => path === "rpc/account_session_valid"), false);
  }
});

test("direct Account and Account-bearing Store API calls stop before any database mutation", async () => {
  const locked = Response.json({ error: "Account locked" }, { status: 423 });
  let unrelatedCalls = 0;
  const dependencies = name => {
    if (name.endsWith("account-security-server")) return { accountSecurityGate: async () => locked };
    if (name.endsWith("/legacy")) return { POST: () => { unrelatedCalls++; throw Error("legacy path called"); }, PATCH: () => { unrelatedCalls++; throw Error("legacy path called"); } };
    if (name.endsWith("/chatgpt-auth")) return { getChatGPTUser: () => { unrelatedCalls++; throw Error("authentication called after lock"); } };
    if (name.endsWith("/supabase-rest")) return { supabaseRest: () => { unrelatedCalls++; throw Error("database called after lock"); } };
    return {};
  };
  const account = load("app/api/admin/account/route.ts", dependencies);
  assert.equal((await account.GET(new Request("https://portal.example.test/api/admin/account"))).status, 423);
  const stores = load("app/api/admin/stores/route.ts", dependencies);
  const request = method => new Request("https://portal.example.test/api/admin/stores", {
    method, headers: { Origin: "https://portal.example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Store", accountSetup: {} }),
  });
  assert.equal((await stores.POST(request("POST"))).status, 423);
  assert.equal((await stores.PATCH(request("PATCH"))).status, 423);
  assert.equal(unrelatedCalls, 0);
});

test("legacy Store-only writes do not require Account step-up", async () => {
  let accountGateCalls = 0;
  const stores = load("app/api/admin/stores/route.ts", name => {
    if (name.endsWith("account-security-server")) return { accountSecurityGate: async () => { accountGateCalls++; return Response.json({error:"locked"},{status:423}); } };
    if (name.endsWith("permission-management")) return { permissionManagement: async () => ({isSuperAdmin:true}) };
    if (name.endsWith("/legacy")) return { POST: async () => Response.json({source:"legacy"}), PATCH: async () => Response.json({source:"legacy"}) };
    return {};
  });
  for (const method of ["POST","PATCH"]) {
    const response = await stores[method](new Request("https://portal.example.test/api/admin/stores", {
      method, headers:{Origin:"https://portal.example.test","Content-Type":"application/json"},
      body:JSON.stringify({name:"Store only"}),
    }));
    assert.equal(response.status,200);
    assert.equal((await response.json()).source,"legacy");
  }
  assert.equal(accountGateCalls,0);
});

test("shared Account write helpers deny direct calls before loading credentials or settings", async () => {
  const locked = Response.json({ error: "Account locked" }, { status: 423 });
  const dependencies = name => {
    if (name === "server-only") return {};
    if (name.endsWith("account-security-server")) return { accountSecurityGate: async () => locked };
    if (name.endsWith("chatgpt-auth")) return { getChatGPTUser: () => { throw Error("identity read after lock"); } };
    if (name.endsWith("supabase-rest")) return { supabaseRest: () => { throw Error("database read after lock"); } };
    return {};
  };
  const cards = load("app/account-rate-cards.ts", dependencies);
  const result = await cards.accountAdmin();
  assert.equal(result.error.status, 423);
  const settings = load("app/account-settings.ts", dependencies);
  const response = await settings.saveAccountSetting(new Request("https://portal.example.test/api/admin/account/company", { method: "PUT" }), "company");
  assert.equal(response.status, 423);
});

test("locked user administration omits Account metadata without querying billing versions", async () => {
  const queries = [];
  const dependencies = name => {
    if (name.endsWith("account-security-server")) return { accountAccessGranted: async () => false };
    if (name.endsWith("permission-management")) return {
      permissionManagement: async () => ({member:{tenant_id:"tenant-a"},storeIds:["store-a"],isSuperAdmin:true,grantableModules:[]}),
      permissionSaveError: () => Response.json({error:"unexpected permission failure"},{status:503}),
      effectivePermissionModules: () => [], manageablePermissionUser: () => true,
    };
    if (name.endsWith("chatgpt-auth")) return { getChatGPTUser: async () => ({ email: "admin@example.test" }) };
    if (name.endsWith("supabase-rest")) return { supabaseRest: async path => {
      queries.push(path);
      if (path.startsWith("customer_users?select=*&email=")) return [{ id: 1, tenant_id: "tenant-a", role: "superadmin", active: true }];
      if (path.startsWith("customer_users?select=*&tenant_id=")) return [];
      if (path.startsWith("tenant_module_permissions?")) return [];
      if (path.startsWith("stores?")) return [{ id: "store-a", name: "Store A", display_name: null, platform: "Shopee MY", bigseller_name: "Store A" }];
      throw Error("unexpected query " + path);
    } };
    if (name.endsWith("store-directory")) return { storeDirectory: async () => ({}), storeDetails: () => ({}) };
    if (name.endsWith("live-calendar-model")) return { canonicalStoreId: id => id };
    if (name.endsWith("account-ledger")) return { malaysiaDate: () => "2026-10-28" };
    if (name.endsWith("module-permissions")) return { ALL_PORTAL_MODULE_IDS: [] };
    if (name === "node:crypto") return realRequire(name);
    return {};
  };
  const users = load("app/api/admin/users/route.ts", dependencies);
  const response = await users.GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.accountSettingsAvailable, false);
  assert.equal(Object.hasOwn(data.stores[0], "accountUnit"), false);
  assert.equal(Object.hasOwn(data.stores[0], "accountUnitCount"), false);
  assert.equal(queries.some(query => query.includes("account_billing_unit_versions")), false);
});
