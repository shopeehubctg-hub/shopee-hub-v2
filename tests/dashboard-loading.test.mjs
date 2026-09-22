import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

test("initial dashboard HTML contains only loading UI, with no full-access content or fixed email", async () => {
  const directory = await mkdtemp(fileURLToPath(new URL("../node_modules/.dashboard-render-", import.meta.url)));
  try {
    const outfile = join(directory, "page.mjs");
    await promisify(execFile)(fileURLToPath(new URL("../node_modules/.bin/esbuild", import.meta.url)), [fileURLToPath(new URL("../app/page.tsx", import.meta.url)), `--outfile=${outfile}`, "--bundle", "--platform=node", "--format=esm", "--packages=external", "--jsx=automatic", "--log-level=silent"]);
    const { default:Dashboard } = await import(outfile);
    const html = renderToStaticMarkup(createElement(Dashboard));
    assert.match(html, /Loading your dashboard/);
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /Permission Settings|Super Admin access|shopeehub\.ctg@gmail\.com|Business Pulse|J Packaging|<nav|<select/);
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
});
