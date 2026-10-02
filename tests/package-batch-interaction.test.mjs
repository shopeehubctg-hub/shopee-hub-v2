import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import React, { act } from "react";

const buildDir = new URL("../node_modules/.package-batch-test/", import.meta.url);
await mkdir(buildDir, { recursive: true });
await build({
  entryPoints: [new URL("../app/package-control.tsx", import.meta.url).pathname],
  outfile: new URL("package-control.mjs", buildDir).pathname,
  bundle: true, format: "esm", platform: "browser", jsx: "automatic",
  packages: "external", logLevel: "silent",
});
const { PackageControl } = await import(pathToFileURL(new URL("package-control.mjs", buildDir).pathname));

async function setup(prefills, postResponses, packages = [], { accumulateSaved = false, storageKey, storedBatch } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://local.test/" });
  if (storageKey && storedBatch) dom.window.localStorage.setItem(storageKey, JSON.stringify(storedBatch));
  const globals = ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent", "crypto", "fetch"];
  const previous = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const replacements = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
    crypto: dom.window.crypto,
  };
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const posts = [];
  const savedPackages = [...packages];
  let refreshFails = false;
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url, options = {}) => {
    if (options.method === "POST") {
      const request = JSON.parse(options.body);
      posts.push(request);
      const queued = postResponses.shift();
      const next = typeof queued === "function" ? queued({ dom, request }) : queued;
      if (next instanceof Error) throw next;
      if (accumulateSaved && (next.ok || next.body?.savedAsDraft)) savedPackages.unshift({
        id: next.body.packageId, storeId: "test-store", packageSku: request.platforms[0].packageSku,
        name: request.name, market: "MY", status: "draft", version: next.body.version,
        promotionType: "monthly", originalPrice: 100000, sellingPrice: 8000,
        effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31",
        components: request.components, platforms: request.platforms, priceSchedules: [], history: [],
      });
      return { ok: next.ok, status: next.status ?? (next.ok ? 201 : 500), json: async () => next.body };
    }
    if (refreshFails) throw new Error("list refresh unavailable");
    return { ok: true, json: async () => ({ packages: [...savedPackages], source: "database", canDelete: false }) };
  }});
  const { createRoot } = await import("react-dom/client");
  const reactRoot = createRoot(dom.window.document.getElementById("root"));
  return {
    dom, posts,
    failRefresh: () => { refreshFails = true; },
    render: async () => act(async () => { reactRoot.render(React.createElement(PackageControl, { storeId: "test-store", storeName: "Test Store", prefills, draftStorageKey: storageKey })); }),
    cleanup: async () => {
      await act(async () => reactRoot.unmount());
      for (const key of globals) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
        else delete globalThis[key];
      }
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    },
  };
}

function prefill(index) {
  const name = `QA Package ${index}`;
  const snapshot = scenario => ({
    source: "Shopee Pricing Calculator", packageName: name, category: "Beauty",
    serviceScenario: scenario, facebookPrice: 100, suggestedShopeePrice: 80 + index,
    customerVoucherPrice: 80 + index, commissionRate: 0, serviceRate: 0,
    actualPayout: 80 + index,
  });
  return ["Non-Campaign Day", "Campaign Day"].map((scenario, offset) => ({
    requestId: index * 2 + offset, name, sellingPrice: 80 + index,
    calculatorSettings: snapshot(scenario),
  }));
}

function input(dom, selector, value) {
  const element = dom.window.document.querySelector(selector);
  assert.ok(element, `Missing input: ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function click(dom, label) {
  const button = [...dom.window.document.querySelectorAll("button")].find(node => node.textContent.includes(label));
  assert.ok(button, `Missing button: ${label}`);
  button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}

async function completeCurrentForm(dom, index) {
  await act(async () => {
    input(dom, 'input[aria-label="Shopee Listing 1 SKU"]', `QA-SKU-${index}`);
    const sections = dom.window.document.querySelectorAll(".scenario-editor");
    assert.equal(sections.length, 2);
    input(dom, '.scenario-editor.nonCampaign input[type="number"]', "1000");
    input(dom, '.scenario-editor.campaign input[type="number"]', "1000");
    input(dom, '.scenario-editor.nonCampaign input[type="month"]', "2026-10");
    input(dom, '.scenario-editor.campaign input[type="month"]', "2026-10");
    input(dom, '.component-row input', `QA-ITEM-${index}`);
    input(dom, '.component-row input:nth-of-type(2)', "Test item");
  });
}

test("large calculator batch saves drafts one at a time and advances only after a response", async () => {
  const prefills = Array.from({ length: 35 }, (_, index) => prefill(index)).flat();
  const harness = await setup(prefills, Array.from({ length: 35 }, (_, index) => ({ ok: true, body: { version: 1, packageId: `draft-${index}` } })), [], { accumulateSaved: true });
  try {
    await harness.render();
    for (let index = 0; index < 35; index++) {
      assert.match(harness.dom.window.document.body.textContent, new RegExp(`QA Package ${index}`));
      await completeCurrentForm(harness.dom, index);
      await act(async () => click(harness.dom, "Save Draft"));
      assert.equal(harness.posts.length, index + 1);
      assert.equal(harness.posts[index].name, `QA Package ${index}`);
      assert.equal(harness.posts[index].mode, "draft");
    }
    assert.equal(harness.dom.window.document.querySelector(".package-modal"), null);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(harness.dom.window.document.body.textContent, /Total Packages35/);
    assert.equal(harness.dom.window.document.querySelectorAll(".package-card").length, 30);
  } finally { await harness.cleanup(); }
});

test("failed save keeps the current package for retry and list refresh failure is recoverable", async () => {
  const harness = await setup([...prefill(0), ...prefill(1)], [
    { ok: false, status: 500, body: { error: "Temporary failure" } },
    { ok: true, body: { version: 1, packageId: "draft-0" } },
  ]);
  try {
    await harness.render();
    await completeCurrentForm(harness.dom, 0);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 0/);
    assert.match(harness.dom.window.document.querySelector("[role=alert]").textContent, /Temporary failure/);
    harness.failRefresh();
    await act(async () => click(harness.dom, "Save Draft"));
    assert.equal(harness.posts[0].clientRequestId, harness.posts[1].clientRequestId);
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 1/);
    assert.match(harness.dom.window.document.body.textContent, /Package saved, but the list could not be refreshed/);
  } finally { await harness.cleanup(); }
});

test("a large package list renders in pages without dropping rows", async () => {
  const packages = Array.from({ length: 120 }, (_, index) => ({
    id: `package-${index}`, storeId: "test-store", packageSku: `SKU-${index}`,
    name: `Stored Package ${index}`, market: "MY", status: "draft", version: 1,
    promotionType: "monthly", originalPrice: 10000, sellingPrice: 8000,
    effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31",
    components: [{ inventorySku: `ITEM-${index}`, name: "Test item", quantity: 1, kind: "product" }],
    platforms: [{ platform: "Shopee", packageSku: `SKU-${index}` }],
    priceSchedules: [], history: [],
  }));
  const harness = await setup([], [], packages);
  try {
    await harness.render();
    assert.equal(harness.dom.window.document.querySelectorAll(".package-card").length, 30);
    for (const expected of [60, 90, 120]) {
      await act(async () => click(harness.dom, "Show more packages"));
      assert.equal(harness.dom.window.document.querySelectorAll(".package-card").length, expected);
    }
    assert.equal(harness.dom.window.document.querySelector(".package-load-more"), null);
    assert.match(harness.dom.window.document.body.textContent, /Stored Package 119/);
  } finally { await harness.cleanup(); }
});

test("an ambiguous network failure can be retried without changing the request identity", async () => {
  const harness = await setup([...prefill(0), ...prefill(1)], [
    new Error("response lost after save"),
    { ok: true, body: { version: 1, packageId: "draft-0" } },
  ]);
  try {
    await harness.render();
    await completeCurrentForm(harness.dom, 0);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 0/);
    assert.match(harness.dom.window.document.querySelector("[role=alert]").textContent, /could not reach the server/);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.equal(harness.posts[0].clientRequestId, harness.posts[1].clientRequestId);
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 1/);
  } finally { await harness.cleanup(); }
});

test("a server-confirmed draft advances even when publishing returns 503", async () => {
  const harness = await setup([...prefill(0), ...prefill(1)], [
    { ok: false, status: 503, body: { savedAsDraft: true, packageId: "draft-0", version: 1, error: "Saved as draft; Sheet sync unavailable" } },
  ]);
  try {
    await harness.render();
    await completeCurrentForm(harness.dom, 0);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.equal(harness.posts.length, 1);
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 1/);
    assert.match(harness.dom.window.document.body.textContent, /Saved as draft; Sheet sync unavailable/);
  } finally { await harness.cleanup(); }
});

test("a saved batch resumes at the next package with its request identity after reload", async () => {
  const prefills = [...prefill(0), ...prefill(1)];
  const storageKey = "package-draft:qa-batch";
  const first = await setup(prefills, [{ ok: true, body: { version: 1, packageId: "draft-0" } }], [], {
    storageKey, storedBatch: { prefills, storeId: "test-store" },
  });
  let checkpoint;
  try {
    await first.render();
    await completeCurrentForm(first.dom, 0);
    await act(async () => click(first.dom, "Save Draft"));
    checkpoint = JSON.parse(first.dom.window.localStorage.getItem(storageKey));
    assert.equal(checkpoint.prefills.length, 2);
    assert.equal(checkpoint.prefills[0].name, "QA Package 1");
    assert.equal(checkpoint.requestIds["qa package 0"], first.posts[0].clientRequestId);
    assert.ok(checkpoint.requestIds["qa package 1"]);
  } finally { await first.cleanup(); }

  const resumed = await setup(checkpoint.prefills, [{ ok: true, body: { version: 1, packageId: "draft-1" } }], [], {
    storageKey, storedBatch: checkpoint,
  });
  try {
    await resumed.render();
    await completeCurrentForm(resumed.dom, 1);
    await act(async () => click(resumed.dom, "Save Draft"));
    assert.equal(resumed.posts[0].clientRequestId, checkpoint.requestIds["qa package 1"]);
    assert.equal(resumed.dom.window.localStorage.getItem(storageKey), null);
  } finally { await resumed.cleanup(); }
});

test("a vanished storage record after server save is rebuilt and retried without a duplicate request", async () => {
  const prefills = [...prefill(0), ...prefill(1)];
  const storageKey = "package-draft:storage-interruption";
  const harness = await setup(prefills, [
    ({ dom }) => {
      dom.window.localStorage.removeItem(storageKey);
      return { ok: true, body: { version: 1, packageId: "draft-0" } };
    },
    { ok: true, body: { version: 1, packageId: "draft-0" } },
  ], [], { storageKey, storedBatch: { prefills, storeId: "test-store" } });
  try {
    await harness.render();
    await completeCurrentForm(harness.dom, 0);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 0/);
    assert.match(harness.dom.window.document.body.textContent, /Browser storage could not record the batch progress/);
    await act(async () => click(harness.dom, "Save Draft"));
    assert.equal(harness.posts[0].clientRequestId, harness.posts[1].clientRequestId);
    assert.match(harness.dom.window.document.querySelector(".package-modal").textContent, /QA Package 1/);
    assert.equal(JSON.parse(harness.dom.window.localStorage.getItem(storageKey)).prefills[0].name, "QA Package 1");
  } finally { await harness.cleanup(); }
});
