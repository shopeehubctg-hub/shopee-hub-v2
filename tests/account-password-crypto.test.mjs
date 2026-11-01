import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("app/account-password-crypto.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("require", "exports", source)(createRequire(import.meta.url), exports);
const { hashAccountPassword, verifyAccountPassword } = exports;
const password = "Correct horse battery staple 2026";

test("correct password verifies and incorrect password fails", async () => {
  const record = await hashAccountPassword(password);
  assert.equal(await verifyAccountPassword(password, record), true);
  assert.equal(await verifyAccountPassword("Incorrect horse battery staple 2026", record), false);
  assert.equal(record.includes(password), false);
});

test("each record has an independent random salt", async () => {
  const first = await hashAccountPassword(password);
  const second = await hashAccountPassword(password);
  assert.notEqual(first, second);
  assert.notEqual(first.split("$")[5], second.split("$")[5]);
  assert.equal(await verifyAccountPassword(password, second), true);
});

test("damaged, noncanonical and parameter-tampered records fail closed", async () => {
  const record = await hashAccountPassword(password);
  const parts = record.split("$");
  const variants = [
    "", record.slice(0, -1), record + "$extra", record.replace("$v1$", "$v2$"),
    record.replace("$32768$", "$1048576$"), record.replace("$8$", "$16$"),
    record.replace("$3$", "$1$"),
    [...parts.slice(0, 5), "*" + parts[5].slice(1), parts[6]].join("$"),
    [...parts.slice(0, 6), parts[6] + "="].join("$"),
    [...parts.slice(0, 6), parts[6].slice(1)].join("$"),
  ];
  for (const variant of variants) assert.equal(await verifyAccountPassword(password, variant), false);
});

test("password input length boundaries are enforced", async () => {
  await assert.rejects(hashAccountPassword("short"), /Invalid Account password length/);
  await assert.rejects(hashAccountPassword("a".repeat(129)), /Invalid Account password length/);
  await assert.rejects(hashAccountPassword("😀".repeat(257)), /Invalid Account password length/);
  const minimum = "a".repeat(12);
  const maximum = "a".repeat(128);
  const record = await hashAccountPassword(minimum);
  assert.equal(await verifyAccountPassword(minimum, record), true);
  assert.equal(await verifyAccountPassword("short", record), false);
  assert.equal(await verifyAccountPassword("a".repeat(129), record), false);
  assert.equal(await verifyAccountPassword(maximum, await hashAccountPassword(maximum)), true);
});
