import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { packageAuditLog, packagePlatformSkus, packagePrices, packages, packageVersions, stores } from "../../../../db/schema";
import { validSyncJobSignature } from "../sync-job-auth";
import { emailChangeSummary } from "../email-change-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A signed Apps Script job may only deliver existing pending versions and
// acknowledge delivery. It cannot create/edit a version or publish a draft.
function eligibleVersion() {
  return and(
    isNull(packages.deletedAt),
    inArray(packages.status, ["approved", "active", "scheduled", "expired"]),
    inArray(packageVersions.sheetSyncStatus, ["pending", "failed"]),
    lt(packageVersions.createdAt, new Date(Date.now() - 120000).toISOString()),
    sql`not exists (select 1 from package_versions newer where newer.package_id = ${packages.id} and newer.version > ${packageVersions.version})`,
  );
}

function metadata(value: Record<string, unknown> | null) {
  const candidate = value?._packageMetadata as Record<string, unknown> | undefined;
  if (!candidate || ["name", "market", "channel", "packageSku"].some(key => typeof candidate[key] !== "string")) return null;
  return candidate as {name:string;market:string;channel:string;packageSku:string};
}

function formatComponents(lines: typeof packageVersions.$inferSelect.components) {
  return lines.map(item => `${item.inventorySku} ${item.name} ×${item.quantity} (${item.kind})`).join(" | ");
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  if (bodyText.length > 4096 || !validSyncJobSignature(bodyText, request.headers.get("x-package-sync-time"), request.headers.get("x-package-sync-signature"), process.env.GOOGLE_SHEETS_HISTORY_SECRET)) {
    return Response.json({ok:false,error:"Authentication required"}, {status:401});
  }
  let body: {action?:string;versionIds?:string[];changeId?:string};
  try { body = JSON.parse(bodyText); } catch { return Response.json({ok:false,error:"Invalid request"},{status:400}); }
  if (!body || !["pull", "confirm", "changes"].includes(body.action ?? "")) return Response.json({ok:false,error:"Invalid action"},{status:400});
  try {
    const db = await getDb();
    if (body.action === "changes") {
      const match = typeof body.changeId === "string" && body.changeId.length < 200 ? /^(.*)-v(\d+)$/.exec(body.changeId) : null;
      if (!match || !Number.isSafeInteger(Number(match[2]))) return Response.json({ok:false,error:"Invalid Change ID"},{status:400});
      const [current] = await db.select().from(packageVersions).where(and(eq(packageVersions.packageId,match[1]),eq(packageVersions.version,Number(match[2])))).limit(1);
      if (!current) return Response.json({ok:false,error:"Package version not found"},{status:404});
      if (current.version === 1) return Response.json({ok:true,summary:"新开配套"});
      const [previous] = await db.select().from(packageVersions).where(and(eq(packageVersions.packageId,current.packageId),lt(packageVersions.version,current.version))).orderBy(desc(packageVersions.version)).limit(1);
      if (!previous) return Response.json({ok:true,summary:"配套资料修改（历史比较资料不足）"});
      const [prices,oldPrices,skus,oldSkus] = await Promise.all([
        db.select().from(packagePrices).where(eq(packagePrices.versionId,current.id)),
        db.select().from(packagePrices).where(eq(packagePrices.versionId,previous.id)),
        db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,current.id)),
        db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,previous.id)),
      ]);
      return Response.json({ok:true,summary:emailChangeSummary(current,previous,prices,oldPrices,skus,oldSkus)},{headers:{"Cache-Control":"no-store"}});
    }
    if (body.action === "pull") {
      const rows = await db.select({item:packages,version:packageVersions,storeName:stores.name})
        .from(packageVersions).innerJoin(packages,eq(packages.id,packageVersions.packageId))
        .innerJoin(stores,eq(stores.id,packages.storeId)).where(eligibleVersion())
        .orderBy(asc(packageVersions.createdAt)).limit(10);
      const entries = await Promise.all(rows.map(async ({item,version,storeName}) => {
        const [prices, skus] = await Promise.all([
          db.select().from(packagePrices).where(eq(packagePrices.versionId,version.id)).orderBy(asc(packagePrices.market),asc(packagePrices.priceType),asc(packagePrices.effectiveFrom)),
          db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,version.id)).orderBy(asc(packagePlatformSkus.platform),asc(packagePlatformSkus.packageSku)),
        ]);
        const meta = metadata(version.calculatorSettings);
        const firstMarket = (meta?.market ?? item.market).split(",")[0];
        const label = (type:string) => type === "campaign" ? "Campaign" : "Non-Campaign";
        const sku = (platform:string) => skus.filter(row=>row.platform===platform).map(row=>row.packageSku).join(" | ");
        return {versionId:version.id,payload:{
          timestamp:version.createdAt,changeId:`${item.id}-v${version.version}`,projectOwner:version.createdBy,
          store:storeName,packageName:meta?.name ?? item.name,version:version.version,
          action:version.version===1 ? "Created" : "Version Updated",
          promotionType:prices.map(row=>`${row.market} ${label(row.priceType)}: ${row.promotionType==="custom"?"Custom":"Monthly"}`).join(" | "),
          startDate:prices.filter(row=>row.market===firstMarket).map(row=>`${label(row.priceType)} ${row.effectiveFrom}`).join(" | "),
          endDate:prices.filter(row=>row.market===firstMarket).map(row=>`${label(row.priceType)} ${row.effectiveTo}`).join(" | "),
          shopeeSku:sku("Shopee"),lazadaSku:sku("Lazada"),tiktokSku:sku("TikTok Shop"),
          addedComponents:formatComponents(version.addedComponents),removedComponents:formatComponents(version.removedComponents),
          currentComponents:formatComponents(version.components),changedBy:version.createdBy,syncStatus:"Synced",
        }};
      }));
      return Response.json({ok:true,entries},{headers:{"Cache-Control":"no-store"}});
    }
    if (!Array.isArray(body.versionIds) || body.versionIds.length > 10 || body.versionIds.some(id=>typeof id!=="string" || id.length>100)) return Response.json({ok:false,error:"Invalid version IDs"},{status:400});
    const confirmed: string[] = [];
    // Revalidate eligibility under a package row lock to avoid reverting a
    // newer version, restoring a deleted package, or publishing a draft.
    for (const id of [...new Set(body.versionIds)]) await db.transaction(async tx => {
      const [candidate] = await tx.select({item:packages,version:packageVersions}).from(packageVersions)
        .innerJoin(packages,eq(packages.id,packageVersions.packageId))
        .where(and(eq(packageVersions.id,id),eligibleVersion())).for("update",{of:packages});
      if (!candidate) return;
      const [latest] = await tx.select().from(packageVersions).where(eq(packageVersions.packageId,candidate.item.id)).orderBy(desc(packageVersions.version)).limit(1);
      if (latest?.id !== id || !["pending","failed"].includes(latest.sheetSyncStatus)) return;
      const meta = metadata(candidate.version.calculatorSettings);
      const prices = await tx.select().from(packagePrices).where(eq(packagePrices.versionId,id));
      if (!prices.length) throw new Error("Package version has no price periods");
      const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
      const value = (type:string) => parts.find(p=>p.type===type)?.value ?? "";
      const today = `${value("year")}-${value("month")}-${value("day")}`;
      const status = prices.some(p=>p.effectiveFrom<=today && (p.effectiveTo ?? p.effectiveFrom)>=today) ? "active" : prices.some(p=>p.effectiveFrom>today) ? "scheduled" : "expired";
      await tx.update(packageVersions).set({sheetSyncStatus:"synced"}).where(and(eq(packageVersions.id,id),inArray(packageVersions.sheetSyncStatus,["pending","failed"])));
      await tx.update(packages).set({...meta,status,updatedAt:new Date().toISOString()}).where(eq(packages.id,candidate.item.id));
      await tx.insert(packageAuditLog).values({packageId:candidate.item.id,action:"sheet_sync_recovered",detail:`Version ${candidate.version.version} confirmed by Apps Script`,actor:"Apps Script Package Sync"});
      confirmed.push(id);
    });
    return Response.json({ok:true,confirmed});
  } catch {
    console.error("Package background sync job failed");
    return Response.json({ok:false,error:"Package sync temporarily unavailable"},{status:503});
  }
}
