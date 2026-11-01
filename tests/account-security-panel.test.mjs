import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const React = realRequire("react");
const { act } = React;
function panelWithSecurity(security) {
  const source = ts.transpileModule(readFileSync("app/account-security-panel.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exported = {};
  new Function("require", "exports", source)(name => {
    if (name === "react" || name === "react/jsx-runtime") return realRequire(name);
    if (name.endsWith("account-security-context")) return { useAccountSecurity: () => security };
    if (name.endsWith(".css")) return {};
    throw Error("Unexpected import " + name);
  }, exported);
  return exported.AccountSecurityPanel;
}

test("unlock notice requires confirmed unlocked status; password fields clear when access state changes", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://portal.example.test" });
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldNavigator = globalThis.navigator;
  const oldFetch = globalThis.fetch, oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.requestAnimationFrame = callback => setTimeout(callback, 0);
  const security = {
    enabled: true, phase: "locked", epoch: 0,
    status: { enrolled: true, latest_request: null, is_owner: false, pending_approvals: [], unlocked: false, expires_at: null },
    refresh: async () => "unavailable", unlockConfirmed: async () => "unavailable",
    lockConfirmed: async () => "locked", lockLocal: () => {},
  };
  const Panel = panelWithSecurity(security);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  globalThis.fetch = async () => Response.json({ outcome: "unlocked" });
  try {
    await act(async () => { root.render(React.createElement(Panel)); });
    const input = dom.window.document.querySelector('input[aria-label="Account password"]') ??
      [...dom.window.document.querySelectorAll("input")].find(item => item.parentElement?.textContent.includes("Account password"));
    assert.ok(input);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "correct account password");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(input.value, "correct account password");
    await act(async () => {
      dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.match(dom.window.document.body.textContent, /unlock could not be confirmed/i);
    assert.doesNotMatch(dom.window.document.body.textContent, /Account unlocked\./);
    assert.equal(input.value, "");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "password typed while locked");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(input.value, "password typed while locked");
    security.phase = "unavailable";
    await act(async () => { root.render(React.createElement(Panel)); });
    security.phase = "locked";
    await act(async () => { root.render(React.createElement(Panel)); });
    const newInput = [...dom.window.document.querySelectorAll("input")].find(item => item.parentElement?.textContent.includes("Account password"));
    assert.equal(newInput.value, "");
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.document = oldDocument;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: oldNavigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
    dom.window.close();
  }
});
