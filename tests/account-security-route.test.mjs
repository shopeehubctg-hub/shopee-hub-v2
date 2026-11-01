import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const challengeId = "e0e11ed8-bb34-4e8b-91b2-651699eae9f5";
function fixture({ enabled = true, owner = false, approved = false, rpcFailure = false } = {}) {
  const events = [];
  const values = { portal: "signed", stepup: randomBytes(32).toString("base64url") };
  const status = {
    enrolled: approved, credential_version: "9007199254740993",
    latest_request: approved ? {
      id: challengeId, purpose: "reset", status: "approved",
      requested_at: "2026-10-28T01:00:00Z", expires_at: "2099-01-01T00:00:00Z",
      credential_version: "9007199254740993", session_matches: true,
    } : null,
    is_owner: owner, pending_approvals: owner ? [{
      id: challengeId, target_user_id: "99", target_email: "target@example.test",
      purpose: "enroll", requested_at: "2026-10-28T01:00:00Z", expires_at: "2099-01-01T00:00:00Z",
    }] : [],
    unlocked: false, expires_at: null,
  };
  const state = { passwordValid: true, reserveAllowed: true, finish: "succeeded", lock: "locked", status };
  const jar = {
    get: name => name === "portal" ? { value: values.portal } : name === "stepup" ? { value: values.stepup } : undefined,
    set: (...args) => events.push(["cookie", ...args]),
  };
  const mocks = name => {
    if (name === "node:crypto") return realRequire(name);
    if (name === "next/headers") return { cookies: async () => jar };
    if (name.endsWith("account-password-crypto")) return {
      hashAccountPassword: async password => { events.push(["hash", password]); return "scrypt$test"; },
      verifyAccountPassword: async (password, hash) => { events.push(["verifyAccount", hash]); return password === "correct account password"; },
    };
    if (name.endsWith("account-security-server")) return {
      ACCOUNT_STEPUP_COOKIE: "stepup", accountSecurityEnabled: () => enabled,
    };
    if (name.endsWith("chatgpt-auth")) return {
      PORTAL_SESSION_COOKIE: "portal",
      readPortalSessionWithId: value => value === "signed"
        ? { email: "admin@example.test", sessionId: "A".repeat(43), expiresAt: 4102444800 } : null,
      getChatGPTUser: async () => ({ email: "admin@example.test" }),
    };
    if (name.endsWith("supabase-rest")) return {
      supabaseConfig: () => ({ url: "https://auth.example.test", secret: "test-secret" }),
      supabaseRest: async (path, init) => {
        const body = init?.body ? JSON.parse(init.body) : null;
        events.push(["db", path, body]);
        if (rpcFailure && path === "rpc/account_lock_session") throw Error("storage unavailable");
        if (path.startsWith("customer_users?")) return [{ id: "1234567890123456789", tenant_id: "tenant-a", role: "superadmin", active: true }];
        if (path.startsWith("tenants?")) return [{ id: "tenant-a", active: true }];
        if (path === "rpc/account_security_status") return state.status;
        if (path === "rpc/account_request_challenge") return "pending";
        if (path === "rpc/account_decide_challenge") return "approved";
        if (path === "rpc/account_consume_challenge") return "ok";
        if (path === "rpc/account_reserve_attempt") return [{
          allowed: state.reserveAllowed, attempt_id: body.p_attempt_id, password_hash: "scrypt$old",
        }];
        if (path === "rpc/account_finish_attempt") return body.p_verified ? state.finish : "failed";
        if (path === "rpc/account_lock_session") return state.lock;
        throw Error("Unexpected path " + path);
      },
    };
    throw Error("Unexpected import " + name);
  };
  const source = ts.transpileModule(readFileSync("app/api/account-security/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const route = {};
  new Function("require", "exports", source)(mocks, route);
  return { route, events, state, values };
}
function request(action, body = {}) {
  return new Request("https://portal.example.test/api/account-security", {
    method: "POST", headers: { origin: "https://portal.example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
}

test("feature off and status read do not expose credentials or financial data", async () => {
  const off = fixture({ enabled: false });
  assert.deepEqual(await off.route.GET().then(response => response.json()), { enabled: false });
  assert.equal(off.events.length, 0);
  const on = fixture({ owner: true });
  const response = await on.route.GET();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.is_owner, true);
  assert.equal(body.pending_approvals.length, 1);
  assert.equal(JSON.stringify(body).includes("password_hash"), false);
});

test("request binds target to registered current user and bounds expiry", async () => {
  const f = fixture();
  const response = await f.route.POST(request("request", { purpose: "enroll", targetUserId: "99" }));
  assert.equal(response.status, 200);
  const rpc = f.events.find(event => event[1] === "rpc/account_request_challenge")[2];
  assert.equal(rpc.p_target_user_id, "1234567890123456789");
  assert.equal(rpc.p_tenant_id, "tenant-a");
  assert.ok(Date.parse(rpc.p_expires_at) <= Date.now() + 29 * 60_000);
});

test("only bound owner can decide and each decision rechecks Dashboard password", async () => {
  const nonowner = fixture();
  assert.equal((await nonowner.route.POST(request("decide", {
    challengeId, decision: "approve", dashboardPassword: "dashboard password",
  }))).status, 403);
  assert.equal(nonowner.events.some(event => event[1] === "rpc/account_decide_challenge"), false);
  const owner = fixture({ owner: true });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { owner.events.push(["dashboard-auth"]); return new Response(null, { status: 401 }); };
  try {
    assert.equal((await owner.route.POST(request("decide", {
      challengeId, decision: "approve", dashboardPassword: "wrong password",
    }))).status, 401);
    assert.equal(owner.events.some(event => event[1] === "rpc/account_decide_challenge"), false);
    globalThis.fetch = async () => { owner.events.push(["dashboard-auth"]); return Response.json({ ok: true }); };
    assert.equal((await owner.route.POST(request("decide", {
      challengeId, decision: "approve", dashboardPassword: "correct password",
    }))).status, 200);
    assert.ok(owner.events.findIndex(event => event[0] === "dashboard-auth") <
      owner.events.findIndex(event => event[1] === "rpc/account_decide_challenge"));
  } finally { globalThis.fetch = oldFetch; }
});

test("setup rejects equal passwords before hash or consume and preserves decimal version string", async () => {
  const f = fixture({ approved: true });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true });
  try {
    assert.equal((await f.route.POST(request("setup", {
      challengeId, dashboardPassword: "same long password", newAccountPassword: "same long password",
    }))).status, 400);
    assert.equal(f.events.some(event => event[0] === "hash"), false);
    assert.equal((await f.route.POST(request("setup", {
      challengeId, dashboardPassword: "dashboard password", newAccountPassword: "distinct account password",
    }))).status, 200);
    const consume = f.events.find(event => event[1] === "rpc/account_consume_challenge")[2];
    assert.equal(consume.p_expected_credential_version, "9007199254740993");
    assert.equal(consume.p_new_password_hash, "scrypt$test");
  } finally { globalThis.fetch = oldFetch; }
});

test("unlock reserves before verification and issues cookie only after successful finish", async () => {
  const f = fixture({ approved: true });
  assert.equal((await f.route.POST(request("unlock", { accountPassword: "correct account password" }))).status, 200);
  const reserve = f.events.findIndex(event => event[1] === "rpc/account_reserve_attempt");
  const verify = f.events.findIndex(event => event[0] === "verifyAccount");
  const finish = f.events.findIndex(event => event[1] === "rpc/account_finish_attempt");
  const cookie = f.events.findIndex(event => event[0] === "cookie");
  assert.ok(reserve < verify && verify < finish && finish < cookie);
  const stepupCookie = f.events[cookie];
  assert.ok(stepupCookie[3].maxAge > 15 * 60);
  assert.ok(stepupCookie[3].maxAge <= 7 * 24 * 60 * 60);
  const wrong = fixture({ approved: true });
  assert.equal((await wrong.route.POST(request("unlock", { accountPassword: "wrong account password" }))).status, 401);
  assert.equal(wrong.events.some(event => event[0] === "cookie"), false);
});

test("lock revokes current step-up before cookie clear and keeps cookie on storage failure", async () => {
  const f = fixture({ approved: true });
  assert.equal((await f.route.POST(request("lock"))).status, 200);
  assert.ok(f.events.findIndex(event => event[1] === "rpc/account_lock_session") <
    f.events.findIndex(event => event[0] === "cookie"));
  const failed = fixture({ approved: true, rpcFailure: true });
  assert.equal((await failed.route.POST(request("lock"))).status, 503);
  assert.equal(failed.events.some(event => event[0] === "cookie"), false);
});
