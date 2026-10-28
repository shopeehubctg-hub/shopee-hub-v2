import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { coFundVouchers, customerUsers, dashboardSnapshots, linkDirectoryProjects, linkDirectoryStores, projectProductCatalog, stores, tenantModulePermissions, tenants, userModulePermissions, userStoreAccess } from "../../../db/schema";
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
import { deploymentTarget } from "../../deployment-isolation";
import { dashboardQueryPlan, dashboardSectionAllowed } from "../../dashboard-query-plan";
import { dashboardReadCache } from "../../dashboard-read-cache";

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
    try {
      const query=new URLSearchParams({select:"id,campaign_name,campaign_date,campaign_start_at,campaign_end_at,voucher_name,discount_amount,currency,quantity",store_id:`eq.${storeId}`,order:"campaign_start_at.desc,id.desc"});
      if(tenantId)query.set("tenant_id",`eq.${tenantId}`);
      const rows=await supabaseRest<Array<{id:number;campaign_name:string;campaign_date:string|null;campaign_start_at:string|null;campaign_end_at:string|null;voucher_name:string;discount_amount:string|number;currency:string;quantity:number}>>(`co_fund_vouchers?${query}`);
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

async function readAdPerformance(storeIds:string[], tenantId:string, allStores:boolean, refresh=false) {
  if (!storeIds.length) return {daily:[],updatedAt:null,rows:[] as AdPerformanceRow[]};
  try {
    return await dashboardReadCache(`${deploymentTarget()}:${process.env.SUPABASE_URL ?? "local"}:ad:${tenantId}:${[...storeIds].sort().join(",")}:${allStores}`,async()=>{
    const rows:AdPerformanceRow[]=[];
    const pageSize=1000;
    async function page(offset:number){
      const query=new URLSearchParams({select:"store_id,performance_date,spend,sales,views,clicks,conversions,sold,synced_at",tenant_id:`eq.${tenantId}`,store_id:`in.(${storeIds.join(",")})`,order:"performance_date.asc,store_id.asc",limit:String(pageSize),offset:String(offset)});
      return supabaseRest<AdPerformanceRow[]>(`ad_performance_daily?${query}`);
    }
    const first=await page(0);rows.push(...first);
    if(first.length===pageSize){
      for(let offset=pageSize;;offset+=3*pageSize){
        const batch=await Promise.all([page(offset),page(offset+pageSize),page(offset+2*pageSize)]);
        rows.push(...batch.flat());
        if(batch.some(chunk=>chunk.length<pageSize))break;
      }
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
    },refresh);
  } catch (error) {
    console.error("[advertising] FullAd read failed",error);
    return {daily:[],updatedAt:null,rows:[] as AdPerformanceRow[]};
  }
}

type BalanceStore={id:string;name:string;sourceName?:string;bigsellerName?:string;storedName?:string;directoryName?:string;bigSellerName?:string};
async function readBalances(visibleStores:BalanceStore[],tenantId:string) {
  const result=new Map<string,SheetBalance>();
  if(!visibleStores.length)return result;
  const today=new Date(Date.now()+8*60*60*1000).toISOString().slice(0,10);
  const minimum=new Date(Date.parse(`${today}T00:00:00Z`)-3*86400000).toISOString().slice(0,10);
  try {
    const query=new URLSearchParams({select:"store_id,source_store_name,balance_cents,balance_date,imported_at",tenant_id:`eq.${tenantId}`,store_id:`in.(${visibleStores.map(store=>store.id).join(",")})`,balance_date:`gte.${minimum}`,and:`(balance_date.lte.${today})`,order:"balance_date.desc,imported_at.desc",limit:"1000"});
    const rows=await supabaseRest<Array<{store_id:string;source_store_name:string;balance_cents:string|number;balance_date:string;imported_at:string}>>(`ad_balances?${query}`);
    const allowed=new Set(visibleStores.map(store=>store.id));
    for(const row of rows){
      const cents=Number(row.balance_cents);
      if(!allowed.has(row.store_id)||result.has(row.store_id)||!Number.isSafeInteger(cents)||cents<0||!isCurrentBalanceDate(row.balance_date))continue;
      result.set(row.store_id,{balance:cents/100,balanceDate:row.balance_date,sourceStoreName:row.source_store_name,sourceUpdatedAt:null,syncStatus:"current"});
    }
  } catch(error){console.error("[dashboard] Balance database read failed",error);}
  if(deploymentTarget()==="staging"||visibleStores.every(store=>result.has(store.id)))return result;
  const source=await readSheetBalances();
  for(const store of visibleStores){
    if(result.has(store.id))continue;
    const value=balanceForStore(source,store.name,store.sourceName??"",store.bigsellerName??"",store.storedName??"",store.directoryName??"",store.bigSellerName??"");
    if(value)result.set(store.id,value);
  }
  return result;
}

async function readCatalog(storeName:string) {
  const sourceName=sourceShopNameFor(storeName);
  const query=new URLSearchParams({select:"item_id,product_name,product_category,commission_fee_rate_bps,main_product,synced_at",source_shop_name:`eq.${sourceName}`,order:"main_product.desc,product_name.asc",limit:"1000"});
  const rows=await supabaseRest<Array<{item_id:string;product_name:string;product_category:string;commission_fee_rate_bps:number;main_product:boolean;synced_at:string}>>(`project_product_catalog?${query}`);
  if(rows.length){
    const products=rows.map(row=>({itemId:row.item_id,productName:row.product_name,productCategory:row.product_category,commissionFeeRate:row.commission_fee_rate_bps/100,mainProduct:row.main_product}));
    return {shopName:sourceName,products,mainProducts:products.filter(row=>row.mainProduct),syncedAt:rows[0].synced_at};
  }
  return deploymentTarget()==="staging"?null:readProductCatalogSheet(storeName);
}

async function readActions(storeIds:string[],tenantId:string){
  if(!storeIds.length)return [];
  const query=new URLSearchParams({select:"action_date,category,title,detail",tenant_id:`eq.${tenantId}`,store_id:`in.(${storeIds.join(",")})`,order:"action_date.desc,id.desc",limit:"20"});
  const rows=await supabaseRest<Array<{action_date:string;category:string;title:string;detail:string}>>(`management_actions?${query}`);
  return rows.map(row=>({actionDate:row.action_date,category:row.category,title:row.title,detail:row.detail}));
}

function dashboardResponse(payload:Record<string,unknown>,started:number){
  return Response.json({...payload,environment:deploymentTarget()},{headers:{"Cache-Control":"private, no-store","Server-Timing":`dashboard;dur=${(performance.now()-started).toFixed(1)}`}});
}

export async function GET(request: Request) {
  const started=performance.now();
  const plan=dashboardQueryPlan(request);
  if(!plan.valid)return Response.json({error:"Unknown dashboard module"},{status:400});
  // Vercel serves the portable dashboard data, while identity and permissions
  // are read securely from the staging Supabase project.
  if (process.env.VERCEL === "1") {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error:"Authentication required" },{ status:401 });
    const memberships = await supabaseRest<Array<{id:number;tenant_id:string;role:"customer"|"manager"|"superadmin";active:boolean;module_access_mode:"role_default"|"custom";store_access_mode:"all"|"selected"}>>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`);
    const membership=memberships[0];
    if(!membership?.active)return Response.json({error:"Portal access is disabled"},{status:403});
    const [tenantModules,userModules,userStores,tenantStatus]=await Promise.all([
      supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(membership.tenant_id)}`),
      supabaseRest<Array<{module_id:string;enabled:boolean}>>(`user_module_permissions?select=module_id,enabled&user_id=eq.${membership.id}`),
      membership.store_access_mode==="selected"?supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&user_id=eq.${membership.id}`):Promise.resolve([]),
      supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(membership.tenant_id)}&limit=1`),
    ]);
    if(!tenantStatus[0]?.active)return Response.json({error:"Tenant access is disabled"},{status:403});
    const tenantEnabled=new Map(tenantModules.map(row=>[row.module_id,row.enabled]));
    const customEnabled=new Set(userModules.filter(row=>row.enabled).map(row=>row.module_id));
    const clientEnabledModules=ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false);
    const enabledModules=membership.role==="superadmin"?ALL_PORTAL_MODULE_IDS:membership.module_access_mode==="custom"?ALL_PORTAL_MODULE_IDS.filter(id=>customEnabled.has(id)&&(id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false)):ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?tenantEnabled.get(id)===true:tenantEnabled.get(id)!==false);
    if(!dashboardSectionAllowed(plan.section,enabledModules,membership.role,membership.role==="superadmin"))return Response.json({error:"Module access denied"},{status:403});
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
    const snapshotRowsPromise=selectedStore&&plan.snapshot?supabaseRest<Array<{payload:Record<string,unknown>;imported_at:string}>>(`dashboard_snapshots?select=payload,imported_at&tenant_id=eq.${encodeURIComponent(membership.tenant_id)}&store_id=eq.${encodeURIComponent(selectedStore.id)}&order=imported_at.desc,id.desc&limit=1`):[];
    const canViewAdvertising=plan.advertising&&enabledModules.includes("advertising");
    const showTopUps=shouldShowAllStoresTopUps(allStoresRequested,membership.role,visibleStores.length,canViewAdvertising);
    const [sheetBalances,productProfile,selectedCoFundVouchers,adPerformance,snapshotRows,actions] = await Promise.all([
      canViewAdvertising&&(selectedStore||showTopUps)?readBalances(selectedStore?[selectedStore]:visibleStores,membership.tenant_id):Promise.resolve(new Map<string,SheetBalance>()),
      selectedStore&&plan.catalog?readCatalog(selectedStore.sourceName):Promise.resolve(null),
      selectedStore&&plan.vouchers?readCoFundVouchers(selectedStore.id,membership.tenant_id):Promise.resolve([]),
      readAdPerformance(authorizedAdStoreIds(visibleStores,selectedStore,canViewAdvertising),membership.tenant_id,allStoresRequested,plan.refresh),
      snapshotRowsPromise,
      plan.actions?readActions(selectedStore?[selectedStore.id]:visibleStores.map(store=>store.id),membership.tenant_id):Promise.resolve([]),
    ]);
    const staticPayload=deploymentTarget()==="staging"?null:selectedStore?(storeSnapshots[selectedStore.sourceName]??storeSnapshots[selectedStore.bigsellerName]??null):null;
    const snapshotPayload=plan.snapshot?(snapshotRows[0]?.payload??staticPayload):null;

    const sheetBalance=selectedStore?balanceForStore(sheetBalances,selectedStore.id):null;
    const adTopUpOverview=showTopUps?summarizeAllStoresTopUps(
      visibleStores.map(store=>({...store,topUpOwner:normalizeTopUpOwner(directory.byId.get(store.id)?.ads_top_up_owner)})),
      adPerformance.rows,
      new Map(visibleStores.map(store=>[store.id,balanceForStore(sheetBalances,store.id)])),
    ):null;
    return dashboardResponse({
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
      snapshot: snapshotPayload ? withoutAdCampaigns({ payload: snapshotPayload, importedAt: snapshotRows[0]?.imported_at ?? snapshotPayload.sourceUpdated ?? new Date().toISOString() }, canViewAdvertising) : null,
      adBalance: canViewAdvertising && sheetBalance ? { ...sheetBalance, topUpOwner: normalizeTopUpOwner(selectedDirectory?.ads_top_up_owner) } : null,
      adPerformance:adPerformance.daily,
      adPerformanceUpdatedAt:adPerformance.updatedAt,
      adTopUpOverview,
      actions,
      productProfile,
      coFundVouchers:selectedCoFundVouchers,
      user: { email: user.email },
      access: { role:membership.role, enabledModules, clientEnabledModules, canManagePermissions:membership.role==="superadmin" },
      dataSources: {
        directory: "Store directory",
        advertisingBalance: "Daily advertising balance",
        performance: snapshotPayload ? "Portable snapshot exported from the ChatGPT Sites dashboard" : "Advertising exports and bundled dashboard data",
      },
    },started);
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
  const userModuleRows = await db.select().from(userModulePermissions).where(eq(userModulePermissions.userId,membership.id));
  const enabledModules = membership.role === "superadmin" ? ALL_PORTAL_MODULE_IDS : membership.moduleAccessMode === "custom"
    ? ALL_PORTAL_MODULE_IDS.filter(moduleId=>userModuleRows.find(row=>row.moduleId===moduleId)?.enabled===true && (moduleId==="live_calendar" ? configuredModules.get(moduleId)===true : configuredModules.get(moduleId)!==false))
    : clientEnabledModules;
  if(!dashboardSectionAllowed(plan.section,enabledModules,membership.role,membership.role==="superadmin"))return Response.json({error:"Module access denied"},{status:403});
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
  const canViewAdvertising=plan.advertising&&enabledModules.includes("advertising");
  const showTopUps=shouldShowAllStoresTopUps(allStoresRequested,membership.role,visibleStores.length,canViewAdvertising);
  const sheetBalancesPromise=canViewAdvertising&&(selectedStore||showTopUps)?readBalances(selectedStore?[selectedStore]:visibleStores,tenant.id):Promise.resolve(new Map<string,SheetBalance>());
  const latest = !plan.snapshot||allStoresRequested ? [] : await db.select().from(dashboardSnapshots)
    .where(selectedStore
      ? and(eq(dashboardSnapshots.tenantId, tenant.id), eq(dashboardSnapshots.storeId, selectedStore.id))
      : eq(dashboardSnapshots.tenantId, tenant.id))
    .orderBy(desc(dashboardSnapshots.importedAt), desc(dashboardSnapshots.id))
    .limit(1);
  const sheetBalances=await sheetBalancesPromise;
  const sheetBalance = selectedStore ? balanceForStore(sheetBalances,selectedStore.id) : null;
  const topUpOwner = selectedStore
    ? normalizeTopUpOwner(directoryById.get(selectedStore.id)?.adsTopUpOwner)
    : null;
  const actions = plan.actions?await readActions(selectedStore?[selectedStore.id]:visibleStores.map(store=>store.id),tenant.id):[];
  const selectedCoFundVouchers = selectedStore&&plan.vouchers ? await readCoFundVouchers(selectedStore.id,tenant.id) : [];
  const sourceShopName=selectedStore&&plan.catalog?sourceShopNameFor(selectedStore.directoryName):null;
  const storedProducts=!sourceShopName?[]:await db.select().from(projectProductCatalog)
    .where(eq(projectProductCatalog.sourceShopName,sourceShopName))
    .orderBy(desc(projectProductCatalog.mainProduct),projectProductCatalog.productName);
  const sheetProductProfile=selectedStore&&plan.catalog&&!storedProducts.length&&deploymentTarget()!=="staging"?await readProductCatalogSheet(selectedStore.directoryName):null;
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

  const adPerformance=await readAdPerformance(authorizedAdStoreIds(visibleStores,selectedStore,canViewAdvertising),tenant.id,allStoresRequested,plan.refresh);
  const adTopUpOverview=showTopUps?summarizeAllStoresTopUps(
    visibleStores.map(store=>({...store,topUpOwner:normalizeTopUpOwner(directoryById.get(store.id)?.adsTopUpOwner)})),
    adPerformance.rows,
    new Map(visibleStores.map(store=>[store.id,balanceForStore(sheetBalances,store.id)])),
  ):null;
  return dashboardResponse({
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
  },started);
}
