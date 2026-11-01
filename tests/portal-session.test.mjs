import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync("app/chatgpt-auth.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const secret = "test-only-session-secret";
let browserCookie;
const exports = {};
const mockedRequire = name => name === "next/headers"
  ? { headers: async () => new Headers(), cookies: async () => ({ get: () => browserCookie ? { value: browserCookie } : undefined }) }
  : name === "next/navigation" ? { redirect: () => { throw Error("unexpected redirect"); } }
  : name === "./portal-session-store" ? { portalSecurityEnabled: () => false }
  : name === "./deployment-isolation" ? { assertDeploymentIsolation: () => {} }
  : require(name);
new Function("require", "exports", "process", source)(mockedRequire, exports, { env: { VERCEL: "1", SUPABASE_SECRET_KEY: secret } });

function signed(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + createHmac("sha256", secret).update(encoded).digest("base64url");
}

test("old signed cookie remains valid for ordinary login but has no Account session ID", async () => {
  browserCookie = exports.createPortalSession("Owner@Example.test");
  assert.equal((await exports.getChatGPTUser())?.email, "owner@example.test");
  assert.equal(exports.readPortalSessionWithId(browserCookie), null);
  assert.equal(exports.readPasswordResetRequest(exports.createPasswordResetRequest("Owner@Example.test")), "owner@example.test");
});

test("new cookies carry independent random IDs with signed, expiring evidence", () => {
  const first = exports.createPortalSessionWithId("Owner@Example.test");
  const second = exports.createPortalSessionWithId("Owner@Example.test");
  assert.notEqual(first.sessionId, second.sessionId);
  assert.match(first.sessionId, /^[A-Za-z0-9_-]{43}$/);
  const parsed = exports.readPortalSessionWithId(first.cookie);
  assert.equal(parsed.email, "owner@example.test");
  assert.equal(parsed.sessionId, first.sessionId);
  assert.ok(parsed.expiresAt > Date.now()/1000);
});

test("tampering, expiry and invalid cookie framing fail closed", () => {
  const { cookie } = exports.createPortalSessionWithId("owner@example.test");
  const [payload, signature] = cookie.split(".");
  const invalid = [
    (payload[0] === "A" ? "B" : "A") + payload.slice(1) + "." + signature,
    payload + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1),
    cookie + ".extra", cookie + "x".repeat(1025),
    "invalid.signature", "", undefined,
    signed({ email: "owner@example.test", exp: Math.floor(Date.now()/1000) - 1, sid: exports.createPortalSessionWithId("x@example.test").sessionId }),
    signed({ email: "owner@example.test", exp: Math.floor(Date.now()/1000) + 60, sid: "not-random-id" }),
  ];
  for (const value of invalid) assert.equal(exports.readPortalSessionWithId(value), null);
});

test("malformed signed IDs and oversized input cannot authenticate ordinary portal identity", async () => {
  for (const value of [
    signed({ email: "owner@example.test", exp: Math.floor(Date.now()/1000) + 60, sid: "bad" }),
    "x".repeat(1025),
  ]) {
    browserCookie = value;
    assert.equal(await exports.getChatGPTUser(), null);
  }
});

test("enabled identity requires a persisted, valid primary session and matching proxy identity", async () => {
  const cookie = exports.createPortalSessionWithId("owner@example.test").cookie;
  const sourceWithFlag = ts.transpileModule(readFileSync("app/chatgpt-auth.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  function secured(value, valid, proxyEmail, failHeaders = false) {
    const moduleExports = {};
    const mocked = name => name === "next/headers"
      ? { headers: async () => { if (failHeaders) throw Error("headers unavailable"); return new Headers(proxyEmail ? { "oai-authenticated-user-email": proxyEmail } : {}); },
          cookies: async () => ({ get: () => value ? { value } : undefined }) }
      : name === "next/navigation" ? { redirect: () => { throw Error("unexpected redirect"); } }
      : name === "./portal-session-store"
        ? { portalSecurityEnabled: () => true, registeredPortalSessionValid: async () => valid }
        : name === "./deployment-isolation" ? { assertDeploymentIsolation: () => {} }
        : require(name);
    new Function("require", "exports", "process", sourceWithFlag)(mocked, moduleExports,
      { env: { VERCEL: proxyEmail ? undefined : "1", SUPABASE_SECRET_KEY: secret } });
    return moduleExports;
  }
  assert.equal((await secured(cookie, true).getChatGPTUser())?.email, "owner@example.test");
  assert.equal(await secured(cookie, false).getChatGPTUser(), null);
  assert.equal(await secured(exports.createPortalSession("owner@example.test"), true).getChatGPTUser(), null);
  assert.equal(await secured(cookie, true, "another@example.test").getChatGPTUser(), null);
  assert.equal(await secured(cookie, true, undefined, true).getChatGPTUser(), null);
});
