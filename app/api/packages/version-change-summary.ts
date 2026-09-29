import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { packageVersions, packagePrices, packagePlatformSkus } from "../../../db/schema";
import { emailChangeSummary, storedChangeSummary } from "./email-change-summary";

// Legacy versions are enriched once. Concurrent callers keep the first stored
// result and preserve every other calculator setting with a JSONB merge.
export async function versionChangeSummary(db: Awaited<ReturnType<typeof getDb>>, current: typeof packageVersions.$inferSelect) {
  const saved = storedChangeSummary(current.calculatorSettings);
  if (saved) return saved;
  let summary = "新开配套";
  if (current.version > 1) {
    const [previous] = await db.select().from(packageVersions)
      .where(and(eq(packageVersions.packageId,current.packageId),lt(packageVersions.version,current.version)))
      .orderBy(desc(packageVersions.version)).limit(1);
    if (!previous) summary = "配套资料修改（历史比较资料不足）";
    else {
      const [prices,oldPrices,skus,oldSkus] = await Promise.all([
        db.select().from(packagePrices).where(eq(packagePrices.versionId,current.id)),
        db.select().from(packagePrices).where(eq(packagePrices.versionId,previous.id)),
        db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,current.id)),
        db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,previous.id)),
      ]);
      summary = emailChangeSummary(current,previous,prices,oldPrices,skus,oldSkus);
    }
  }
  const [updated] = await db.update(packageVersions).set({calculatorSettings:
    sql`coalesce(${packageVersions.calculatorSettings}, '{}'::jsonb) || ${JSON.stringify({_packageHistorySummary:{schema:1,summary}})}::jsonb`
  }).where(and(eq(packageVersions.id,current.id),sql`${packageVersions.calculatorSettings}->'_packageHistorySummary' is null`))
    .returning({settings:packageVersions.calculatorSettings});
  if (updated) return storedChangeSummary(updated.settings) ?? summary;
  const [existing] = await db.select({settings:packageVersions.calculatorSettings}).from(packageVersions).where(eq(packageVersions.id,current.id)).limit(1);
  return storedChangeSummary(existing?.settings ?? null) ?? summary;
}
