import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, fakeSellerBrands, fakeSellerReportBatches, fakeSellerReportLinks, stores, userStoreAccess } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { brandKey, canonicalReportUrl, malaysiaReportDate, validFakeSellerImportSignature } from "../../fake-seller-import";
import { canAccessModule } from "../../module-access";

export const dynamic="force-dynamic";
export const maxDuration=30;

export async function GET(request:Request) {
  const user=await getChatGPTUser();
  if (!user) return Response.json({error:"Authentication required"},{status:401});
  try {
    const db=await getDb();
    const [member]=await db.select({id:customerUsers.id,tenantId:customerUsers.tenantId,role:customerUsers.role,active:customerUsers.active,moduleAccessMode:customerUsers.moduleAccessMode,storeAccessMode:customerUsers.storeAccessMode})
      .from(customerUsers).where(eq(customerUsers.email,user.email.toLowerCase())).limit(1);
    if (!member?.active || !await canAccessModule(db,member,"protection")) return Response.json({error:"Access denied"},{status:403});
    const requested=new URL(request.url).searchParams.get("storeId");
    const allowedStores=await db.select({id:stores.id}).from(stores).where(eq(stores.tenantId,member.tenantId));
    let ids=allowedStores.map(row=>row.id);
    if (member.role!=="superadmin" && member.storeAccessMode==="selected") {
      const granted=await db.select({storeId:userStoreAccess.storeId}).from(userStoreAccess).where(eq(userStoreAccess.userId,member.id));
      const grantSet=new Set(granted.map(row=>row.storeId));
      ids=ids.filter(id=>grantSet.has(id));
    }
    if (requested && requested!=="all") {
      if (!ids.includes(requested)) return Response.json({error:"Store access denied"},{status:403});
      ids=[requested];
    }
    const rows=ids.length?await db.select({id:fakeSellerReportLinks.id,storeId:fakeSellerReportLinks.storeId,reportDate:fakeSellerReportLinks.reportDate,url:fakeSellerReportLinks.url,brand:fakeSellerReportBatches.brandName})
      .from(fakeSellerReportLinks).innerJoin(fakeSellerReportBatches,eq(fakeSellerReportLinks.batchId,fakeSellerReportBatches.id))
      .where(and(eq(fakeSellerReportLinks.tenantId,member.tenantId),inArray(fakeSellerReportLinks.storeId,ids)))
      .orderBy(desc(fakeSellerReportLinks.reportDate),desc(fakeSellerReportLinks.id)).limit(10000):[];
    return Response.json({links:rows},{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    console.error("Fake seller report read failed",error);
    return Response.json({error:"Reports are temporarily unavailable"},{status:503});
  }
}

type ImportInput={tenantId?:unknown;brand?:unknown;sourceFileId?:unknown;uploadedAt?:unknown;links?:unknown};
export async function POST(request:Request) {
  const body=await request.text();
  if (body.length>1_000_000) return Response.json({error:"Batch too large"},{status:413});
  if (!validFakeSellerImportSignature(body,request.headers.get("x-report-timestamp"),request.headers.get("x-report-signature"),process.env.FAKE_SELLER_IMPORT_SECRET)) {
    return Response.json({error:"Invalid import signature"},{status:401});
  }
  let input:ImportInput;
  try { input=JSON.parse(body) as ImportInput; } catch { return Response.json({error:"Invalid JSON"},{status:400}); }
  if (typeof input.tenantId!=="string" || typeof input.brand!=="string" || typeof input.sourceFileId!=="string" || typeof input.uploadedAt!=="string" || !Array.isArray(input.links)
    || !input.tenantId || !brandKey(input.brand) || !/^[A-Za-z0-9_-]{8,200}$/.test(input.sourceFileId) || input.links.length>5000) {
    return Response.json({error:"Invalid batch metadata"},{status:400});
  }
  const reportDate=malaysiaReportDate(input.uploadedAt);
  if (!reportDate || new Date(input.uploadedAt).getTime()>Date.now()+5*60*1000) return Response.json({error:"Invalid upload date"},{status:400});
  const launchDate=process.env.FAKE_SELLER_REPORT_START_DATE || "2026-10-20";
  if (reportDate<launchDate) return Response.json({error:"Historical files are not imported"},{status:400});
  const unique=new Map<string,string>();
  for (const entry of input.links) {
    if (typeof entry!=="string" || entry.length>2048) return Response.json({error:"Invalid product link"},{status:400});
    const canonical=canonicalReportUrl(entry);
    if (!canonical) return Response.json({error:"Only HTTPS Shopee links are accepted"},{status:400});
    unique.set(canonical,canonical);
  }
  if (!unique.size) return Response.json({error:"No report links"},{status:400});
  try {
    const db=await getDb();
    const mappings=await db.select({storeId:fakeSellerBrands.storeId,brandName:fakeSellerBrands.brandName})
      .from(fakeSellerBrands).where(and(eq(fakeSellerBrands.tenantId,input.tenantId),eq(fakeSellerBrands.brandKey,brandKey(input.brand))));
    if (!mappings.length) return Response.json({error:"Brand has no approved store mapping"},{status:422});
    const result=await db.transaction(async tx=>{
      const storesImported:string[]=[];
      let inserted=0,alreadyImported=0;
      for (const mapping of mappings) {
        const [batch]=await tx.insert(fakeSellerReportBatches).values({tenantId:input.tenantId as string,storeId:mapping.storeId,brandName:mapping.brandName,sourceFileId:input.sourceFileId as string,reportDate,uploadedAt:input.uploadedAt as string})
          .onConflictDoNothing().returning({id:fakeSellerReportBatches.id});
        if (!batch) { alreadyImported++; continue; }
        const rows=[...unique].map(([canonicalUrl,url])=>({tenantId:input.tenantId as string,storeId:mapping.storeId,batchId:batch.id,reportDate,url,canonicalUrl}));
        const added=await tx.insert(fakeSellerReportLinks).values(rows).onConflictDoNothing().returning({id:fakeSellerReportLinks.id});
        inserted+=added.length;
        storesImported.push(mapping.storeId);
      }
      return {inserted,alreadyImported,storesImported,reportDate};
    });
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    console.error("Fake seller report import failed",error);
    return Response.json({error:"Import failed; retry with the same file ID"},{status:503});
  }
}
