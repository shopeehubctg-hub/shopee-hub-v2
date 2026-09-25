import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Store Health shows a source explanation without invented metrics", async () => {
  const [page, health] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/store-health.tsx", root), "utf8"),
  ]);

  assert.match(page, /section === "health" && <StoreHealth \/>/);
  assert.match(health, /暂无店铺健康数据/);
  assert.match(health, /未接入可核验的店铺健康数据源/);
  assert.doesNotMatch(page, /4,286|4\.92 \/ 5|96\.8%|94\.2%|98\.1%|1\.2%|No active listing violations/);
  assert.doesNotMatch(health, /Healthy|Penalty Points|Bad Reviews|No active listing violations/);
});
