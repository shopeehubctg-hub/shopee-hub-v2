import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, mockedRequire) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", source)(mockedRequire, exports);
  return exports;
}
function fixture(path, approved = true, role = "customer") {
  const events = [];
  const jar = { get: () => ({ value: "new-cookie" }), set: (...args) => events.push(["cookie", ...args]) };
  const mocks = name => {
    if (name === "next/headers") return { cookies: async () => jar };
    if (name.endsWith("chatgpt-auth")) return {
      createPortalSession: () => "legacy-cookie",
      createPortalSessionWithId: () => ({ cookie: "new-cookie", sessionId: "random-id", expiresAt: 9999999999 }),
      readPortalSessionWithId: () => ({ email: "admin@example.test", sessionId: "random-id" }),
      PORTAL_SESSION_COOKIE: "portal",
    };
    if (name.endsWith("portal-session-store")) return {
      portalSecurityEnabled: () => true,
      registerPortalSession: async (...args) => { events.push(["register", ...args]); return approved; },
      revokePortalSession: async (...args) => { events.push(["revoke", ...args]); return approved; },
    };
    if (name.endsWith("supabase-rest")) return {
      supabaseConfig: () => ({ url: "https://auth.example.test", secret: "test-secret" }),
      supabaseRest: async () => [{ active: true, role }],
    };
    throw Error("unexpected import " + name);
  };
  return { route: load(path, mocks), events };
}

test("password login and email-link session register before issuing a cookie", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => Response.json(url.includes("/auth/v1/user") ? { email: "admin@example.test" } : { access_token: "ok" });
  try {
    for (const [path, body, method] of [
      ["app/api/auth/login/route.ts", { email: "admin@example.test", password: "dashboard-password" }, "password"],
      ["app/api/auth/session/route.ts", { accessToken: "user-token" }, "email_link"],
    ]) {
      const { route, events } = fixture(path);
      const response = await route.POST(new Request("https://portal.example.test/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, 200, path);
      assert.equal(events[0][0], "register", path);
      assert.equal(events[0].at(-1), method, path);
      assert.equal(events[1][0], "cookie", path);
      assert.equal(events[1][2], "new-cookie", path);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("registration failure cannot issue a cookie; Super Admin password self-reset remains denied", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => Response.json(url.includes("/auth/v1/user") ? { email: "admin@example.test" } : { access_token: "ok" });
  try {
    for (const [path, body] of [
      ["app/api/auth/login/route.ts", { email: "admin@example.test", password: "dashboard-password" }],
      ["app/api/auth/session/route.ts", { accessToken: "user-token" }],
    ]) {
      const { route, events } = fixture(path, false);
      const response = await route.POST(new Request("https://portal.example.test/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, 503, path);
      assert.equal(events.some(event => event[0] === "cookie"), false, path);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("logout revokes persistently before clearing cookies and keeps the cookie on failure", async () => {
  const successful = fixture("app/api/auth/session/route.ts");
  assert.equal((await successful.route.DELETE()).status, 200);
  assert.equal(successful.events[0][0], "revoke");
  assert.equal(successful.events.filter(event => event[0] === "cookie").length, 2);
  const failed = fixture("app/api/auth/session/route.ts", false);
  assert.equal((await failed.route.DELETE()).status, 503);
  assert.deepEqual(failed.events.map(event => event[0]), ["revoke"]);
});
