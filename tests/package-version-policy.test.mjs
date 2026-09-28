import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/package-version-policy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace("export function", "function"), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const blocksNewVersionForUnsyncedSheet = new Function(`${compiled}; return blocksNewVersionForUnsyncedSheet;`)();
const now = Date.parse("2026-09-29T10:00:00Z");
const recent = "2026-09-29T09:59:00Z";
const stale = "2026-09-28T03:46:49Z";

test("edited drafts can publish after a failed or stale Sheet sync", () => {
  for (const status of ["draft", "review"]) {
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "failed", recent, "publish", now), false);
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "pending", stale, "publish", now), false);
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "not_sent", recent, "publish", now), false);
  }
});

test("an in-flight draft sync remains protected from a concurrent new version", () => {
  for (const status of ["draft", "review"]) {
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "pending", recent, "publish", now), true);
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "pending", undefined, "publish", now), true);
  }
});

test("published packages must retry unsynced versions first", () => {
  for (const status of ["active", "scheduled", "expired"]) {
    for (const sync of ["pending", "failed"]) {
      assert.equal(blocksNewVersionForUnsyncedSheet(status, sync, recent, "publish", now), true);
    }
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "synced", recent, "publish", now), false);
  }
});
