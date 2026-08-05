import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  customerUsers,
  packageAuditLog,
  packagePlatformSkus,
  packagePrices,
  packages,
  packageVersions,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

type ComponentLine = {
  inventorySku: string;
  name: string;
  quantity: number;
  kind: "product" | "gift";
};

type PlatformLine = {
  platform: "Shopee" | "Lazada" | "TikTok Shop";
  packageSku: string;
};

type PriceScheduleInput = {
  market: "MY" | "SG";
  priceType: "non_campaign" | "campaign";
  originalPrice: number | string;
  sellingPrice: number | string;
  promotionType: "monthly" | "custom";
  effectiveFrom: string;
  effectiveTo: string;
};

const seedPackages = [
  {
    id:"seed-agepros-1", storeId:"shopee-agepros-by-swissmed", packageSku:"AGP01JUN", name:"AgePros · BUY 1 FREE 5",
    market:"MY", status:"active", version:1, promotionType:"custom", originalPrice:438, sellingPrice:360,
    effectiveFrom:"2026-04-27", effectiveTo:"2026-04-30",
    platforms:[{platform:"Shopee",packageSku:"AGP01JUN"}],
    components:[{inventorySku:"GWSMAP30S",name:"AgePros (30 Sachets)",quantity:1,kind:"product"},{inventorySku:"GWSMAS05",name:"AgePros 5 Sachets",quantity:1,kind:"gift"}],
  },
  {
    id:"seed-beyoute-1", storeId:"shopee-beyoute-official-store", packageSku:"BY01JUN", name:"Beyoute · BUY 3 FREE 1 + 2 Gifts",
    market:"MY", status:"active", version:1, promotionType:"custom", originalPrice:805, sellingPrice:454,
    effectiveFrom:"2026-06-19", effectiveTo:"2026-07-31",
    platforms:[{platform:"Shopee",packageSku:"BY01JUN"}],
    components:[{inventorySku:"CWBY2B15S",name:"Beyoute 15 Sachets",quantity:4,kind:"product"},{inventorySku:"CWBY2LB300",name:"Beyoute Little Bottle",quantity:1,kind:"gift"},{inventorySku:"CWBYET01",name:"Beyoute Exercise Towel",quantity:1,kind:"gift"}],
  },
  {
    id:"seed-drsmile-1", storeId:"shopee-dr-smile-whitening-by-ctg4u", packageSku:"8A26", name:"Dr Smile · Merdeka Package A",
    market:"MY", status:"draft", version:1, promotionType:"monthly", originalPrice:324, sellingPrice:249,
    effectiveFrom:"2026-08-01", effectiveTo:"2026-08-31",
    platforms:[{platform:"Shopee",packageSku:"8A26"},{platform:"Lazada",packageSku:"LZ-8A26"}],
    components:[{inventorySku:"OXM-PENDING",name:"Tooth Powder",quantity:3,kind:"product"},{inventorySku:"OXM-PENDING",name:"Toothbrush",quantity:3,kind:"gift"},{inventorySku:"OXM-PENDING",name:"Reed Diffuser",quantity:1,kind:"gift"}],
  },
];

async function membershipFor(email: string) {
  const db = await getDb();
  const [membership] = await db.select({ tenantId:customerUsers.tenantId, role:customerUsers.role })
    .from(customerUsers).where(eq(customerUsers.email, email.toLowerCase())).limit(1);
  return membership;
}

function componentKey(item: ComponentLine) {
  return `${item.inventorySku.trim().toUpperCase()}|${item.kind}`;
}

function componentDiff(previous: ComponentLine[], current: ComponentLine[]) {
  const before = new Map(previous.map(item => [componentKey(item), item]));
  const after = new Map(current.map(item => [componentKey(item), item]));
  const added: ComponentLine[] = [];
  const removed: ComponentLine[] = [];
  after.forEach((item, key) => {
    const old = before.get(key);
    if (!old) added.push(item);
    else if (old.quantity !== item.quantity || old.name !== item.name) {
      removed.push(old);
      added.push(item);
    }
  });
  before.forEach((item, key) => { if (!after.has(key)) removed.push(item); });
  return { added, removed };
}

function formatComponents(lines: ComponentLine[]) {
  return lines.map(item => `${item.inventorySku} ${item.name} ×${item.quantity} (${item.kind})`).join(" | ");
}

async function syncHistoryToGoogleSheet(payload: Record<string, unknown>) {
  const webhookUrl = process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_HISTORY_SECRET;
  if (!webhookUrl || !secret) return { status:"pending" as const, reason:"Google Sheets webhook is not configured" };
  try {
    const response = await fetch(webhookUrl, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ ...payload, secret }),
    });
    if (!response.ok) return { status:"failed" as const, reason:`Webhook returned ${response.status}` };
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!result?.ok) return { status:"failed" as const, reason:result?.error ?? "Webhook did not confirm the write" };
    return { status:"synced" as const };
  } catch (error) {
    return { status:"failed" as const, reason:error instanceof Error ? error.message : "Google Sheets webhook failed" };
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL === "1") {
    const storeId = new URL(request.url).searchParams.get("storeId");
    const sample = storeId && storeId !== "all" ? seedPackages.filter(item => item.storeId === storeId) : seedPackages;
    return Response.json({ packages:sample, source:"sheet-migration-preview", canCreate:false });
  }
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error:"Authentication required" }, { status:401 });
  const membership = await membershipFor(user.email);
  if (!membership) return Response.json({ error:"No workspace assigned" }, { status:403 });
  const storeId = new URL(request.url).searchParams.get("storeId");
  const db = await getDb();
  const rows = await db.select().from(packages)
    .where(storeId && storeId !== "all"
      ? and(eq(packages.tenantId, membership.tenantId), eq(packages.storeId, storeId))
      : eq(packages.tenantId, membership.tenantId))
    .orderBy(desc(packages.updatedAt));
  if (!rows.length) {
    const sample = storeId && storeId !== "all" ? seedPackages.filter(item => item.storeId === storeId) : seedPackages;
    return Response.json({ packages:sample, source:"sheet-migration-preview", canCreate:true });
  }
  const ids = rows.map(row => row.id);
  const versions = await db.select().from(packageVersions).where(inArray(packageVersions.packageId, ids)).orderBy(desc(packageVersions.version));
  const prices = await db.select().from(packagePrices).where(inArray(packagePrices.packageId, ids)).orderBy(desc(packagePrices.createdAt));
  const platformRows = await db.select().from(packagePlatformSkus).where(inArray(packagePlatformSkus.packageId, ids));
  const latestVersion = new Map<string, typeof versions[number]>();
  versions.forEach(version => { if (!latestVersion.has(version.packageId)) latestVersion.set(version.packageId, version); });
  return Response.json({
    packages:rows.map(row => {
      const version = latestVersion.get(row.id);
      const versionPrices = version ? prices.filter(item => item.versionId === version.id) : [];
      const price = versionPrices.find(item => item.priceType === "campaign" && (item.currency === "SGD" ? "SG" : item.market) === "MY") ?? versionPrices[0];
      const currentPlatforms = version ? platformRows.filter(item => item.versionId === version.id).map(({ platform, packageSku }) => ({ platform, packageSku })) : [];
      return {
        ...row,
        packageSku:currentPlatforms[0]?.packageSku ?? row.packageSku,
        platforms:currentPlatforms,
        version:version?.version ?? 1,
        promotionType:version?.promotionType ?? "custom",
        components:version?.components ?? [],
        changeNote:version?.changeNote ?? "",
        addedComponents:version?.addedComponents ?? [],
        removedComponents:version?.removedComponents ?? [],
        sheetSyncStatus:version?.sheetSyncStatus ?? "pending",
        calculatorSettings:version?.calculatorSettings ?? null,
        effectiveFrom:version?.effectiveFrom ?? price?.effectiveFrom ?? "",
        effectiveTo:version?.effectiveTo ?? price?.effectiveTo ?? null,
        originalPrice:price?.originalPrice ?? 0,
        sellingPrice:price?.sellingPrice ?? 0,
        priceSchedules:versionPrices.map(item=>({
          market:item.currency === "SGD" ? "SG" : item.market,
          priceType:item.priceType,
          originalPrice:item.originalPrice / 100,
          sellingPrice:item.sellingPrice / 100,
          promotionType:item.promotionType,
          effectiveFrom:item.effectiveFrom,
          effectiveTo:item.effectiveTo ?? "",
        })),
        history:versions.filter(item => item.packageId === row.id).map(item => {
          const historyPrice = prices.find(priceItem => priceItem.versionId === item.id);
          return {
            version:item.version,
            changeNote:item.changeNote,
            promotionType:item.promotionType,
            effectiveFrom:item.effectiveFrom,
            effectiveTo:item.effectiveTo,
            originalPrice:historyPrice?.originalPrice,
            sellingPrice:historyPrice?.sellingPrice,
            priceSchedules:prices.filter(priceItem=>priceItem.versionId===item.id).map(priceItem=>({market:priceItem.currency === "SGD" ? "SG" : priceItem.market,priceType:priceItem.priceType,originalPrice:priceItem.originalPrice/100,sellingPrice:priceItem.sellingPrice/100,promotionType:priceItem.promotionType,effectiveFrom:priceItem.effectiveFrom,effectiveTo:priceItem.effectiveTo??""})),
            addedComponents:item.addedComponents,
            removedComponents:item.removedComponents,
            platforms:platformRows.filter(platformItem => platformItem.versionId === item.id).map(({ platform, packageSku }) => ({ platform, packageSku })),
            sheetSyncStatus:item.sheetSyncStatus,
            calculatorSettings:item.calculatorSettings ?? null,
            createdAt:item.createdAt,
            createdBy:item.createdBy,
          };
        }),
      };
    }),
    source:"database",
    canCreate:true,
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error:"Authentication required" }, { status:401 });
  const membership = await membershipFor(user.email);
  if (!membership) return Response.json({ error:"Project owner access required" }, { status:403 });
  const body = await request.json() as {
    packageId?: string;
    storeId?: string;
    storeName?: string;
    name?: string;
    markets?: Array<"MY" | "SG">;
    status?: "draft" | "review" | "approved" | "scheduled" | "active" | "expired";
    promotionType?: "monthly" | "custom";
    effectiveFrom?: string;
    effectiveTo?: string;
    originalPrice?: number | string;
    sellingPrice?: number | string;
    changeNote?: string;
    components?: ComponentLine[];
    platforms?: PlatformLine[];
    calculatorSettings?: Record<string, unknown> | null;
    priceSchedules?: PriceScheduleInput[];
  };
  const platforms = (body.platforms ?? []).map(item => ({ platform:item.platform, packageSku:String(item.packageSku ?? "").trim() }));
  if (!body.storeId || !body.name?.trim() || !Array.isArray(body.components) || !body.components.length || !platforms.length) {
    return Response.json({ error:"Store, package name, at least one platform and items are required" }, { status:400 });
  }
  const schedules=(body.priceSchedules??[]).map(item=>({...item,originalPrice:Math.round(Number(item.originalPrice)*100),sellingPrice:Math.round(Number(item.sellingPrice)*100)}));
  const markets=[...new Set(body.markets??[])];
  if (markets.some(market=>!["MY","SG"].includes(market)) || schedules.some(item=>!markets.includes(item.market))) {
    return Response.json({ error:"Markets must be MY or SG and match the enabled price cards" }, { status:400 });
  }
  if (!markets.length || markets.some(market=>schedules.filter(item=>item.market===market&&item.priceType==="non_campaign").length!==1||!schedules.some(item=>item.market===market&&item.priceType==="campaign"))) {
    return Response.json({ error:"Choose at least one market and complete both Campaign and Non-Campaign pricing" }, { status:400 });
  }
  if (schedules.some(item=>!["MY","SG"].includes(item.market)||!["campaign","non_campaign"].includes(item.priceType)||!["monthly","custom"].includes(item.promotionType)||!item.effectiveFrom||!item.effectiveTo||item.effectiveTo<item.effectiveFrom)) {
    return Response.json({ error:"Every price scenario requires a valid promotion period" }, { status:400 });
  }
  const periodKeys=(market:string,priceType:"non_campaign"|"campaign")=>schedules.filter(item=>item.market===market&&item.priceType===priceType).map(item=>`${item.promotionType}|${item.effectiveFrom}|${item.effectiveTo}`).sort().join(",");
  if (markets.some(market=>periodKeys(market,"non_campaign")!==periodKeys(markets[0],"non_campaign")||periodKeys(market,"campaign")!==periodKeys(markets[0],"campaign"))) {
    return Response.json({ error:"MY and SG must share the same selected dates for each pricing scenario" }, { status:400 });
  }
  if (platforms.some(item => !["Shopee","Lazada","TikTok Shop"].includes(item.platform) || !item.packageSku)) {
    return Response.json({ error:"Every selected listing requires its own SKU" }, { status:400 });
  }
  const normalizedSkus = platforms.map(item => item.packageSku.toUpperCase());
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    return Response.json({ error:"Every listing SKU must be different" }, { status:400 });
  }
  const components = body.components.map(item => ({
    inventorySku:String(item.inventorySku ?? "").trim(),
    name:String(item.name ?? "").trim(),
    quantity:Number(item.quantity),
    kind:item.kind === "gift" ? "gift" as const : "product" as const,
  }));
  if (components.some(item => !item.inventorySku || !item.name || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    return Response.json({ error:"Every component requires an Inventory SKU, name and whole-number quantity" }, { status:400 });
  }
  if (schedules.some(item=>!Number.isFinite(item.originalPrice)||!Number.isFinite(item.sellingPrice)||item.originalPrice<=0||item.sellingPrice<=0||item.sellingPrice>item.originalPrice)) {
    return Response.json({ error:"Original Price is required; prices must be positive and Selling Price cannot exceed it" }, { status:400 });
  }

  const db = await getDb();
  const requestedPackageId = body.packageId ? String(body.packageId) : null;
  for (const line of platforms) {
    const conflict = await db.select({ packageId:packagePlatformSkus.packageId }).from(packagePlatformSkus)
      .where(and(eq(packagePlatformSkus.storeId, body.storeId), eq(packagePlatformSkus.platform, line.platform), eq(packagePlatformSkus.packageSku, line.packageSku)))
      .limit(1);
    if (conflict[0] && (!requestedPackageId || conflict[0].packageId !== requestedPackageId)) {
      return Response.json({ error:`${line.platform} Package SKU ${line.packageSku} is already used in this store` }, { status:409 });
    }
  }

  const now = new Date().toISOString();
  const packageId = requestedPackageId ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  let nextVersion = 1;
  let previousComponents: ComponentLine[] = [];
  if (requestedPackageId) {
    const [existing] = await db.select().from(packages)
      .where(and(eq(packages.id, requestedPackageId), eq(packages.tenantId, membership.tenantId))).limit(1);
    if (!existing) return Response.json({ error:"Package not found" }, { status:404 });
    const [latest] = await db.select().from(packageVersions)
      .where(eq(packageVersions.packageId, requestedPackageId)).orderBy(desc(packageVersions.version)).limit(1);
    nextVersion = Number(latest?.version ?? 0) + 1;
    previousComponents = latest?.components ?? [];
    await db.update(packages).set({
      name:body.name.trim(),
      market:markets.join(","),
      status:body.status ?? "draft",
      updatedAt:now,
    }).where(eq(packages.id, requestedPackageId));
  } else {
    await db.insert(packages).values({
      id:packageId,
      tenantId:membership.tenantId,
      storeId:body.storeId,
      packageSku:platforms[0].packageSku,
      name:body.name.trim(),
      channel:platforms.map(item => item.platform).join(", "),
      market:markets.join(","),
      status:body.status ?? "draft",
      createdBy:user.email,
      updatedAt:now,
    });
  }

  const diff = componentDiff(previousComponents, components);
  await db.batch([
    db.insert(packageVersions).values({
      id:versionId,
      packageId,
      version:nextVersion,
      components,
      promotionType:schedules.find(item=>item.priceType==="campaign")?.promotionType ?? "monthly",
      addedComponents:diff.added,
      removedComponents:diff.removed,
      sheetSyncStatus:"pending",
      calculatorSettings:body.calculatorSettings ?? null,
      changeNote:body.changeNote?.trim() || (nextVersion === 1 ? "Initial version" : `Version ${nextVersion}`),
      effectiveFrom:schedules.find(item=>item.priceType==="campaign")!.effectiveFrom,
      effectiveTo:schedules.find(item=>item.priceType==="campaign")!.effectiveTo,
      createdBy:user.email,
    }),
    ...platforms.map(item => db.insert(packagePlatformSkus).values({
      id:crypto.randomUUID(),
      packageId,
      versionId,
      storeId:body.storeId!,
      platform:item.platform,
      packageSku:item.packageSku,
    })),
    ...schedules.map(item=>db.insert(packagePrices).values({
      id:crypto.randomUUID(),packageId,versionId,market:item.market,priceType:item.priceType,promotionType:item.promotionType,
      currency:item.market === "SG" ? "SGD" : "MYR",originalPrice:item.originalPrice,sellingPrice:item.sellingPrice,
      effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,createdBy:user.email,
    })),
    db.insert(packageAuditLog).values({
      packageId,
      action:nextVersion === 1 ? "created" : "version_created",
      detail:`Version ${nextVersion}: +${diff.added.length} / -${diff.removed.length}; ${platforms.map(item => `${item.platform}=${item.packageSku}`).join(", ")}`,
      actor:user.email,
    }),
  ]);

  const platformMap = Object.fromEntries(["Shopee","Lazada","TikTok Shop"].map(platform=>[platform,platforms.filter(item=>item.platform===platform).map(item=>item.packageSku).join(" | ")]));
  const changeId = `${packageId}-v${nextVersion}`;
  const sync = await syncHistoryToGoogleSheet({
    timestamp:now,
    changeId,
    projectOwner:user.fullName ?? user.email,
    store:body.storeName ?? body.storeId,
    packageName:body.name.trim(),
    version:nextVersion,
    action:nextVersion === 1 ? "Created" : "Version Updated",
    promotionType:schedules.map(item=>`${item.market} ${item.priceType==="campaign"?"Campaign":"Non-Campaign"}: ${item.promotionType==="custom"?"Custom":"Monthly"}`).join(" | "),
    startDate:schedules.filter(item=>item.market===markets[0]).map(item=>`${item.priceType==="campaign"?"Campaign":"Non-Campaign"} ${item.effectiveFrom}`).join(" | "),
    endDate:schedules.filter(item=>item.market===markets[0]).map(item=>`${item.priceType==="campaign"?"Campaign":"Non-Campaign"} ${item.effectiveTo}`).join(" | "),
    shopeeSku:platformMap["Shopee"] ?? "",
    lazadaSku:platformMap["Lazada"] ?? "",
    tiktokSku:platformMap["TikTok Shop"] ?? "",
    addedComponents:formatComponents(diff.added),
    removedComponents:formatComponents(diff.removed),
    currentComponents:formatComponents(components),
    changedBy:user.email,
    syncStatus:"Synced",
  });
  await db.update(packageVersions).set({ sheetSyncStatus:sync.status }).where(eq(packageVersions.id, versionId));

  return Response.json({
    ok:true,
    packageId,
    version:nextVersion,
    added:diff.added,
    removed:diff.removed,
    sheetSyncStatus:sync.status,
    sheetSyncReason:"reason" in sync ? sync.reason : null,
    historySheetUrl:"https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit#gid=2129880014",
  }, { status:201 });
}
