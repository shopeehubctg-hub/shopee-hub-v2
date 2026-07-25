import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { customerUsers, packageAuditLog, packagePrices, packages, packageVersions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

const seedPackages = [
  { id:"seed-agepros-1", storeId:"shopee-agepros-by-swissmed", packageSku:"AGP01JUN", name:"AgePros · BUY 1 FREE 5", market:"MY", channel:"Shopee", status:"active", version:1, originalPrice:438, sellingPrice:360, effectiveFrom:"2026-04-27", effectiveTo:"2026-04-30", components:[{inventorySku:"GWSMAP30S",name:"AgePros (30 Sachets)",quantity:1,kind:"product"},{inventorySku:"GWSMAS05",name:"AgePros 5 Sachets",quantity:1,kind:"gift"}] },
  { id:"seed-beyoute-1", storeId:"shopee-beyoute-official-store", packageSku:"BY01JUN", name:"Beyoute · BUY 3 FREE 1 + 2 Gifts", market:"MY", channel:"Shopee", status:"active", version:1, originalPrice:805, sellingPrice:454, effectiveFrom:"2026-06-19", effectiveTo:"2026-07-31", components:[{inventorySku:"CWBY2B15S",name:"Beyoute 15 Sachets",quantity:4,kind:"product"},{inventorySku:"CWBY2LB300",name:"Beyoute Little Bottle",quantity:1,kind:"gift"},{inventorySku:"CWBYET01",name:"Beyoute Exercise Towel",quantity:1,kind:"gift"}] },
  { id:"seed-drsmile-1", storeId:"shopee-dr-smile-whitening-by-ctg4u", packageSku:"8A26", name:"Dr Smile · Merdeka Package A", market:"MY", channel:"Shopee", status:"draft", version:1, originalPrice:324, sellingPrice:249, effectiveFrom:"2026-08-01", effectiveTo:"2026-08-31", components:[{inventorySku:"OXM-PENDING",name:"Tooth Powder",quantity:3,kind:"product"},{inventorySku:"OXM-PENDING",name:"Toothbrush",quantity:3,kind:"gift"},{inventorySku:"OXM-PENDING",name:"Reed Diffuser",quantity:1,kind:"gift"}] },
];
const ADMIN_EMAIL = "shopeehub.ctg@gmail.com";

async function membershipFor(email: string) {
  const db = getDb();
  const [membership] = await db.select({ tenantId: customerUsers.tenantId, role: customerUsers.role })
    .from(customerUsers).where(eq(customerUsers.email, email.toLowerCase())).limit(1);
  return membership;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error:"Authentication required" }, { status:401 });
  const membership = await membershipFor(user.email);
  if (!membership) return Response.json({ error:"No workspace assigned" }, { status:403 });
  const storeId = new URL(request.url).searchParams.get("storeId");
  const db = getDb();
  const rows = await db.select().from(packages)
    .where(storeId && storeId !== "all"
      ? and(eq(packages.tenantId, membership.tenantId), eq(packages.storeId, storeId))
      : eq(packages.tenantId, membership.tenantId))
    .orderBy(desc(packages.updatedAt));
  if (!rows.length) {
    const sample = storeId && storeId !== "all" ? seedPackages.filter(item => item.storeId === storeId) : seedPackages;
    return Response.json({ packages:sample, source:"sheet-migration-preview" });
  }
  const ids = rows.map(row => row.id);
  const versions = await db.select().from(packageVersions).where(inArray(packageVersions.packageId, ids)).orderBy(desc(packageVersions.version));
  const prices = await db.select().from(packagePrices).where(inArray(packagePrices.packageId, ids)).orderBy(desc(packagePrices.createdAt));
  const latestVersion = new Map<string, typeof versions[number]>();
  versions.forEach(version => { if (!latestVersion.has(version.packageId)) latestVersion.set(version.packageId, version); });
  const latestPrice = new Map<string, typeof prices[number]>();
  prices.forEach(price => { if (!latestPrice.has(price.packageId)) latestPrice.set(price.packageId, price); });
  return Response.json({ packages:rows.map(row => {
    const version = latestVersion.get(row.id);
    const price = latestPrice.get(row.id);
    return {
    ...row,
    version:version?.version ?? 1,
    components:version?.components ?? [],
    changeNote:version?.changeNote ?? "",
    effectiveFrom:version?.effectiveFrom ?? price?.effectiveFrom ?? "",
    effectiveTo:version?.effectiveTo ?? price?.effectiveTo ?? null,
    originalPrice:price?.originalPrice ?? 0,
    sellingPrice:price?.sellingPrice ?? 0,
    history:versions.filter(version => version.packageId === row.id).map(version => {
      const price = prices.find(item => item.versionId === version.id);
      return { version:version.version, changeNote:version.changeNote, effectiveFrom:version.effectiveFrom, effectiveTo:version.effectiveTo, originalPrice:price?.originalPrice, sellingPrice:price?.sellingPrice, createdAt:version.createdAt, createdBy:version.createdBy };
    }),
  }}), source:"database" });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error:"Authentication required" }, { status:401 });
  const membership = await membershipFor(user.email);
  if (!membership || (membership.role !== "manager" && user.email.toLowerCase() !== ADMIN_EMAIL)) return Response.json({ error:"Manager access required" }, { status:403 });
  const body = await request.json() as any;
  if (!body.storeId || !body.packageSku || !body.name || !body.effectiveFrom || !Array.isArray(body.components) || !body.components.length) {
    return Response.json({ error:"Store, Package SKU, name, effective date and components are required" }, { status:400 });
  }
  if (body.components.some((item:any) => !item.inventorySku || !item.name || Number(item.quantity) < 1)) {
    return Response.json({ error:"Every component requires an Inventory SKU, name and quantity" }, { status:400 });
  }
  const originalPrice = Math.round(Number(body.originalPrice) * 100);
  const sellingPrice = Math.round(Number(body.sellingPrice) * 100);
  if (!Number.isFinite(originalPrice) || !Number.isFinite(sellingPrice) || originalPrice <= 0 || sellingPrice <= 0 || sellingPrice > originalPrice) {
    return Response.json({ error:"Prices must be positive and selling price cannot exceed original price" }, { status:400 });
  }
  const db = getDb();
  const now = new Date().toISOString();
  const requestedPackageId = body.packageId ? String(body.packageId) : null;
  const packageId = requestedPackageId ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  let nextVersion = 1;
  if (requestedPackageId) {
    const [existing] = await db.select().from(packages).where(and(eq(packages.id, requestedPackageId), eq(packages.tenantId, membership.tenantId))).limit(1);
    if (!existing) return Response.json({ error:"Package not found" }, { status:404 });
    const [latest] = await db.select({ value:sql<number>`max(${packageVersions.version})` }).from(packageVersions).where(eq(packageVersions.packageId, requestedPackageId));
    nextVersion = Number(latest?.value ?? 0) + 1;
    await db.update(packages).set({ name:String(body.name).trim(), channel:body.channel ?? existing.channel, market:body.market ?? existing.market, status:body.status ?? "draft", updatedAt:now }).where(eq(packages.id, requestedPackageId));
  } else {
    await db.insert(packages).values({ id:packageId, tenantId:membership.tenantId, storeId:body.storeId, packageSku:String(body.packageSku).trim(), name:String(body.name).trim(), channel:body.channel ?? "Shopee", market:body.market ?? "MY", status:body.status ?? "draft", createdBy:user.email, updatedAt:now });
  }
  await db.batch([
    db.insert(packageVersions).values({ id:versionId, packageId, version:nextVersion, components:body.components.map((item:any) => ({ inventorySku:String(item.inventorySku).trim(), name:String(item.name).trim(), quantity:Number(item.quantity), kind:item.kind === "gift" ? "gift" : "product" })), changeNote:body.changeNote ?? (nextVersion === 1 ? "Initial version" : `Version ${nextVersion}`), effectiveFrom:body.effectiveFrom, effectiveTo:body.effectiveTo || null, createdBy:user.email }),
    db.insert(packagePrices).values({ id:crypto.randomUUID(), packageId, versionId, currency:body.market === "SG" ? "SGD" : "MYR", originalPrice, sellingPrice, effectiveFrom:body.effectiveFrom, effectiveTo:body.effectiveTo || null, createdBy:user.email }),
    db.insert(packageAuditLog).values({ packageId, action:nextVersion === 1 ? "created" : "version_created", detail:`Version ${nextVersion} created with ${body.components.length} components`, actor:user.email }),
  ]);
  return Response.json({ ok:true, packageId, version:nextVersion }, { status:201 });
}
