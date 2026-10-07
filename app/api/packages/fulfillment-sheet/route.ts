import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customerUsers, packagePlatformSkus, packages, packageVersions, stores } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { canAccessModule, canAccessStore } from "../../../module-access";
import { buildKitRows, KitExportError } from "../../../package-kit-export";

export const dynamic="force-dynamic";

function fail(error:string,status:number) {
  return Response.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if (!user) return fail("Authentication required.",401);
  const db=await getDb();
  const [membership]=await db.select({tenantId:customerUsers.tenantId,role:customerUsers.role,active:customerUsers.active,moduleAccessMode:customerUsers.moduleAccessMode,storeAccessMode:customerUsers.storeAccessMode,id:customerUsers.id})
    .from(customerUsers).where(eq(customerUsers.email,user.email.toLowerCase())).limit(1);
  if (!membership||!membership.active||membership.role==="customer"||!await canAccessModule(db,membership,"packages")) return fail("Manager or Super Admin access is required.",403);
  let input:unknown;
  try { input=await request.json(); } catch { return fail("Invalid request.",400); }
  if (!input||typeof input!=="object") return fail("Invalid request.",400);
  const body=input as {storeId?:unknown;packageIds?:unknown};
  const storeId=body.storeId;
  const packageIds=body.packageIds;
  if (typeof storeId!=="string"||!storeId||storeId==="all"||!Array.isArray(packageIds)||!packageIds.length||packageIds.length>100||packageIds.some(id=>typeof id!=="string"||!id)||new Set(packageIds).size!==packageIds.length) {
    return fail("Choose one store and 1–100 packages from that store.",400);
  }
  const [store]=await db.select({id:stores.id}).from(stores).where(and(eq(stores.id,storeId),eq(stores.tenantId,membership.tenantId))).limit(1);
  if (!store||!await canAccessStore(db,membership,storeId)) return fail("Store access denied.",403);
  const selected=await db.select({id:packages.id,name:packages.name,status:packages.status}).from(packages)
    .where(and(eq(packages.tenantId,membership.tenantId),eq(packages.storeId,storeId),isNull(packages.deletedAt),inArray(packages.id,packageIds)));
  if (selected.length!==packageIds.length) return fail("One or more packages are no longer available in this store. Refresh the page.",409);
  if (selected.some(item=>["draft","review"].includes(item.status))) return fail("Draft and Review packages cannot be exported.",409);
  const versions=await db.select().from(packageVersions).where(inArray(packageVersions.packageId,packageIds)).orderBy(desc(packageVersions.version));
  const latest=new Map<string,typeof versions[number]>();
  for (const version of versions) if (!latest.has(version.packageId)) latest.set(version.packageId,version);
  if (selected.some(item=>latest.get(item.id)?.sheetSyncStatus!=="synced")) return fail("All selected packages must have their latest version synced before export. Refresh the page and retry.",409);
  const versionIds=selected.map(item=>latest.get(item.id)!.id);
  const platformRows=await db.select({versionId:packagePlatformSkus.versionId,platform:packagePlatformSkus.platform,packageSku:packagePlatformSkus.packageSku})
    .from(packagePlatformSkus).where(inArray(packagePlatformSkus.versionId,versionIds));
  try {
    const byId=new Map(selected.map(item=>[item.id,item]));
    const kitPackages=packageIds.map(id=>{
      const item=byId.get(id)!;
      const version=latest.get(id)!;
      return {id,name:item.name,components:version.components,platforms:platformRows.filter(platform=>platform.versionId===version.id)};
    });
    const rows=buildKitRows(kitPackages);
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({versions:packageIds.map(id=>[id,latest.get(id)!.version]),rows})));
    const signature=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
    return Response.json({packageCount:selected.length,rowCount:rows.length,signature,rows},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    if (error instanceof KitExportError) return fail(error.message,409);
    throw error;
  }
}
