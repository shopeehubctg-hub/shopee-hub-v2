import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { coFundVouchers, customerUsers, dashboardSnapshots, linkDirectoryProjects, linkDirectoryStores, managementActions, projectProductCatalog, stores, tenantModulePermissions, tenants, userModulePermissions, userStoreAccess } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ALL_PORTAL_MODULE_IDS } from "../../module-permissions";
import { storeDirectory } from "../../store-directory";
import { storeSnapshots } from "../../store-snapshots";
import { readProductCatalogSheet, sourceShopNameFor } from "../../product-catalog";
import { supabaseRest } from "../../supabase-rest";
import { aggregateAdPerformanceByDate, authorizedAdStoreIds, latestAdSyncTime } from "../../ad-performance.js";
import { withoutAdCampaigns } from "../../dashboard-snapshot.js";
import { shouldShowAllStoresTopUps, summarizeAllStoresTopUps } from "../../ad-topup-overview.js";
import { balanceCsvColumns, isCurrentBalanceDate, parseAdBalance } from "../../ad-balance-validation.js";
import { canonicalStoreId, type RegistryStore } from "../../live-calendar-model";

export const dynamic = "force-dynamic";

const AD_BALANCE_SHEET_CSV = "https://docs.google.com/spreadsheets/d/13NOwTGkbDjW8y869CvS6lr6H8I7XRn3I0urt_-rqkgs/export?format=csv&gid=421872532";
const GOOGLE_SHEET_TIMEOUT_MS = 5_000;
const adBalanceAliases: Record<string, string> = {
  "Scale Story SG by CTG4u": "Scale Story SG",
  "Zeero Skincare SG by CTG4u": "Zeero Skincare SG",
  "LivAct Singapore": "livact.os.sg",
  "Naturelish GoHerb SG": "Go Herb Singapore",
  "SkinDae SG by CTG4u": "SkinDae SG",
  "Kata Skincare Singapore": "KATA Singapore",
  "MCS Skincare SG by CTG4u": "MCS Singapore",
  "NomoQ by CTG4u": "NomoQ Malaysia",
  "DrSmile Whitening SG by CTG4u": "Dr Smile Whitening SG by CTG4u.sg",
  "Bonlife Singapore": "Bonlife SG",
  "Naturelish Bugucare by CTG4u": "Bugucare by Naturelish",
  "CTG4u Malaysia": "CTG4U Malaysia",
  "Naturelish Uro360 by CTG4u": "Uro360 by CTG4u",
  "NatureLish Recovit by CTG4u": "NatureLish Healthcare",
  "Naturelish Recovit SG by CTG4u": "Naturelish Healthcare Singapore",
  "MCS Skincare by CTG4u": "MCS Malaysia",
  "Zeero Skincare Official": "Zeero MY",
  "SkinDae MY by CTG4u": "SkinDae Official Store",
  "Naturelish Eco Plus by CTG4u": "Eco Plus by Naturelish",
  "Kata Skincare Malaysia": "KATA Marine Malaysia",
};
function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

type SheetBalance = {balance:number;balanceDate:string;sourceStoreName:string;sourceUpdatedAt:null;syncStatus:"current"};

async function readSheetBalances() {
  const balances = new Map<string,SheetBalance>();
  try {
    const response = await fetch(AD_BALANCE_SHEET_CSV, {
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_SHEET_TIMEOUT_MS),
    });
    if (!response.ok) return balances;
    const [header,...lines] = (await response.text()).trim().split(/\r?\n/);
    const columns=balanceCsvColumns(parseCsvLine(header));
    if (!columns) return balances;
    for (const line of lines) {
      const row = parseCsvLine(line);
      const balance=parseAdBalance(row[columns.balanceIndex]);
      const balanceDate=row[columns.dateIndex]?.trim();
      const sourceStoreName=row[columns.storeIndex]?.trim();
      if (!isCurrentBalanceDate(balanceDate) || !sourceStoreName || balance === null) continue;
      const record:SheetBalance = {balance,balanceDate,sourceStoreName,sourceUpdatedAt:null,syncStatus:"current"};
      for (const name of new Set([sourceStoreName,adBalanceAliases[sourceStoreName] ?? sourceStoreName])) {
        if (!balances.has(name) || balanceDate > balances.get(name)!.balanceDate) balances.set(name,record);
      }
    }
    return balances;
  } catch {
    return balances;
  }
}

function balanceForStore(balances:Map<string,SheetBalance>, ...names:string[]) {
  return names.reduce<SheetBalance|null>((latest,name)=>{
    const candidate=balances.get(name);
    return candidate&&(!latest||candidate.balanceDate>latest.balanceDate)?candidate:latest;
  },null);
}

function normalizeTopUpOwner(value?: string | null) {
  if (/client\s*approval/i.test(value ?? "")) return "client_approval";
  if (/shopee\s*hub/i.test(value ?? "")) return "shopee_hub";
  if (/client/i.test(value ?? "")) return "client";
  return null;
}

async function readCoFundVouchers(storeId:string, tenantId?:string) {
  try {
    const db=await getDb();
    return await db.select({
      id:coFundVouchers.id,
      campaignName:coFundVouchers.campaignName,
      campaignDate:coFundVouchers.campaignDate,
      campaignStartAt:coFundVouchers.campaignStartAt,
      campaignEndAt:coFundVouchers.campaignEndAt,
      voucherName:coFundVouchers.voucherName,
      discountAmount:coFundVouchers.discountAmount,
      currency:coFundVouchers.currency,
      quantity:coFundVouchers.quantity,
    }).from(coFundVouchers)
      .where(tenantId?and(eq(coFundVouchers.tenantId,tenantId),eq(coFundVouchers.storeId,storeId)):eq(coFundVouchers.storeId,storeId))
      .orderBy(desc(coFundVouchers.campaignDate),desc(coFundVouchers.id));
  } catch {
    const projectUrl=process.env.SUPABASE_URL;
    const secretKey=process.env.SUPABASE_SECRET_KEY;
    if(!projectUrl||!secretKey)return [];
    try {
      const query=new URLSearchParams({select:"id,campaign_name,campaign_date,campaign_start_at,campaign_end_at,voucher_name,discount_amount,currency,quantity",store_id:`eq.${storeId}`,order:"campaign_start_at.desc,id.desc"});
      if(tenantId)query.set("tenant_id",`eq.${tenantId}`);
      const response=await fetch(`${projectUrl}/rest/v1/co_fund_vouchers?${query}`,{headers:{apikey:secretKey},cache:"no-store"});
      if(!response.ok)return [];
      const rows=await response.json() as Array<{id:number;campaign_name:string;campaign_date:string|null;campaign_start_at:string|null;campaign_end_at:string|null;voucher_name:string;discount_amount:string|number;currency:string;quantity:number}>;
      return rows.map(row=>({id:row.id,campaignName:row.campaign_name,campaignDate:row.campaign_date,campaignStartAt:row.campaign_start_at,campaignEndAt:row.campaign_end_at,voucherName:row.voucher_name,discountAmount:String(row.discount_amount),currency:row.currency,quantity:row.quantity}));
    } catch {
      return [];
    }
  }
}

type AdPerformanceRow = {
  store_id:string; performance_date:string; spend:string|number; sales:string|number;
  views:string|number; clicks:string|number; conversions:string|number; sold:string|number; synced_at:string|null;
};

async function readAdPerformance(storeIds:string[], tenantId:string, allStores:boolean) {
  if (!storeIds.length) return {daily:[],updatedAt:null,rows:[] as AdPerformanceRow[]};
  try {
    const rows:AdPerformanceRow[]=[];
    const pageSize=1000;
    for (let offset=0; ; offset+=pageSize) {
      const query=new URLSearchParams({
        select:"store_id,performance_date,spend,sales,views,clicks,conversions,sold,synced_at",
        tenant_id:`eq.${tenantId}`,
        store_id:`in.(${storeIds.join(",")})`,
        order:"performance_date.asc,store_id.asc",
        limit:String(pageSize),
        offset:String(offset),
      });
      const page=await supabaseRest<AdPerformanceRow[]>(`ad_performance_daily?${query}`);
      rows.push(...page);
      if (page.length<pageSize) break;
    }
    const updatedAt=latestAdSyncTime(rows);
    if (allStores) return {daily:aggregateAdPerformanceByDate(rows),updatedAt,rows};
    return {daily:rows.map(row=>({
      date:row.performance_date,store:storeIds[0],storeIds:[row.store_id],spend:Number(row.spend),sales:Number(row.sales),
      roas:Number(row.spend)>0?Number(row.sales)/Number(row.spend):0,
      views:Number(row.views),clicks:Number(row.clicks),
      ctr:Number(row.views)>0?Number(row.clicks)/Number(row.views):0,
      conversion:Number(row.conversions),sold:Number(row.sold),
      acos:Number(row.sales)>0?Number(row.spend)/Number(row.sales):0,
    })),updatedAt,rows};
  } catch (error) {
    console.error("[advertising] FullAd read failed",error);
    return {daily:[],updatedAt:null,rows:[] as AdPerformanceRow[]};
  }
}

export async function GET(request: Request) {
  // Vercel serves the portable dashboard data, while identity and permissions
  // are read securely from the staging Supabase project.
  if (process.env.VERCEL === "1") {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error:"Authentication required" },{ status:401 });
    const memberships = await supabaseRest<Array<{id:number;tenant_id:string;role:"customer"|"manager"|"superadmin";active:boolean;module_access_mode:"role_default"|"custom";store_access_mode:"all"|"selected"}>>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`);
    const membership=memberships[0];
    if(!membership?.active)return Response.json({error:"Portal access is disabled"},{status:403});
    const [tenantModules,userModules,userStores]=await Promise.all([
      supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(membership.tenant_id)}`),
      membership.module_access_mode==="custom"?supabaseRest<Array<{module_id:string;enabled:boolean}>>(`user_module_permissions?select=module_id,enabled&user_id=eq.${membership.id}`):Promise.resolve([]),
      membership.store_access_mode==="selected"?supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&user_id=eq.${membership.id}`):Promise.resolve([]),
    ]);
    const tenantEnabled=new Map(tenantModules.map(row=>[row.module_id,row.enabled]));
    const customEnabled=new Set(userModules.filter(row=>row.enabled).map(row=>row.module_id));
    const clientEnabledModules=ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false);
    const enabledModules=membership.role==="superadmin"?ALL_PORTAL_MODULE_IDS:membership.module_access_mode==="custom"?ALL_PORTAL_MODULE_IDS.filter(id=>customEnabled.has(id)&&(id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false)):ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false);
    const assignedStoreIds=new Set(userStores.map(row=>canonicalStoreId(row.store_id)));
    const [registry,directory]=await Promise.all([
      supabaseRest<RegistryStore[]>(`stores?select=id,name,display_name,platform,bigseller_name&tenant_id=eq.${encodeURIComponent(membership.tenant_id)}&order=name.asc`),
      storeDirectory(membership.tenant_id),
    ]);
    const visibleStores = registry.filter(store=>canonicalStoreId(store.id)===store.id).map(store=>({
      id:store.id,name:store.display_name??store.name,
      sourceName:directory.byId.get(store.id)?.store_name??store.bigseller_name,
      bigsellerName:store.bigseller_name,platform:store.platform,
    }))
      .filter(store=>membership.role==="superadmin"||membership.store_access_mode==="all"||assignedStoreIds.has(store.id));
    const requestedStoreId = new URL(request.url).searchParams.get("storeId");
    const allStoresRequested = !requestedStoreId || requestedStoreId === "all";
    const selectedStore = allStoresRequested ? undefined : visibleStores.find((store) => store.id === requestedStoreId);
    if (requestedStoreId && !allStoresRequested && !selectedStore) {
      return Response.json({ error: "Store access denied" }, { status: 403 });
    }
    const selectedDirectory = selectedStore ? directory.byId.get(selectedStore.id) : undefined;
    const snapshotPayload = selectedStore ? storeSnapshots[selectedStore.sourceName] ?? storeSnapshots[selectedStore.bigsellerName] ?? null : null;
    const canViewAdvertising=enabledModules.includes("advertising");
    const showTopUps=shouldShowAllStoresTopUps(allStoresRequested,membership.role,visibleStores.length,canViewAdvertising);
    const [sheetBalances,productProfile,selectedCoFundVouchers,adPerformance] = await Promise.all([
      canViewAdvertising&&(selectedStore||showTopUps)?readSheetBalances():Promise.resolve(new Map<string,SheetBalance>()),
      selectedStore?readProductCatalogSheet(selectedStore.sourceName):Promise.resolve(null),
      selectedStore?readCoFundVouchers(selectedStore.id):Promise.resolve([]),
      readAdPerformance(authorizedAdStoreIds(visibleStores,selectedStore,canViewAdvertising),membership.tenant_id,allStoresRequested),
    ]);
    const sheetBalance=selectedStore?balanceForStore(sheetBalances,selectedStore.name,selectedStore.sourceName,selectedStore.bigsellerName):null;
    const adTopUpOverview=showTopUps?summarizeAllStoresTopUps(
      visibleStores.map(store=>({...store,topUpOwner:normalizeTopUpOwner(directory.byId.get(store.id)?.ads_top_up_owner)})),
      adPerformance.rows,
      new Map(visibleStores.map(store=>[store.id,balanceForStore(sheetBalances,store.name,store.sourceName,store.bigsellerName)])),
    ):null;
    return Response.json({
      customer: { id: "shopee-hub", name: "Shopee Hub" },
      stores: visibleStores.map((store) => {
        const profile = directory.byId.get(store.id);
        return {
          id:store.id,name:store.name,sourceName:store.sourceName,platform:store.platform,
          contacts: directory.links.get(store.id)??[],
          storeGroupLink: profile?.store_group_link ?? null,
          driveLink: profile?.google_drive_link ?? null,
        };
      }),
      selectedStoreId: allStoresRequested ? "all" : selectedStore?.id ?? null,
      snapshot: snapshotPayload ? withoutAdCampaigns({ payload: snapshotPayload, importedAt: snapshotPayload.sourceUpdated ?? new Date().toISOString() }, canViewAdvertising) : null,
      adBalance: canViewAdvertising && sheetBalance ? { ...sheetBalance, topUpOwner: normalizeTopUpOwner(selectedDirectory?.ads_top_up_owner) } : null,
      adPerformance:adPerformance.daily,
      adPerformanceUpdatedAt:adPerformance.updatedAt,
      adTopUpOverview,
      actions: [],
      productProfile,
      coFundVouchers:selectedCoFundVouchers,
      user: { email: user.email },
      access: { role:membership.role, enabledModules, clientEnabledModules, canManagePermissions:membership.role==="superadmin" },
      dataSources: {
        directory: "Store directory",
        advertisingBalance: "Daily advertising balance",
        performance: snapshotPayload ? "Portable snapshot exported from the ChatGPT Sites dashboard" : "Advertising exports and bundled dashboard data",
      },
    }, { headers: { "Cache-Control":"private, no-store" } });
  }

  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const db = await getDb();
  const [membership] = await db.select({ id:customerUsers.id, tenantId: customerUsers.tenantId, role: customerUsers.role, active:customerUsers.active, moduleAccessMode:customerUsers.moduleAccessMode, storeAccessMode:customerUsers.storeAccessMode })
    .from(customerUsers)
    .where(eq(customerUsers.email, user.email.toLowerCase()))
    .limit(1);
  if (!membership?.active) return Response.json({ error: "This portal account is inactive or has not been assigned" }, { status: 403 });

  const [tenant] = await db.select().from(tenants).where(and(eq(tenants.id, membership.tenantId), eq(tenants.active, true))).limit(1);
  if (!tenant) return Response.json({ error: "Customer dashboard is inactive" }, { status: 403 });

  const allTenantStores = await db.select().from(stores).where(eq(stores.tenantId, tenant.id));
  const assignedStoreRows = membership.storeAccessMode === "selected" ? await db.select({ storeId:userStoreAccess.storeId }).from(userStoreAccess).where(eq(userStoreAccess.userId,membership.id)) : [];
  const assignedStoreIds = new Set(assignedStoreRows.map(row=>canonicalStoreId(row.storeId)));
  const canonicalTenantStores=allTenantStores.filter(store=>canonicalStoreId(store.id)===store.id);
  const tenantStores = membership.role === "superadmin" || membership.storeAccessMode === "all" ? canonicalTenantStores : canonicalTenantStores.filter(store=>assignedStoreIds.has(store.id));
  const modulePermissionRows = await db.select().from(tenantModulePermissions).where(eq(tenantModulePermissions.tenantId, tenant.id));
  const configuredModules = new Map(modulePermissionRows.map((row) => [row.moduleId, row.enabled]));
  const clientEnabledModules = ALL_PORTAL_MODULE_IDS.filter((moduleId) => moduleId === "live_calendar" ? configuredModules.get(moduleId) === true : configuredModules.get(moduleId) !== false);
  const userModuleRows = membership.moduleAccessMode === "custom" ? await db.select().from(userModulePermissions).where(eq(userModulePermissions.userId,membership.id)) : [];
  const enabledModules = membership.role === "superadmin" ? ALL_PORTAL_MODULE_IDS : membership.moduleAccessMode === "custom"
    ? ALL_PORTAL_MODULE_IDS.filter(moduleId=>userModuleRows.find(row=>row.moduleId===moduleId)?.enabled===true && (moduleId!=="live_calendar" || configuredModules.get(moduleId)===true))
    : membership.role === "customer" ? clientEnabledModules : ALL_PORTAL_MODULE_IDS.filter(moduleId=>moduleId!=="live_calendar" || configuredModules.get(moduleId)===true);
  const [profiles,projects]=await Promise.all([
    db.select().from(linkDirectoryStores).where(eq(linkDirectoryStores.tenantId,tenant.id)),
    db.select().from(linkDirectoryProjects).orderBy(linkDirectoryProjects.id),
  ]);
  const directoryById=new Map(profiles.map(profile=>[profile.storeId,profile]));
  const linksById=new Map<string,Array<{project:string;href:string;driveLink:string}>>();
  for(const project of projects){
    if(!directoryById.has(project.storeId))continue;
    const links=linksById.get(project.storeId)??[];
    links.push({project:project.projectName,href:project.projectGroupLink,driveLink:project.googleDriveLink??""});
    linksById.set(project.storeId,links);
  }
  const visibleStores = tenantStores
    .filter((stored) => stored.id !== "shopee-kata-care-malaysia")
    .map((stored) => {
    const directoryName = directoryById.get(stored.id)?.storeName??stored.bigSellerName??stored.name;
    return {
      ...stored,
      storedName: stored.name,
      directoryName,
      name: stored.displayName??stored.name,
    };
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const requestedStoreId = new URL(request.url).searchParams.get("storeId");
  const allStoresRequested = !requestedStoreId || requestedStoreId === "all";
  const selectedStore = requestedStoreId && !allStoresRequested
    ? visibleStores.find((store) => store.id === requestedStoreId)
    : (allStoresRequested ? undefined : visibleStores[0]);
  if (requestedStoreId && !allStoresRequested && !selectedStore) return Response.json({ error: "Store access denied" }, { status: 403 });
  const canViewAdvertising=enabledModules.includes("advertising");
  const showTopUps=shouldShowAllStoresTopUps(allStoresRequested,membership.role,visibleStores.length,canViewAdvertising);
  const sheetBalancesPromise=canViewAdvertising&&(selectedStore||showTopUps)?readSheetBalances():Promise.resolve(new Map<string,SheetBalance>());
  const latest = allStoresRequested ? [] : await db.select().from(dashboardSnapshots)
    .where(selectedStore
      ? and(eq(dashboardSnapshots.tenantId, tenant.id), eq(dashboardSnapshots.storeId, selectedStore.id))
      : eq(dashboardSnapshots.tenantId, tenant.id))
    .orderBy(desc(dashboardSnapshots.importedAt), desc(dashboardSnapshots.id))
    .limit(1);
  const sheetBalances=await sheetBalancesPromise;
  const sheetBalance = selectedStore ? balanceForStore(sheetBalances,selectedStore.name,selectedStore.storedName,selectedStore.directoryName,selectedStore.bigSellerName) : null;
  const topUpOwner = selectedStore
    ? normalizeTopUpOwner(directoryById.get(selectedStore.id)?.adsTopUpOwner)
    : null;
  const actions = await db.select().from(managementActions)
    .where(selectedStore
      ? and(eq(managementActions.tenantId, tenant.id), eq(managementActions.storeId, selectedStore.id))
      : eq(managementActions.tenantId, tenant.id))
    .orderBy(desc(managementActions.actionDate), desc(managementActions.id))
    .limit(20);
  const selectedCoFundVouchers = selectedStore ? await readCoFundVouchers(selectedStore.id,tenant.id) : [];
  const sourceShopName=selectedStore?sourceShopNameFor(selectedStore.directoryName):null;
  const storedProducts=!sourceShopName?[]:await db.select().from(projectProductCatalog)
    .where(eq(projectProductCatalog.sourceShopName,sourceShopName))
    .orderBy(desc(projectProductCatalog.mainProduct),projectProductCatalog.productName);
  const sheetProductProfile=selectedStore&&!storedProducts.length?await readProductCatalogSheet(selectedStore.directoryName):null;
  const productProfile=storedProducts.length?{
    shopName:sourceShopName!,
    products:storedProducts.map(product=>({
      itemId:product.itemId,
      productName:product.productName,
      productCategory:product.productCategory,
      commissionFeeRate:product.commissionFeeRateBps/100,
      mainProduct:product.mainProduct,
    })),
    mainProducts:storedProducts.filter(product=>product.mainProduct).map(product=>({
      itemId:product.itemId,
      productName:product.productName,
      productCategory:product.productCategory,
      commissionFeeRate:product.commissionFeeRateBps/100,
      mainProduct:true,
    })),
    syncedAt:storedProducts[0].syncedAt,
  }:sheetProductProfile;

  const adPerformance=await readAdPerformance(authorizedAdStoreIds(visibleStores,selectedStore,canViewAdvertising),tenant.id,allStoresRequested);
  const adTopUpOverview=showTopUps?summarizeAllStoresTopUps(
    visibleStores.map(store=>({...store,topUpOwner:normalizeTopUpOwner(directoryById.get(store.id)?.adsTopUpOwner)})),
    adPerformance.rows,
    new Map(visibleStores.map(store=>[store.id,balanceForStore(sheetBalances,store.name,store.storedName,store.directoryName,store.bigSellerName)])),
  ):null;
  return Response.json({
    customer: { id: tenant.id, name: tenant.name },
    stores: visibleStores.map(({ id, name, platform, directoryName }) => {
      const directory = directoryById.get(id);
      return {
        id,
        name,
        sourceName:directoryName,
        platform,
        contacts: linksById.get(id)??[],
        storeGroupLink: directory?.storeGroupLink ?? null,
        driveLink: directory?.googleDriveLink ?? null,
      };
    }),
    selectedStoreId: allStoresRequested ? "all" : (selectedStore?.id ?? null),
    snapshot: withoutAdCampaigns(latest[0] ?? null, canViewAdvertising),
    adBalance: canViewAdvertising && sheetBalance ? { ...sheetBalance, topUpOwner } : null,
    adPerformance:adPerformance.daily,
    adPerformanceUpdatedAt:adPerformance.updatedAt,
    adTopUpOverview,
    actions,
    productProfile,
    coFundVouchers:selectedCoFundVouchers,
    user: { email: user.email },
    access: { role: membership.role, enabledModules, clientEnabledModules, canManagePermissions: membership.role === "superadmin" },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
