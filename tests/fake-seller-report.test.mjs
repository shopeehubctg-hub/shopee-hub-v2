import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(join(root, "app/fake-seller-report.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const temporaryDirectory = await mkdtemp(join(root, ".fake-seller-test-"));
const compiledPath = join(temporaryDirectory, "fake-seller-report.cjs");
await writeFile(compiledPath, compiled);
const { FakeSellerReport } = createRequire(import.meta.url)(compiledPath);

test.after(async () => rm(temporaryDirectory, { recursive: true, force: true }));

test("shows an honest empty state without case data", () => {
  for (const cases of [undefined, []]) {
    const html = renderToStaticMarkup(createElement(FakeSellerReport, { storeName: "Mizino Premium", allStores: false, cases }));
    assert.match(html, /No reports available/);
    assert.doesNotMatch(html, /Cases submitted|Success rate|Most recent case submitted|Source:|2152420/);
  }
});

test("renders supplied cases and their actual submission date", () => {
  const cases = [{
    caseId: "real-case-1", store: "Mizino Premium", brand: "Mizino", region: "Malaysia",
    createdAt: "2026-09-24", status: "Approved", sellerCount: 2, listingCount: 3, approvedListings: 2,
  }];
  const html = renderToStaticMarkup(createElement(FakeSellerReport, { storeName: "Mizino Premium", allStores: false, cases }));
  assert.match(html, /Most recent case submitted 24 Sept? 2026/);
  assert.match(html, /#real-case-1/);
  assert.match(html, /Cases submitted/);
  assert.doesNotMatch(html, /No reports available|Source:|portalSnapshot/);
});
