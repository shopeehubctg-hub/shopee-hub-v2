import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/account-display.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { accountMoney } = exports;

test("unknown income stays unknown while known zero is shown as zero", () => {
  assert.equal(accountMoney(null, "MYR"), "—");
  assert.equal(accountMoney("0.00", "MYR"), "RM 0.00");
});

test("currency amounts remain separate and exact without float rounding", () => {
  assert.equal(accountMoney("1234567.89", "MYR"), "RM 1,234,567.89");
  assert.equal(accountMoney("1234567.89", "SGD"), "S$ 1,234,567.89");
  assert.equal(accountMoney("0.345", "SGD"), "S$ 0.345");
});
