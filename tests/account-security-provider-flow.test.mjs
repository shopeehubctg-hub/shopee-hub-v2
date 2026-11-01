import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const React = realRequire("react");
const { act } = React;
function loadComponent(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exported = {};
  new Function("require", "exports", source)(name => {
    if (name === "react" || name === "react/jsx-runtime") return realRequire(name);
    if (name.endsWith(".css")) return {};
    if (name in dependencies) return dependencies[name];
    throw Error("Unexpected import " + name);
  }, exported);
  return exported;
}
const context = loadComponent("app/account-security-context.tsx");
const { AccountSecurityPanel } = loadComponent("app/account-security-panel.tsx", {
  "./account-security-context": context,
});
const lockedStatus = {
  enabled: true, enrolled: true, credential_version: "1", latest_request: null,
  is_owner: false, pending_approvals: [], unlocked: false, expires_at: null,
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function renderCase(nextGet, initialGet = lockedStatus, submitUnlock = true) {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://portal.example.test" });
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldNavigator = globalThis.navigator;
  const oldFetch = globalThis.fetch, oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.requestAnimationFrame = callback => setTimeout(callback, 0);
  let getCount = 0, postCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "/api/account-security" && options.method === "POST") {
      postCount++;
      return Response.json({ outcome: "unlocked" });
    }
    if (String(url) === "/api/account-security") {
      getCount++;
      return getCount === 1 ? Response.json(initialGet) : nextGet();
    }
    throw Error("Unexpected fetch " + url);
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  function FinancialChild() {
    const security = context.useAccountSecurity();
    return security.phase === "unlocked" ? React.createElement("div", null, "SENSITIVE ACCOUNT DATA") : null;
  }
  function App() {
    return React.createElement(context.AccountSecurityProvider, { enabled: true },
      React.createElement(AccountSecurityPanel), React.createElement(FinancialChild));
  }
  try {
    await act(async () => { root.render(React.createElement(App)); await tick(); });
    if (submitUnlock) {
      const input = [...dom.window.document.querySelectorAll("input")].find(item => item.parentElement?.textContent.includes("Account password"));
      assert.ok(input, dom.window.document.body.textContent);
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "correct account password");
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await act(async () => {
        dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        await tick();
      });
    }
    return { text: dom.window.document.body.textContent, postCount, getCount };
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.document = oldDocument;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: oldNavigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
    dom.window.close();
  }
}

test("real provider keeps financial child hidden when unlock POST succeeds but status GET fails", async () => {
  const result = await renderCase(() => Response.json({ error: "unavailable" }, { status: 503 }));
  assert.equal(result.postCount, 1);
  assert.ok(result.getCount >= 2);
  assert.match(result.text, /unlock could not be confirmed/i);
  assert.doesNotMatch(result.text, /Account unlocked\.|SENSITIVE ACCOUNT DATA/);
});

test("real provider keeps financial child hidden when unlock status is locked or expired", async () => {
  for (const next of [
    lockedStatus,
    { ...lockedStatus, unlocked: true, expires_at: "2020-01-01T00:00:00Z" },
  ]) {
    const result = await renderCase(() => Response.json(next));
    assert.equal(result.postCount, 1);
    assert.match(result.text, /unlock could not be confirmed/i);
    assert.doesNotMatch(result.text, /Account unlocked\.|SENSITIVE ACCOUNT DATA/);
  }
});

test("an approved request past its expiry gives a new-request path, not setup guidance", async () => {
  const expired = {
    ...lockedStatus,
    latest_request: {
      id: "e0e11ed8-bb34-4e8b-91b2-651699eae9f5", purpose: "reset", status: "approved",
      requested_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-01T00:30:00Z",
      credential_version: "1", session_matches: true,
    },
  };
  const result = await renderCase(() => Response.json(expired), expired, false);
  assert.match(result.text, /request has expired/i);
  assert.match(result.text, /Request password reset/);
  assert.doesNotMatch(result.text, /Set your Account password/);
});

test("a request from another Dashboard session explains the available retry and possible wait", async () => {
  const mismatch = {
    ...lockedStatus,
    latest_request: {
      id: "e0e11ed8-bb34-4e8b-91b2-651699eae9f5", purpose: "reset", status: "approved",
      requested_at: "2026-10-28T00:00:00Z", expires_at: "2099-01-01T00:00:00Z",
      credential_version: "1", session_matches: false,
    },
  };
  const result = await renderCase(() => Response.json(mismatch), mismatch, false);
  assert.match(result.text, /can try a new request/i);
  assert.match(result.text, /if that session is still active/i);
  assert.match(result.text, /Request password reset/);
  assert.doesNotMatch(result.text, /Set your Account password/);
});
