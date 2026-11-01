import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync("app/portal-session-store.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sessionId = randomBytes(32).toString("base64url");
function fixture(result = "created") {
  const calls = [];
  const state = { result, active: true, tenantActive: true, fail: false };
  const exports = {};
  const mockedRequire = name => name === "server-only" ? {} : name === "./supabase-rest" ? {
    supabaseRest: async (path, init) => {
      calls.push([path, init]);
      if (state.fail) throw Error("database unavailable");
      if (path.startsWith("customer_users?")) return [{ id: "1234567890123456789", tenant_id: "tenant-a", active: state.active }];
      if (path.startsWith("tenants?")) return [{ id: "tenant-a", active: state.tenantActive }];
      return state.result;
    },
  } : realRequire(name);
  new Function("require", "exports", "process", source)(mockedRequire, exports, { env: { SHOPEE_ACCOUNT_SECURITY_ENABLED: "1" } });
  return { store: exports, calls, state };
}

test("register uses canonical IDs, exact expiry, digest and expected RPC result", async () => {
  const { store, calls } = fixture();
  const expiresAt = Math.floor(Date.now()/1000) + 3600;
  assert.equal(await store.registerPortalSession("Admin@Example.test", sessionId, expiresAt, "password"), true);
  const [path, init] = calls.at(-1);
  assert.equal(path, "rpc/account_register_portal_session");
  const body = JSON.parse(init.body);
  assert.equal(body.p_tenant_id, "tenant-a");
  assert.equal(body.p_user_id, "1234567890123456789");
  assert.equal(body.p_auth_method, "password");
  assert.equal(body.p_expires_at, new Date(expiresAt * 1000).toISOString());
  assert.match(body.p_session_digest, /^\\x[0-9a-f]{64}$/);
  assert.match(body.p_request_id, /^[0-9a-f-]{36}$/);
});

test("validation, inactive principal, unexpected RPC result and storage failures deny registration", async () => {
  const expiry = Math.floor(Date.now()/1000) + 3600;
  for (const change of [
    f => { f.state.active = false; }, f => { f.state.tenantActive = false; },
    f => { f.state.result = "denied"; }, f => { f.state.fail = true; },
  ]) {
    const f = fixture(); change(f);
    assert.equal(await f.store.registerPortalSession("admin@example.test", sessionId, expiry, "email_link"), false);
  }
  const { store, calls } = fixture();
  assert.equal(await store.registerPortalSession("admin@example.test", "bad", expiry, "password"), false);
  assert.equal(await store.registerPortalSession("admin@example.test", sessionId, 0, "password"), false);
  assert.deepEqual(calls, []);
});

test("primary validation and logout are based on persistent RPC results", async () => {
  const f = fixture(true);
  assert.equal(await f.store.registeredPortalSessionValid("admin@example.test", sessionId), true);
  assert.equal(f.calls.at(-1)[0], "rpc/account_portal_session_valid");
  f.state.result = false;
  assert.equal(await f.store.registeredPortalSessionValid("admin@example.test", sessionId), false);
  f.state.result = "revoked";
  f.state.active = false;
  assert.equal(await f.store.revokePortalSession("admin@example.test", sessionId), true);
  assert.equal(f.calls.at(-1)[0], "rpc/account_revoke_portal_session");
  f.state.result = "already_revoked";
  assert.equal(await f.store.revokePortalSession("admin@example.test", sessionId), true);
  f.state.result = "unavailable";
  assert.equal(await f.store.revokePortalSession("admin@example.test", sessionId), false);
});
