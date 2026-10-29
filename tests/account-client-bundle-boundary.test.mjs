import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("Account client dependency graph excludes source mappings and server seed rates", async () => {
  const result = await build({
    entryPoints: ["app/account-panel.tsx", "app/fee-plan-context.tsx", "app/fee-plans-preview.tsx"],
    bundle: true, write: false, outdir: "unused-output", metafile: true, platform: "browser", format: "esm",
    external: ["react", "react-dom"], loader: { ".css": "empty" },
  });
  const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll("\\", "/"));
  assert.equal(inputs.some(path => path.endsWith("/account-rate-mapping-preview.json")), false);
  assert.equal(inputs.some(path => path.endsWith("/fee-preview-source.server.ts")), false);
  assert.equal(inputs.some(path => path.endsWith("/fee-plan-seeds.server.ts")), false);
  const output = result.outputFiles.map(file => file.text).join("\n");
  assert.doesNotMatch(output, /Berlanco Tier|Internal NEW|account-rate-mapping-preview/);
});
