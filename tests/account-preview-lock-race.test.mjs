import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);
const React = realRequire("react");
const { act } = React;
function loadProvider(security) {
  const source = ts.transpileModule(readFileSync("app/fee-plan-context.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exported = {};
  new Function("require", "exports", source)(name => {
    if (name === "react" || name === "react/jsx-runtime") return realRequire(name);
    if (name.endsWith("account-security-context")) return { useAccountSecurity: () => security };
    if (name.endsWith("fee-preview-currency")) return {
      sourceProjectRate: () => undefined, projectFeeCurrency: row => row.currency,
      calculateProjectPreview: () => undefined,
    };
    if (name.endsWith("fee-plan-model")) return {
      archiveRateCard: () => [], planForMonth: () => undefined, validatePlan: value => value,
    };
    throw Error("Unexpected import " + name);
  }, exported);
  return exported;
}

test("save pending, then lock: a late callback cannot restore Account preview memory", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://portal.example.test" });
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldNavigator = globalThis.navigator;
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const security = {
    enabled: true, phase: "unlocked", epoch: 0,
    isCurrentAccess: candidate => security.phase === "unlocked" && candidate === security.epoch,
  };
  const { FeePlansProvider, useFeePlans } = loadProvider(security);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  let context;
  function Reader() { context = useFeePlans(); return React.createElement("output", null, JSON.stringify(context.previewMemory)); }
  const render = () => React.createElement(FeePlansProvider, { persistent: false }, React.createElement(Reader));
  try {
    await act(async () => { root.render(render()); });
    await act(async () => { context.setPreviewMemory({ "fee-preview-amounts": { unit: "1000" } }); });
    assert.match(dom.window.document.body.textContent, /1000/);
    const staleSetter = context.setPreviewMemory;
    let resolveSave;
    const serverResponse = new Promise(resolve => { resolveSave = resolve; });
    const pendingSave = serverResponse.then(() =>
      staleSetter(previous => ({ ...previous, "fee-preview-amounts": { unit: "9999" } })));
    security.phase = "locked"; security.epoch = 1;
    await act(async () => { root.render(render()); });
    assert.equal(dom.window.document.body.textContent, "{}");
    await act(async () => { resolveSave(); await pendingSave; });
    security.phase = "unlocked";
    await act(async () => { root.render(render()); });
    assert.equal(dom.window.document.body.textContent, "{}");
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.window = oldWindow; globalThis.document = oldDocument;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: oldNavigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
    dom.window.close();
  }
});
