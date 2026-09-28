import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/package-version-policy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace("export function", "function"), {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const blocksNewVersionForUnsyncedSheet = new Function(`${compiled}; return blocksNewVersionForUnsyncedSheet;`)();

test("an unpublished draft can publish edited content despite an old unsynced attempt", () => {
  for (const status of ["draft", "review"]) {
    for (const sync of ["pending", "failed", "not_sent", "synced"]) {
      assert.equal(blocksNewVersionForUnsyncedSheet(status, sync, "publish"), false);
    }
  }
});

test("a published package must retry an unsynced version before adding another", () => {
  for (const status of ["active", "scheduled", "expired"]) {
    for (const sync of ["pending", "failed"]) {
      assert.equal(blocksNewVersionForUnsyncedSheet(status, sync, "publish"), true);
      assert.equal(blocksNewVersionForUnsyncedSheet(status, sync, "draft"), false);
    }
    assert.equal(blocksNewVersionForUnsyncedSheet(status, "synced", "publish"), false);
  }
});
