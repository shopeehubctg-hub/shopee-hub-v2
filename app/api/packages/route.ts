import {deploymentTarget} from "../../deployment-isolation";
import {MARKET_CONFIG,isMarket,priceMarket,marketFromPlatform,type MarketCode} from '../../markets';
import { packageDurationType } from '../../package-duration';
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  customerUsers,
  packageAuditLog,
  packagePlatformSkus,
  packagePrices,
  packages,
  packageVersions,
  stores,
  userStoreAccess,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { canAccessModule, canAccessStore } from "../../module-access";
import { publicCalculatorSettings } from "../../package-history";
import { marketToday, packageLifecycleStatus } from "../../package-lifecycle";
import { activeRecurringEvent, readRecurringCampaign, recurringEventLabels, validateRecurringCampaign, type RecurringCampaignRule, type RecurringMarket } from "../../recurring-campaign";
import { blocksNewVersionForUnsyncedSheet } from "../../package-version-policy";
import { emailChangeSummary } from "./email-change-summary";
import { versionChangeSummary } from "./version-change-summary";
import { syncHistoryToGoogleSheet } from "./history-sync";
import { endPackage } from "./end-package";
import { packageHistoryAction } from "../../package-ending";
import { boundCampaignPeriods } from "../../package-period-bounds";
import { readCompactPackageRows } from "./compact-read";
import { BERLANCO_CATALOG_STORE, catalogProducts, InventoryCatalogError } from "../../inventory-catalog-model";
import { captureInventoryProducts, inventoryFingerprint, lockInventoryCatalog } from "./inventory-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  market: MarketCode;
  priceType: "non_campaign" | "campaign";
  originalPrice: number | string;
  sellingPrice: number | string;
  promotionType: "monthly" | "custom";
  effectiveFrom: string;
  effectiveTo: string | null;
};

type PackageErrorSection = "Package Details" | "Pricing & Promotion" | "Inventory Items" | "Saving";
type DatabaseError = Error & { code?:string; constraint_name?:string; constraint?:string; table_name?:string; table?:string; column_name?:string; column?:string };

function packageError(section:PackageErrorSection,error:string,status=400,code?:string) {
  return Response.json({ section,error,...(code?{code}:{}),errors:[{ section,message:error }] },{ status });
}

function saveFailure(error:unknown) {
  const databaseError=error as DatabaseError;
  const code=databaseError?.code ?? "unknown";
  const constraint=databaseError?.constraint_name ?? databaseError?.constraint ?? "";
  const table=databaseError?.table_name ?? databaseError?.table ?? "";
  const column=databaseError?.column_name ?? databaseError?.column ?? "";
  console.error("Package save failed",{ code,constraint,table,column });
  if(code==="INVENTORY_CATALOG_CONFLICT")return packageError("Inventory Items",databaseError.message,409,code);
  if(code==="23505"&&(/inventory_sku/.test(constraint)||table==="inventory_skus"))return packageError("Inventory Items","This Inventory SKU already exists. Select the saved product and retry.",409);
  if (code==="23505"&&(/package_sku_store|package_platform/.test(constraint)||table==="packages")) {
    return packageError("Package Details","This listing SKU is already used by another package in this store. Enter a different SKU.",409);
  }
  if (code==="23505"&&/package_price/.test(constraint)) {
    return packageError("Pricing & Promotion","The same market and promotion period was added more than once. Check the selected dates and Campaign events.",409);
  }
  if (code==="23505"&&/package_version/.test(constraint)) {
    return packageError("Saving","Someone created a new version of this package at the same time. Refresh the page, review the latest version and try again.",409);
  }
  if (code==="23503"&&(/store/.test(constraint)||column==="store_id")) {
    return packageError("Package Details","This store is no longer available to your account. Select the store again and retry.",409);
  }
  if ((code==="23514"||code==="22007"||code==="22008")&&(table==="package_prices"||/price|period/.test(constraint))) {
    return packageError("Pricing & Promotion","One or more prices or promotion dates are not valid. Check the amount and date range, then try again.");
  }
  if (code==="23502"&&table==="package_platform_skus") {
    return packageError("Package Details","A selected platform is missing its listing SKU. Complete the SKU and try again.");
  }
  if (code==="23502"&&table==="package_prices") {
    return packageError("Pricing & Promotion","A price or promotion date is missing. Complete the Pricing & Promotion section and try again.");
  }
  if (code==="23502"&&table==="package_versions") {
    return packageError("Inventory Items","The package items or version details are incomplete. Check every inventory item and try again.");
  }
  if (["57P01","08000","08003","08006","53300","ETIMEDOUT","ECONNREFUSED"].includes(code)) {
    return packageError("Saving","The database is temporarily unavailable. Your package was not changed. Wait a moment and try again.",503);
  }
  return packageError("Saving","We could not save this package. Your changes were not applied. Please try again; if it happens again, contact the Shopee Hub specialist.",500);
}

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
  const [membership] = await db.select({ id:customerUsers.id, tenantId:customerUsers.tenantId, role:customerUsers.role, active:customerUsers.active, moduleAccessMode:customerUsers.moduleAccessMode, storeAccessMode:customerUsers.storeAccessMode })
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

type PackageMetadata = { name:string; market:string; channel:string; packageSku:string };
function versionMetadata(settings:Record<string,unknown>|null):PackageMetadata|null {
  const value=settings?._packageMetadata;
  if (!value || typeof value!=="object") return null;
  const record=value as Record<string,unknown>;
  return typeof record.name==="string" && typeof record.market==="string" && typeof record.channel==="string" && typeof record.packageSku==="string"
    ? record as PackageMetadata : null;
}
function historyWebhookConfigured() {
  if(deploymentTarget()==="staging")return true;
  return Boolean(process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL && process.env.GOOGLE_SHEETS_HISTORY_SECRET);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error:"Authentication required" }, { status:401 });
  const membership = await membershipFor(user.email);
  if (!membership) return Response.json({ error:"No workspace assigned" }, { status:403 });
  const params=new URL(request.url).searchParams;
  const storeId=params.get("storeId");
  const packageId=params.get("packageId");
  const historyOnly=params.get("history")==="1";
  const compact=params.get("compact")==="1"&&!historyOnly;
  if(historyOnly&&!packageId)return Response.json({error:"Package ID required"},{status:400});
  if(packageId&&!storeId)return Response.json({error:"Store ID required"},{status:400});
  const db = await getDb();
  if (!await canAccessModule(db, membership, "packages")) return Response.json({ error:"Packages & Pricing is not enabled for this account" }, { status:403 });
  if (!storeId) {
    return Response.json({ packages:[], source:"store-selection-required", canCreate:false, canDelete:false }, { headers:{ "Cache-Control":"private, no-store" } });
  }
  const tenantStores = await db.select({ id:stores.id, name:stores.name, displayName:stores.displayName,platform:stores.platform }).from(stores)
    .where(eq(stores.tenantId, membership.tenantId));
  const assignedStoreRows = membership.role === "superadmin" || membership.storeAccessMode === "all"
    ? []
    : await db.select({ storeId:userStoreAccess.storeId }).from(userStoreAccess)
      .where(and(eq(userStoreAccess.userId, membership.id),eq(userStoreAccess.enabled,true)));
  const assignedStoreIds = new Set(assignedStoreRows.map(row => row.storeId));
  const accessibleStores = tenantStores.filter(store =>
    membership.role === "superadmin" || membership.storeAccessMode === "all" || assignedStoreIds.has(store.id),
  );
  const scopedStores = storeId === "all"
    ? accessibleStores
    : accessibleStores.filter(store => store.id === storeId);
  if (storeId !== "all" && !scopedStores.length) return Response.json({ error:"Store access denied" }, { status:403 });
  if (!scopedStores.length) {
    if(packageId)return Response.json({error:"Package not found"},{status:404});
    return Response.json({ packages:[], source:"database", canCreate:false, canDelete:false }, { headers:{ "Cache-Control":"private, no-store" } });
  }
  const scopedStoreIds = scopedStores.map(store => store.id);
  const storeNames = new Map(scopedStores.map(store => [store.id, store.displayName ?? store.name]));
  const storeMarkets=new Map(scopedStores.map(store=>[store.id,marketFromPlatform(store.platform)]));
  const packageScope=and(eq(packages.tenantId,membership.tenantId),inArray(packages.storeId,scopedStoreIds));
  const allRows = await db.select().from(packages)
    .where(packageId?and(packageScope,eq(packages.id,packageId),isNull(packages.deletedAt)):packageScope)
    .orderBy(desc(packages.updatedAt));
  const rows=allRows.filter(row=>row.deletedAt===null);
  if (!rows.length) {
    if(packageId)return Response.json({error:"Package not found"},{status:404,headers:{"Cache-Control":"private, no-store"}});
    if(deploymentTarget()==="staging")return Response.json({packages:[],source:"database",environment:"staging",canCreate:storeId!=="all",canDelete:membership.role==="superadmin",canExportKits:membership.role!=="customer"&&storeId!=="all"},{headers:{"Cache-Control":"private, no-store"}});
    if(allRows.length)return Response.json({packages:[],source:"database",canCreate:storeId!=="all",canDelete:membership.role==="superadmin",canExportKits:membership.role!=="customer"&&storeId!=="all"},{headers:{"Cache-Control":"private, no-store"}});
    const sample = seedPackages
      .filter(item => scopedStoreIds.includes(item.storeId))
      .map(item => ({ ...item, storeName:storeNames.get(item.storeId) ?? "Accessible Store" }));
    return Response.json({ packages:sample, source:"sheet-migration-preview", canCreate:storeId !== "all", canDelete:false }, { headers:{ "Cache-Control":"private, no-store" } });
  }
  const ids = rows.map(row => row.id);
  const [versions,prices,platformRows] = compact ? await readCompactPackageRows(db, ids) : await Promise.all([
    db.select().from(packageVersions).where(inArray(packageVersions.packageId, ids)).orderBy(desc(packageVersions.version)),
    db.select().from(packagePrices).where(inArray(packagePrices.packageId, ids)).orderBy(desc(packagePrices.createdAt)),
    db.select().from(packagePlatformSkus).where(inArray(packagePlatformSkus.packageId, ids)),
  ]);
  const versionsByPackage = new Map<string,typeof versions>();
  const pricesByVersion = new Map<string,typeof prices>();
  const platformsByVersion = new Map<string,typeof platformRows>();
  versions.forEach(version=>{
    if (!versionsByPackage.has(version.packageId)) versionsByPackage.set(version.packageId,[]);
    versionsByPackage.get(version.packageId)!.push(version);
  });
  prices.forEach(price=>{
    if (!pricesByVersion.has(price.versionId)) pricesByVersion.set(price.versionId,[]);
    pricesByVersion.get(price.versionId)!.push(price);
  });
  platformRows.forEach(platform=>{
    if (!platformsByVersion.has(platform.versionId)) platformsByVersion.set(platform.versionId,[]);
    platformsByVersion.get(platform.versionId)!.push(platform);
  });
  const latestVersion = new Map<string, typeof versions[number]>();
  const latestPublishedVersion = new Map<string, typeof versions[number]>();
  versions.forEach(version => { if (!latestVersion.has(version.packageId)) latestVersion.set(version.packageId, version); });
  versions.forEach(version => { if (version.sheetSyncStatus === "synced" && !latestPublishedVersion.has(version.packageId)) latestPublishedVersion.set(version.packageId, version); });
  const result=rows.map(row => {
      const endedVersion = latestVersion.get(row.id)?.calculatorSettings?._packageEnded === true ? latestVersion.get(row.id) : undefined;
      const version = endedVersion ?? (["active","scheduled","expired"].includes(row.status)
        ? latestPublishedVersion.get(row.id) ?? latestVersion.get(row.id)
        : latestVersion.get(row.id));
      const today=marketToday(storeMarkets.get(row.storeId)??'MY');
      const versionPrices = version ? pricesByVersion.get(version.id)??[] : [];
      const versionMarkets=row.market.split(",").map(market=>market.trim()).filter(isMarket) as RecurringMarket[];
      const displayMarket=versionMarkets.includes("MY")?"MY":versionMarkets[0];
      const price = versionPrices.find(item => item.priceType === "campaign" && priceMarket(item.market,item.currency) === displayMarket) ?? versionPrices[0];
      const recurringCampaign=readRecurringCampaign(version?.calculatorSettings?._recurringCampaign,versionMarkets);
      const currentEvent=recurringCampaign?activeRecurringEvent(recurringCampaign,today):null;
      const eventPrice=displayMarket?currentEvent?.prices[displayMarket]:null;
      const normalPrice=versionPrices.find(item=>item.priceType==="non_campaign"&&priceMarket(item.market,item.currency)===displayMarket);
      const displayPrice=recurringCampaign ? eventPrice?{originalPrice:Math.round(eventPrice.originalPrice*100),sellingPrice:Math.round(eventPrice.sellingPrice*100)}:normalPrice??price : price;
      const currentPlatforms = version ? (platformsByVersion.get(version.id)??[]).map(({ platform, packageSku }) => ({ platform, packageSku })) : [];
      return {
        ...row,
        status:["active","scheduled","expired"].includes(row.status)
          ? packageLifecycleStatus(versionPrices,version?.calculatorSettings,today)
          : row.status,
        storeName:storeNames.get(row.storeId) ?? "Accessible Store",
        packageSku:currentPlatforms[0]?.packageSku ?? row.packageSku,
        platforms:currentPlatforms,
        version:version?.version ?? 1,
        promotionType:version?.promotionType ?? "custom",
        components:version?.components ?? [],
        changeNote:version?.changeNote ?? "",
        addedComponents:version?.addedComponents ?? [],
        removedComponents:version?.removedComponents ?? [],
        sheetSyncStatus:version?.sheetSyncStatus ?? "pending",
        samePricing:typeof version?.calculatorSettings?._samePricing==="boolean" ? version.calculatorSettings._samePricing : undefined,
        recurringCampaign,
        durationType:packageDurationType(version,versionsByPackage.get(row.id)??[],pricesByVersion),
        currentPriceLabel:recurringCampaign?(currentEvent?recurringEventLabels[currentEvent.id]:"Non-Campaign Day"):undefined,
        pendingVersion:["active","scheduled","expired"].includes(row.status) && (Boolean(endedVersion) || latestVersion.get(row.id)?.version !== version?.version) &&
          ["pending","failed"].includes(latestVersion.get(row.id)?.sheetSyncStatus ?? "") ? latestVersion.get(row.id)?.version : null,
        calculatorSettings:publicCalculatorSettings(version?.calculatorSettings ?? null),
        effectiveFrom:version?.effectiveFrom ?? price?.effectiveFrom ?? "",
        effectiveTo:version ? version.effectiveTo : price?.effectiveTo ?? null,
        originalPrice:displayPrice?.originalPrice ?? 0,
        sellingPrice:displayPrice?.sellingPrice ?? 0,
        priceSchedules:versionPrices.map(item=>({
          market:priceMarket(item.market,item.currency),
          priceType:item.priceType,
          originalPrice:item.originalPrice / 100,
          sellingPrice:item.sellingPrice / 100,
          promotionType:item.promotionType,
          effectiveFrom:item.effectiveFrom,
          effectiveTo:item.effectiveTo,
        })),
        historyLoaded:!compact,
        ...(!compact?{history:(versionsByPackage.get(row.id)??[]).map(item => {
          const historyPrices=pricesByVersion.get(item.id)??[];
          const historyPrice = historyPrices[0];
          const historyMarkets=(versionMetadata(item.calculatorSettings)?.market??row.market).split(",").map(market=>market.trim()).filter(isMarket) as RecurringMarket[];
          return {
            version:item.version,
            name:versionMetadata(item.calculatorSettings)?.name ?? null,
            market:versionMetadata(item.calculatorSettings)?.market ?? null,
            components:item.components,
            changeNote:item.changeNote,
            promotionType:item.promotionType,
            effectiveFrom:item.effectiveFrom,
            effectiveTo:item.effectiveTo,
            originalPrice:historyPrice?.originalPrice,
            sellingPrice:historyPrice?.sellingPrice,
            priceSchedules:historyPrices.map(priceItem=>({market:priceMarket(priceItem.market,priceItem.currency),priceType:priceItem.priceType,originalPrice:priceItem.originalPrice/100,sellingPrice:priceItem.sellingPrice/100,promotionType:priceItem.promotionType,effectiveFrom:priceItem.effectiveFrom,effectiveTo:priceItem.effectiveTo})),
            recurringCampaign:readRecurringCampaign(item.calculatorSettings?._recurringCampaign,historyMarkets),
            addedComponents:item.addedComponents,
            removedComponents:item.removedComponents,
            platforms:(platformsByVersion.get(item.id)??[]).map(({ platform, packageSku }) => ({ platform, packageSku })),
            sheetSyncStatus:item.sheetSyncStatus,
            calculatorSettings:publicCalculatorSettings(item.calculatorSettings ?? null),
            createdAt:item.createdAt,
            createdBy:item.createdBy,
          };
        })}:{}),
      };
    });
  if(historyOnly)return Response.json({environment:deploymentTarget(),packageId:rows[0].id,storeId:rows[0].storeId,history:result[0].history??[]},{headers:{"Cache-Control":"private, no-store"}});
  return Response.json({
    packages:result,
    environment:deploymentTarget(),
    source:"database",
    canCreate:storeId !== "all",
    canDelete:membership.role === "superadmin",
    canExportKits:membership.role !== "customer" && storeId !== "all",
  });
}

async function savePackage(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return packageError("Saving","Your login session has expired. Sign in again, then retry.",401);
  const membership = await membershipFor(user.email);
  if (!membership) return packageError("Saving","Your account is not assigned to this workspace. Contact an administrator.",403);
  const accessDb = await getDb();
  if (!await canAccessModule(accessDb, membership, "packages")) return packageError("Saving","Packages & Pricing is not enabled for your account. Contact an administrator.",403);
  const body = await request.json() as {
    batchUpload?: boolean;
    captureInventory?: boolean;
    mode?: "draft" | "publish";
    clientRequestId?: string;
    packageId?: string;
    expectedVersion?: number;
    storeId?: string;
    storeName?: string;
    name?: string;
    markets?: MarketCode[];
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
    samePricing?: boolean;
    longTerm?: boolean;
    campaignLongTerm?: boolean;
    recurringCampaign?: unknown;
  };
  if(body.batchUpload&&deploymentTarget()!=="staging")return packageError("Saving","Batch creation is only enabled in Staging.",403);
  const captureInventory=body.captureInventory===true;
  if(captureInventory&&(deploymentTarget()!=="staging"||body.storeId!==BERLANCO_CATALOG_STORE||body.packageId||body.batchUpload))return packageError("Inventory Items","Product capture is available for new Berlanco packages in Staging only.",403);
  const mode = body.mode ?? "draft";
  if (mode!=="draft"&&mode!=="publish") return packageError("Saving","Choose Create Package or Save Draft.");
  if (mode==="publish"&&!historyWebhookConfigured()) return packageError("Saving","Package History Google Sheet is not connected. Save a draft or ask the administrator to connect the Sheet before creating the package.",503);
  const platforms = (body.platforms ?? []).map(item => ({ platform:item.platform, packageSku:String(item.packageSku ?? "").trim() }));
  if (!body.storeId || !body.name?.trim() || !Array.isArray(body.components) || !body.components.length || !platforms.length) {
    return packageError("Package Details","Complete the store, package name and at least one sales platform before saving.");
  }
  if (!await canAccessStore(accessDb,membership,body.storeId)) return packageError("Package Details","You do not have permission to create packages for this store.",403);
  const [storeInfo]=await accessDb.select({platform:stores.platform}).from(stores).where(and(eq(stores.id,body.storeId),eq(stores.tenantId,membership.tenantId))).limit(1);
  if(!storeInfo)return packageError('Package Details','Store access denied.',403);
  const storeMarket=marketFromPlatform(storeInfo.platform);
  const schedules=(body.priceSchedules??[]).map(item=>({...item,originalPrice:Math.round(Number(item.originalPrice)*100),sellingPrice:Math.round(Number(item.sellingPrice)*100)}));
  const markets=[...new Set(body.markets??[])];
  if (markets.some(market=>!isMarket(market)) || schedules.some(item=>!markets.includes(item.market))) {
    return packageError("Pricing & Promotion","The selected markets do not match the price cards. Select MY, SG, TH or PH again.");
  }
  let recurringCampaign:RecurringCampaignRule|null=null;
  if(body.recurringCampaign!=null){
    try { recurringCampaign=validateRecurringCampaign(body.recurringCampaign,markets as RecurringMarket[]); }
    catch(error) { return packageError("Pricing & Promotion",error instanceof Error?error.message:"Check the recurring Campaign details."); }
    if(body.samePricing) return packageError("Pricing & Promotion","Uncheck Same Pricing to set monthly Campaign event prices.");
    if(recurringCampaign.events.some(event=>markets.some(market=>{
      const first=recurringCampaign!.events[0].prices[market as RecurringMarket];
      const current=event.prices[market as RecurringMarket];
      return !first||!current||first.originalPrice!==current.originalPrice||first.sellingPrice!==current.sellingPrice;
    }))) return packageError("Pricing & Promotion","Use one shared Campaign price for Double Day, Mid Month Madness and Payday.");
  }
  if (!markets.length || markets.some(market=>!schedules.some(item=>item.market===market&&item.priceType==="non_campaign")||!schedules.some(item=>item.market===market&&item.priceType==="campaign"))) {
    return packageError("Pricing & Promotion","Select at least one market and complete its Non-Campaign and Campaign pricing.");
  }
  if(markets.some(market=>{
    const normal=schedules.filter(item=>item.market===market&&item.priceType==="non_campaign").sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
    return normal.some((line,index)=>index>0&&(normal[index-1].effectiveTo===null||String(normal[index-1].effectiveTo)>=line.effectiveFrom));
  }))return packageError("Pricing & Promotion","Normal Day periods cannot overlap. Remove a duplicate month or adjust the custom dates.");
  if (schedules.some(item=>!isMarket(item.market)||!["campaign","non_campaign"].includes(item.priceType)||!["monthly","custom"].includes(item.promotionType)||!item.effectiveFrom||(item.effectiveTo!==null&&!item.effectiveTo)||(item.effectiveTo===null&&!body.longTerm&&!body.campaignLongTerm)||(item.effectiveTo!==null&&item.effectiveTo<item.effectiveFrom))) {
    return packageError("Pricing & Promotion","Every price requires a valid start date and end date. The end date cannot be earlier than the start date.");
  }
  if (markets.some(market=>schedules.filter(item=>item.market===market&&item.priceType==="non_campaign").some(item=>item.effectiveTo===null)!==Boolean(body.longTerm))) {
    return packageError("Pricing & Promotion","Long-term Package must have no end date; other packages need an end date.");
  }
  if(body.longTerm&&markets.some(market=>schedules.filter(item=>item.market===market&&item.priceType==="non_campaign").length!==1))return packageError("Pricing & Promotion","A Long-term Package needs one Normal Day start date.");
  if (markets.some(market=>body.campaignLongTerm&&schedules.filter(item=>item.market===market&&item.priceType==="campaign").length!==1)) {
    return packageError("Pricing & Promotion","Long-term Campaign pricing needs one open-ended date range per market.");
  }
  if (schedules.some(item=>item.priceType==="campaign"&&((body.campaignLongTerm&&item.effectiveTo!==null&&!recurringCampaign)||(item.effectiveTo===null&&!body.campaignLongTerm&&(!body.longTerm||!schedules.some(base=>base.market===item.market&&base.priceType==="non_campaign"&&base.effectiveTo===null&&base.effectiveFrom===item.effectiveFrom&&base.originalPrice===item.originalPrice&&base.sellingPrice===item.sellingPrice)))))) {
    return packageError("Pricing & Promotion","Open-ended Campaign dates must be selected as Long-term Package or match the shared Non-Campaign pricing.");
  }
  if(recurringCampaign&&markets.some(market=>{
    const base=schedules.find(item=>item.market===market&&item.priceType==="non_campaign");
    if(schedules.filter(item=>item.market===market&&item.priceType==="non_campaign").length!==1)return true;
    const campaign=schedules.filter(item=>item.market===market&&item.priceType==="campaign");
    const firstPrice=recurringCampaign!.events[0].prices[market as RecurringMarket];
    return !base||base.effectiveFrom>recurringCampaign!.startDate||(!body.longTerm&&(recurringCampaign!.endDate===null||base.effectiveTo===null||base.effectiveTo<recurringCampaign!.endDate))||campaign.length!==1||campaign[0].effectiveFrom!==recurringCampaign!.startDate||campaign[0].effectiveTo!==recurringCampaign!.endDate||!firstPrice||campaign[0].originalPrice!==Math.round(firstPrice.originalPrice*100)||campaign[0].sellingPrice!==Math.round(firstPrice.sellingPrice*100);
  })) {
    return packageError("Pricing & Promotion","Recurring Campaign dates and first event price must match the Campaign card. Non-Campaign pricing must cover the same period.");
  }
  const periodKeys=(market:string,priceType:"non_campaign"|"campaign")=>schedules.filter(item=>item.market===market&&item.priceType===priceType).map(item=>`${item.promotionType}|${item.effectiveFrom}|${item.effectiveTo}`).sort().join(",");
  if (markets.some(market=>periodKeys(market,"non_campaign")!==periodKeys(markets[0],"non_campaign")||periodKeys(market,"campaign")!==periodKeys(markets[0],"campaign"))) {
    return packageError("Pricing & Promotion","All selected markets must use the same promotion dates for each pricing type.");
  }
  if (platforms.some(item => !["Shopee","Lazada","TikTok Shop"].includes(item.platform) || !item.packageSku)) {
    return packageError("Package Details","Every selected sales platform needs its own listing SKU.");
  }
  const normalizedSkus = platforms.map(item => item.packageSku.toUpperCase());
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    return packageError("Package Details","Each platform listing SKU must be different.");
  }
  const components = body.components.map(item => ({
    inventorySku:String(item.inventorySku ?? "").trim(),
    name:String(item.name ?? "").trim(),
    quantity:Number(item.quantity),
    kind:item.kind === "gift" ? "gift" as const : "product" as const,
  }));
  if (components.some(item => !item.inventorySku || !item.name || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    return packageError("Inventory Items","Every inventory item needs an OXM SKU, item name and a whole-number quantity of at least 1.");
  }
  if (schedules.some(item=>!Number.isFinite(item.originalPrice)||!Number.isFinite(item.sellingPrice)||item.originalPrice<=0||item.sellingPrice<=0||item.sellingPrice>item.originalPrice)) {
    return packageError("Pricing & Promotion","Enter positive Original and Selling prices. Selling Price cannot be higher than Original Price.");
  }

  const captureFingerprint=captureInventory?inventoryFingerprint({storeId:body.storeId,name:body.name.trim(),mode,components,platforms,markets,schedules,samePricing:!!body.samePricing,longTerm:!!body.longTerm,campaignLongTerm:!!body.campaignLongTerm,recurringCampaign,changeNote:body.changeNote?.trim()??'',calculatorSettings:body.calculatorSettings??null}):null;
  if(captureInventory){catalogProducts(components);if(!body.clientRequestId)return packageError("Saving","A stable package request ID is required. Refresh and retry.");}
  const db = await getDb();
  const requestedPackageId = body.packageId ? String(body.packageId) : null;
  const clientRequestId=!requestedPackageId ? body.clientRequestId : undefined;
  if(clientRequestId!==undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientRequestId))
    return packageError("Saving","Invalid package request. Refresh the form and try again.");
  if(clientRequestId){
    const [prior]=await db.select().from(packages).where(eq(packages.id,clientRequestId)).limit(1);
    if(prior){
      if(prior.deletedAt || prior.tenantId!==membership.tenantId || prior.storeId!==body.storeId || prior.createdBy.toLowerCase()!==user.email.toLowerCase())
        return packageError("Saving","This package request is already in use. Refresh the form and try again.",409);
      const [priorVersion]=await db.select().from(packageVersions).where(eq(packageVersions.packageId,prior.id)).orderBy(desc(packageVersions.version)).limit(1);
      const [initialVersion]=captureInventory?await db.select().from(packageVersions).where(and(eq(packageVersions.packageId,prior.id),eq(packageVersions.version,1))).limit(1):[];
      if(captureInventory&&initialVersion?.calculatorSettings?._inventoryCaptureFingerprint!==captureFingerprint)return packageError("Saving","This request already saved different package details. Refresh and check the saved package before creating another.",409);
      if(!priorVersion)return packageError("Saving","This package is still being saved. Refresh the page and try again.",503);
      if(mode==="draft" || priorVersion.sheetSyncStatus==="synced")
        return Response.json({ok:true,packageId:prior.id,version:priorVersion.version,status:prior.status,sheetSyncStatus:priorVersion.sheetSyncStatus});
      return Response.json({ok:false,savedAsDraft:true,packageId:prior.id,version:priorVersion.version,
        error:"The package was saved as a draft. Refresh the list and use Create Package on its card to retry Google Sheet sync."},{status:503});
    }
  }
  const [packageSkuConflict] = await db.select({ id:packages.id }).from(packages)
    .where(and(eq(packages.storeId,body.storeId),eq(packages.packageSku,platforms[0].packageSku),isNull(packages.deletedAt))).limit(1);
  if (packageSkuConflict && (!requestedPackageId || packageSkuConflict.id!==requestedPackageId) && !(captureInventory&&packageSkuConflict.id===clientRequestId)) {
    return packageError("Package Details",`Listing SKU ${platforms[0].packageSku} is already used by another package in this store. Enter a different SKU.`,409,"BATCH_SKU_CONFLICT");
  }
  for (const line of platforms) {
    const conflict = await db.select({ packageId:packagePlatformSkus.packageId }).from(packagePlatformSkus)
      .innerJoin(packages, eq(packages.id,packagePlatformSkus.packageId))
      .where(and(eq(packagePlatformSkus.storeId, body.storeId), eq(packagePlatformSkus.platform, line.platform), eq(packagePlatformSkus.packageSku, line.packageSku),isNull(packages.deletedAt)))
      .limit(1);
    if (conflict[0] && (!requestedPackageId || conflict[0].packageId !== requestedPackageId) && !(captureInventory&&conflict[0].packageId===clientRequestId)) {
      return packageError("Package Details",`${line.platform} listing SKU ${line.packageSku} is already used by another package in this store. Enter a different SKU.`,409,"BATCH_SKU_CONFLICT");
    }
  }

  const now = new Date().toISOString();
  const packageId = requestedPackageId ?? clientRequestId ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  let nextVersion = 1;
  let previousComponents: ComponentLine[] = [];
  let previousVersion:typeof packageVersions.$inferSelect|undefined;
  let existingPackage:typeof packages.$inferSelect|null=null;
  if (requestedPackageId) {
    const [existing] = await db.select().from(packages)
      .where(and(eq(packages.id, requestedPackageId), eq(packages.tenantId, membership.tenantId),isNull(packages.deletedAt))).limit(1);
    if (!existing) return packageError("Saving","This package no longer exists. Refresh the page and try again.",404);
    if (existing.storeId !== body.storeId || !await canAccessStore(db,membership,existing.storeId)) {
      return packageError("Package Details","You no longer have permission to edit packages for this store.",403);
    }
    if(mode==="draft"&&!(["draft","review"].includes(existing.status)))return packageError("Saving","Only an unpublished package can be saved as a draft.",409);
    const [latest] = await db.select().from(packageVersions)
      .where(eq(packageVersions.packageId, requestedPackageId)).orderBy(desc(packageVersions.version)).limit(1);
    if (body.expectedVersion !== undefined && body.expectedVersion !== Number(latest?.version ?? 0))
      return packageError("Saving","This package was changed after you opened it. Close the editor, refresh the list and review the latest version before saving.",409);
    if(blocksNewVersionForUnsyncedSheet(existing.status,latest?.sheetSyncStatus,latest?.createdAt,mode))
      return packageError("Saving",["draft","review"].includes(existing.status)
        ? "This draft is still syncing to Google Sheet. Wait for the current save to finish, then refresh the list and try again."
        : "Retry the unsynced version before creating another version.",409);
    existingPackage=existing;
    nextVersion = Number(latest?.version ?? 0) + 1;
    previousComponents = latest?.components ?? [];
    previousVersion = latest;
  }

  const diff = componentDiff(previousComponents, components);
  const metadata:PackageMetadata={name:body.name.trim(),market:markets.join(","),channel:platforms.map(item=>item.platform).join(", "),packageSku:platforms[0].packageSku};
  const [oldPrices, oldSkus] = previousVersion ? await Promise.all([
    db.select().from(packagePrices).where(eq(packagePrices.versionId,previousVersion.id)),
    db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,previousVersion.id)),
  ]) : [[], []];
  const longTermLifecycle=Boolean(body.longTerm||body.campaignLongTerm||recurringCampaign||previousVersion?.calculatorSettings?._longTermLifecycle===true);
  if(!body.longTerm&&!body.campaignLongTerm){
    const bounded=boundCampaignPeriods(schedules);
    schedules.splice(0,schedules.length,...bounded);
  }
  const primaryPeriod=schedules.find(item=>item.effectiveTo===null)??schedules.find(item=>item.priceType==="campaign")!;
  const changeSummary = nextVersion === 1 ? "新开配套" : previousVersion
    ? emailChangeSummary({components,calculatorSettings:{_packageMetadata:metadata,_recurringCampaign:recurringCampaign}},previousVersion,schedules,oldPrices,platforms,oldSkus)
    : "配套资料修改（历史比较资料不足）";
  const captureReplay=await db.transaction(async tx => {
    if(captureInventory){
      await lockInventoryCatalog(tx,membership.tenantId);
      const [prior]=await tx.select().from(packages).where(eq(packages.id,packageId)).limit(1);
      if(prior){
        const [version]=await tx.select().from(packageVersions).where(eq(packageVersions.packageId,prior.id)).orderBy(desc(packageVersions.version)).limit(1);
        const [initialVersion]=await tx.select().from(packageVersions).where(and(eq(packageVersions.packageId,prior.id),eq(packageVersions.version,1))).limit(1);
        if(prior.deletedAt||prior.tenantId!==membership.tenantId||prior.storeId!==body.storeId||prior.createdBy.toLowerCase()!==user.email.toLowerCase()||initialVersion?.calculatorSettings?._inventoryCaptureFingerprint!==captureFingerprint||!version)throw new InventoryCatalogError('This request was already used for different package details. Refresh and check the saved package.');
        return {packageId:prior.id,version:version.version,status:prior.status,sheetSyncStatus:version.sheetSyncStatus};
      }
      await captureInventoryProducts(tx,membership.tenantId,body.storeId!,versionId,components);
    }
    if (!requestedPackageId) {
      await tx.insert(packages).values({
        id:packageId,
        tenantId:membership.tenantId,
        storeId:body.storeId!,
        packageSku:platforms[0].packageSku,
        name:body.name!.trim(),
        channel:platforms.map(item => item.platform).join(", "),
        market:markets.join(","),
        status:captureInventory&&mode==="publish"?packageLifecycleStatus(schedules,{_longTermLifecycle:longTermLifecycle},marketToday(storeMarket)):"draft",
        createdBy:user.email,
        updatedAt:now,
      });
    } else if(mode==="draft"&&existingPackage) {
      await tx.update(packages).set({...metadata,updatedAt:now}).where(and(eq(packages.id,packageId),isNull(packages.deletedAt)));
    }
    await tx.insert(packageVersions).values({
      id:versionId,
      packageId,
      version:nextVersion,
      components,
      promotionType:schedules.find(item=>item.priceType==="campaign")?.promotionType ?? "monthly",
      addedComponents:diff.added,
      removedComponents:diff.removed,
      sheetSyncStatus:mode==="draft"?"not_sent":captureInventory?"synced":"pending",
      calculatorSettings:{...(body.calculatorSettings ?? {}),...(captureFingerprint?{_inventoryCaptureFingerprint:captureFingerprint}:{}),_packageEnded:false,_samePricing:body.samePricing===true,_longTermLifecycle:longTermLifecycle,_recurringCampaign:recurringCampaign,_packageMetadata:metadata,_packageHistorySummary:{schema:1,summary:changeSummary}},
      changeNote:body.changeNote?.trim() || (nextVersion === 1 ? "Initial version" : `Version ${nextVersion}`),
      effectiveFrom:primaryPeriod.effectiveFrom,
      effectiveTo:primaryPeriod.effectiveTo,
      createdBy:user.email,
    });
    for (const item of platforms) await tx.insert(packagePlatformSkus).values({
      id:crypto.randomUUID(), packageId, versionId, storeId:body.storeId!, platform:item.platform, packageSku:item.packageSku,
    });
    for (const item of schedules) await tx.insert(packagePrices).values({
      id:crypto.randomUUID(),packageId,versionId,market:item.market,priceType:item.priceType,promotionType:item.promotionType,
      currency:MARKET_CONFIG[item.market].currency,originalPrice:item.originalPrice,sellingPrice:item.sellingPrice,
      effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo,createdBy:user.email,
    });
    await tx.insert(packageAuditLog).values({
      packageId,
      action:nextVersion === 1 ? "created" : "version_created",
      detail:`Version ${nextVersion}: +${diff.added.length} / -${diff.removed.length}; ${platforms.map(item => `${item.platform}=${item.packageSku}`).join(", ")}`,
      actor:user.email,
    });
  });

  if(captureReplay)return Response.json({ok:true,...captureReplay});
  if(captureInventory&&mode==="publish")return Response.json({ok:true,packageId,version:nextVersion,status:packageLifecycleStatus(schedules,{_longTermLifecycle:longTermLifecycle},marketToday(storeMarket)),sheetSyncStatus:"synced",added:diff.added,removed:diff.removed},{status:201});
  if (mode==="draft") return Response.json({ok:true,packageId,version:nextVersion,status:"draft",sheetSyncStatus:"not_sent",added:diff.added,removed:diff.removed},{status:201});

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
    promotionType:schedules.map(item=>`${item.market} ${item.priceType==="campaign"?"Campaign":"Non-Campaign"}: ${item.priceType==="campaign"&&recurringCampaign?`Monthly ${recurringCampaign.events.map(event=>recurringEventLabels[event.id]).join(", ")}`:!item.effectiveTo?"Long-term Package":item.promotionType==="custom"?"Custom":"Monthly"}`).join(" | "),
    startDate:schedules.filter(item=>item.market===markets[0]).map(item=>`${item.priceType==="campaign"?"Campaign":"Non-Campaign"} ${item.effectiveFrom}`).join(" | "),
    endDate:schedules.filter(item=>item.market===markets[0]).map(item=>`${item.priceType==="campaign"?"Campaign":"Non-Campaign"} ${item.effectiveTo??"Ongoing"}`).join(" | "),
    shopeeSku:platformMap["Shopee"] ?? "",
    lazadaSku:platformMap["Lazada"] ?? "",
    tiktokSku:platformMap["TikTok Shop"] ?? "",
    addedComponents:formatComponents(diff.added),
    removedComponents:formatComponents(diff.removed),
    currentComponents:formatComponents(components),
    changedBy:user.email,
    syncStatus:"Synced",
    changeSummary,
  });
  if (sync.status!=="synced") {
    await db.update(packageVersions).set({ sheetSyncStatus:sync.status }).where(eq(packageVersions.id, versionId));
    const unpublished=!requestedPackageId||["draft","review"].includes(existingPackage?.status??"");
    return Response.json({ok:false,savedAsDraft:unpublished,packageId,version:nextVersion,error:unpublished
      ? `Package saved as a draft because Google Sheet sync failed: ${sync.reason}. Retry Create from the draft card.`
      : `Google Sheet sync failed: ${sync.reason}. The previous published version remains visible. Retry after the Sheet connection is restored.`},{status:503});
  }
  const status=packageLifecycleStatus(schedules,{_longTermLifecycle:longTermLifecycle},marketToday(storeMarket));
  await db.transaction(async tx=>{
    await tx.update(packageVersions).set({sheetSyncStatus:"synced"}).where(eq(packageVersions.id,versionId));
    await tx.update(packages).set({...metadata,status,updatedAt:new Date().toISOString()}).where(and(eq(packages.id,packageId),isNull(packages.deletedAt)));
  });

  return Response.json({
    ok:true,
    packageId,
    version:nextVersion,
    added:diff.added,
    removed:diff.removed,
    sheetSyncStatus:sync.status,
    status,
    sheetSyncReason:"reason" in sync ? sync.reason : null,
    historySheetUrl:"https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit#gid=2129880014",
  }, { status:201 });
}

export async function POST(request:Request) {
  try {
    return await savePackage(request);
  } catch (error) {
    return saveFailure(error);
  }
}

export async function PATCH(request:Request) {
  try {
    const user=await getChatGPTUser();
    if(!user)return packageError("Saving","Sign in again to publish this package.",401);
    const membership=await membershipFor(user.email);
    if(!membership?.active)return packageError("Saving","Your account cannot publish packages.",403);
    const db=await getDb();
    if(!await canAccessModule(db,membership,"packages"))return packageError("Saving","Packages & Pricing is not enabled for this account.",403);
    const body=await request.json().catch(()=>null) as {packageId?:unknown;action?:unknown;expectedVersion?:unknown}|null;
    if(!["publish","retry","end"].includes(String(body?.action))||typeof body?.packageId!=="string")return packageError("Saving","Choose a package action.");
    const [item]=await db.select().from(packages).where(and(eq(packages.id,body.packageId),eq(packages.tenantId,membership.tenantId),isNull(packages.deletedAt))).limit(1);
    if(!item||!await canAccessStore(db,membership,item.storeId))return packageError("Saving","Package not found or store access denied.",404);
    if(body.action==="end")return endPackage(db,membership.tenantId,item.id,user.email,body.expectedVersion);
    if(!historyWebhookConfigured())return packageError("Saving","Package History Google Sheet is not connected. The draft was not published.",503);
    const [version]=await db.select().from(packageVersions).where(eq(packageVersions.packageId,item.id)).orderBy(desc(packageVersions.version)).limit(1);
    if(!version)return packageError("Saving","This package has no saved version.",409);
    const unpublished=["draft","review"].includes(item.status);
    if(body.action==="publish"&&!unpublished)return packageError("Saving","Only a draft package can be published.",409);
    if(body.action==="retry"&&(unpublished||!["pending","failed"].includes(version.sheetSyncStatus)))
      return packageError("Saving","There is no failed package version to retry.",409);
    const [priceRows,skuRows,storeRows]=await Promise.all([
      db.select().from(packagePrices).where(eq(packagePrices.versionId,version.id)),
      db.select().from(packagePlatformSkus).where(eq(packagePlatformSkus.versionId,version.id)),
      db.select({name:stores.name,platform:stores.platform}).from(stores).where(eq(stores.id,item.storeId)).limit(1),
    ]);
    const platformMap=Object.fromEntries(["Shopee","Lazada","TikTok Shop"].map(platform=>[platform,skuRows.filter(row=>row.platform===platform).map(row=>row.packageSku).join(" | ")]));
    const priceType=(value:string)=>value==="campaign"?"Campaign":"Non-Campaign";
    const metadata=versionMetadata(version.calculatorSettings);
    const ended=version.calculatorSettings?._packageEnded===true;
    const sync=version.sheetSyncStatus==="synced" ? {status:"synced" as const} : await syncHistoryToGoogleSheet({
      timestamp:version.createdAt,changeId:`${item.id}-v${version.version}`,
      projectOwner:version.createdBy,store:storeRows[0]?.name??item.storeId,packageName:metadata?.name??item.name,version:version.version,
      action:packageHistoryAction(version.calculatorSettings,version.version),
      promotionType:ended?"Ended":priceRows.map(row=>`${priceMarket(row.market,row.currency)} ${priceType(row.priceType)}: ${!row.effectiveTo?"Long-term Package":row.promotionType==="custom"?"Custom":"Monthly"}`).join(" | "),
      startDate:ended?version.effectiveFrom:priceRows.filter(row=>priceMarket(row.market,row.currency)===(metadata?.market??item.market).split(",")[0]).map(row=>`${priceType(row.priceType)} ${row.effectiveFrom}`).join(" | "),
      endDate:ended?version.effectiveTo:priceRows.filter(row=>priceMarket(row.market,row.currency)===(metadata?.market??item.market).split(",")[0]).map(row=>`${priceType(row.priceType)} ${row.effectiveTo??"Ongoing"}`).join(" | "),
      shopeeSku:platformMap.Shopee??"",lazadaSku:platformMap.Lazada??"",tiktokSku:platformMap["TikTok Shop"]??"",
      addedComponents:formatComponents(version.addedComponents),removedComponents:formatComponents(version.removedComponents),
      currentComponents:formatComponents(version.components),changedBy:version.createdBy,syncStatus:"Synced",
      changeSummary:await versionChangeSummary(db,version),
    });
    if(sync.status!=="synced"){
      await db.update(packageVersions).set({sheetSyncStatus:sync.status}).where(eq(packageVersions.id,version.id));
      return packageError("Saving",ended?`Package remains ended. History Sheet sync and email notification are still pending: ${sync.reason}.`:`Google Sheet sync failed: ${sync.reason}. ${unpublished?"The package remains a draft.":"The published package is unchanged."}`,503);
    }
    const status=packageLifecycleStatus(priceRows,version.calculatorSettings,marketToday(marketFromPlatform(storeRows[0]?.platform)));
    await db.transaction(async tx=>{
      await tx.select({id:packages.id}).from(packages).where(eq(packages.id,item.id)).for("update");
      await tx.update(packageVersions).set({sheetSyncStatus:"synced"}).where(eq(packageVersions.id,version.id));
      const [latest]=await tx.select({id:packageVersions.id}).from(packageVersions).where(eq(packageVersions.packageId,item.id)).orderBy(desc(packageVersions.version)).limit(1);
      if(latest?.id!==version.id)return;
      await tx.update(packages).set({...metadata,status,updatedAt:new Date().toISOString()}).where(and(eq(packages.id,item.id),isNull(packages.deletedAt)));
      await tx.insert(packageAuditLog).values({packageId:item.id,action:"published",detail:`Version ${version.version} published to Package History`,actor:user.email});
    });
    return Response.json({ok:true,packageId:item.id,status,sheetSyncStatus:"synced"});
  }catch(error){return saveFailure(error);}
}

export async function DELETE(request:Request) {
  try {
    const user=await getChatGPTUser();
    if(!user)return Response.json({error:"Authentication required"},{status:401});
    const membership=await membershipFor(user.email);
    if(!membership?.active||membership.role!=="superadmin")return Response.json({error:"Super Admin access required"},{status:403});
    const db=await getDb();
    if(!await canAccessModule(db,membership,"packages"))return Response.json({error:"Packages & Pricing is not enabled"},{status:403});
    const body=await request.json().catch(()=>null) as {packageId?:unknown}|null;
    if(typeof body?.packageId!=="string")return Response.json({error:"Package ID required"},{status:400});
    const [item]=await db.select().from(packages).where(and(eq(packages.id,body.packageId),eq(packages.tenantId,membership.tenantId),isNull(packages.deletedAt))).limit(1);
    if(!item||!await canAccessStore(db,membership,item.storeId))return Response.json({error:"Package not found"},{status:404});
    const now=new Date().toISOString();
    await db.transaction(async tx=>{
      await tx.update(packages).set({deletedAt:now,deletedBy:user.email,updatedAt:now}).where(and(eq(packages.id,item.id),isNull(packages.deletedAt)));
      await tx.insert(packageAuditLog).values({packageId:item.id,action:"deleted",detail:`Package ${item.name} removed from active listings; versions retained`,actor:user.email});
    });
    return Response.json({ok:true,packageId:item.id});
  }catch(error){return saveFailure(error);}
}
