import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { packages, packageVersions, packagePrices, packagePlatformSkus, packageAuditLog, stores } from "../../../db/schema";
import { marketToday, packageLifecycleStatus } from "../../package-lifecycle";
import { endedPackagePeriods, endedPackageSettings } from "../../package-ending";
import { syncHistoryToGoogleSheet } from "./history-sync";

class EndPackageError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Authentication, module and store access are checked by PATCH before entry.
export async function endPackage(db: Awaited<ReturnType<typeof getDb>>, tenantId: string, packageId: string, actor: string, expectedVersion: unknown) {
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) return Response.json({error:"Refresh the package list before ending this package."},{status:400});
  const now = new Date().toISOString();
  const today = marketToday();
  let saved;
  try {
    saved = await db.transaction(async tx => {
      const [item] = await tx.select().from(packages).where(and(eq(packages.id,packageId),eq(packages.tenantId,tenantId),isNull(packages.deletedAt))).for("update").limit(1);
      if (!item) throw new EndPackageError("Package not found.",404);
      const [previous] = await tx.select().from(packageVersions).where(eq(packageVersions.packageId,packageId)).orderBy(desc(packageVersions.version)).limit(1);
      if (!previous) throw new EndPackageError("This package has no saved version.",409);
      // A repeated click/request must not create another version or email.
      if (previous.calculatorSettings?._packageEnded === true) return {duplicate:true as const,version:previous};
      if (previous.version !== expectedVersion) throw new EndPackageError("This package changed. Refresh the list and review its latest version before ending it.",409);
      if (!["active","scheduled","expired"].includes(item.status) || previous.sheetSyncStatus !== "synced") throw new EndPackageError("Publish or sync the latest package version before ending it.",409);
      const [prices,skus,storeRows] = await Promise.all([
        tx.select().from(packagePrices).where(eq(packagePrices.versionId,previous.id)),
        tx.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,previous.id)),
        tx.select({name:stores.name}).from(stores).where(eq(stores.id,item.storeId)).limit(1),
      ]);
      if (packageLifecycleStatus(prices,previous.calculatorSettings,today) !== "active") throw new EndPackageError("Only an active package can be ended. Refresh the list to see its current status.",409);
      const endedPrices = endedPackagePeriods(prices,today);
      const versionId = crypto.randomUUID();
      const settings = endedPackageSettings(previous.calculatorSettings,now,today,actor);
      const effectiveFrom = endedPrices.reduce((first,price)=>price.effectiveFrom<first?price.effectiveFrom:first,today);
      const [version] = await tx.insert(packageVersions).values({
        id:versionId,packageId,version:previous.version+1,components:previous.components,
        promotionType:"custom",addedComponents:[],removedComponents:[],sheetSyncStatus:"pending",
        calculatorSettings:settings,changeNote:`Package ended by ${actor} on ${today} (Malaysia)`,
        effectiveFrom,effectiveTo:today,createdBy:actor,createdAt:now,
      }).returning();
      for (const price of endedPrices) await tx.insert(packagePrices).values({
        id:crypto.randomUUID(),packageId,versionId,market:price.market,currency:price.currency,priceType:price.priceType,
        originalPrice:price.originalPrice,sellingPrice:price.sellingPrice,promotionType:price.promotionType,
        effectiveFrom:price.effectiveFrom,effectiveTo:price.effectiveTo,createdBy:actor,
      });
      for (const sku of skus) await tx.insert(packagePlatformSkus).values({id:crypto.randomUUID(),packageId,versionId,storeId:item.storeId,platform:sku.platform,packageSku:sku.packageSku});
      await tx.update(packages).set({status:"expired",updatedAt:now}).where(eq(packages.id,packageId));
      await tx.insert(packageAuditLog).values({packageId,action:"ended",detail:settings._packageHistorySummary.summary,actor});
      return {duplicate:false as const,version,item,prices:endedPrices,skus,storeName:storeRows[0]?.name??item.storeId};
    });
  } catch (error) {
    if (error instanceof EndPackageError) return Response.json({error:error.message},{status:error.status});
    throw error;
  }
  if (saved.duplicate) return Response.json({ok:true,packageId,version:saved.version.version,status:"expired",sheetSyncStatus:saved.version.sheetSyncStatus,duplicate:true});
  const sku = (platform:string)=>saved.skus.filter(row=>row.platform===platform).map(row=>row.packageSku).join(" | ");
  const components = saved.version.components.map(line=>`${line.inventorySku} ${line.name} ×${line.quantity} (${line.kind})`).join(" | ");
  // Ending is already committed. A Sheet/email outage cannot reactivate it;
  // the existing retry and signed recovery job deliver this same Change ID.
  const sync = await syncHistoryToGoogleSheet({
    timestamp:now,changeId:`${packageId}-v${saved.version.version}`,projectOwner:actor,
    store:saved.storeName,packageName:saved.item.name,version:saved.version.version,action:"Package Ended",
    promotionType:"Ended",startDate:saved.version.effectiveFrom,endDate:today,
    shopeeSku:sku("Shopee"),lazadaSku:sku("Lazada"),tiktokSku:sku("TikTok Shop"),
    addedComponents:"",removedComponents:"",currentComponents:components,changedBy:actor,syncStatus:"Synced",
    changeSummary:saved.version.calculatorSettings?._packageHistorySummary && (saved.version.calculatorSettings._packageHistorySummary as {summary:string}).summary,
  });
  try {
    await db.update(packageVersions).set({sheetSyncStatus:sync.status}).where(eq(packageVersions.id,saved.version.id));
  } catch {
    return Response.json({ok:true,packageId,version:saved.version.version,status:"expired",endedDate:today,sheetSyncStatus:"pending",
      warning:"Package ended. History delivery could not be confirmed. Use Retry Sheet Sync; it will not send a duplicate history entry."});
  }
  return Response.json({ok:true,packageId,version:saved.version.version,status:"expired",endedDate:today,sheetSyncStatus:sync.status,
    warning:sync.status!=="synced"?"Package ended. History Sheet sync and its email notification are pending. Use Retry Sheet Sync.":null});
}
