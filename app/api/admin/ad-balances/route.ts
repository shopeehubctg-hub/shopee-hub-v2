import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adBalances, customerUsers, stores } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

const ADMIN_EMAIL = "shopeehub.ctg@gmail.com";
const TENANT_ID = "j-packaging";
const dashboardStoreNames = new Set([
  "AgePros By Swissmed","Berlanco Beauty Official","Berlanco SG","Beyoute Official Store","Beyoute Singapore","BioTech by Swissmed","Bonlife Official Store","Bonlife SG","Bugucare by Naturelish","CTG4U Malaysia","Daionica Official Store","Dancoly Paris HQ","Dr Smile Whitening by CTG4u","Dr Smile Whitening SG by CTG4u.sg","Eco Plus by Naturelish","Funffy by CTG4u","Go Herb Singapore","GoHerb Official Store","Hair Factory Official","iLady Haircare by CTG4u","iLady Haircare SG by CTG4u","ILady SG","J Packaging","Jeeroul by CTG4u","Jen Mommy Essential Oil","Jourish Natural Wellness","KATA Care Malaysia","KATA Marine Malaysia","KATA Singapore","LivAct Official Store","livact.os.sg","M Formula SG","M+ SkinPro by CTG4u","Master Nerv Official Store","MCS Malaysia","MCS Singapore","MFormula Official","Mizino Official Store","Mizino Premium","Moesie Malaysia","NatureLish Healthcare","Naturelish Healthcare Singapore","Naturelish Isokae by CTG4u","NINOKO Official Store","Ninoko Singapore","NomoQ Malaysia","PAW PAWs Official","Petavit Official Store","Scale Gem Collagen by CTG4u","Scale Gem SG","Scale Story Official Store","Scale Story SG","SkinDae Official Store","SkinDae SG","True Golden Care by Naturelish","Uro360 by CTG4u","White Skin Care","Wiluv Official","Yuan Chuan Tang Herbal by CTG4u","Zeero MY","Zeero SG","Zeero Skincare SG",
]);

const aliases: Record<string, string> = {
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
  "Naturelish Isokae by CTG4u": "Naturelish Isokae by CTG4u",
  "NatureLish Recovit by CTG4u": "NatureLish Healthcare",
  "Naturelish Recovit SG by CTG4u": "Naturelish Healthcare Singapore",
  "MCS Skincare by CTG4u": "MCS Malaysia",
  "Zeero Skincare Official": "Zeero MY",
  "SkinDae MY by CTG4u": "SkinDae Official Store",
  "Naturelish Eco Plus by CTG4u": "Eco Plus by Naturelish",
  "Scale Gem Collagen by CTG4u": "Scale Gem Collagen by CTG4u",
};

type BalanceRow = { date: string; storeName: string; balance: number };

function storeIdFor(name: string) {
  return `shopee-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return Response.json({ error: "Administrator access required" }, { status: 403 });
  }

  const body = await request.json() as { rows?: BalanceRow[] };
  if (!Array.isArray(body.rows) || !body.rows.length) {
    return Response.json({ error: "At least one balance row is required" }, { status: 400 });
  }

  const db = await getDb();
  const membership = await db.select().from(customerUsers)
    .where(and(eq(customerUsers.email, ADMIN_EMAIL), eq(customerUsers.tenantId, TENANT_ID))).limit(1);
  if (!membership.length) return Response.json({ error: "Dashboard owner is not configured" }, { status: 400 });

  const tenantStores = await db.select().from(stores).where(eq(stores.tenantId, TENANT_ID));
  const storeByName = new Map(tenantStores.map((store) => [store.name.toLowerCase(), store]));
  const updated: string[] = [];
  const unmatched: string[] = [];

  for (const row of body.rows) {
    const canonicalName = aliases[row.storeName] ?? row.storeName;
    let store = storeByName.get(canonicalName.toLowerCase());
    const balance = Number(row.balance);
    if (!dashboardStoreNames.has(canonicalName) || !row.date || !Number.isFinite(balance) || balance < 0) {
      unmatched.push(row.storeName);
      continue;
    }
    if (!store) {
      const createdStore = {
        id: storeIdFor(canonicalName),
        tenantId: TENANT_ID,
        name: canonicalName,
        platform: /\bSG\b|Singapore|\.sg$/i.test(canonicalName) ? "Shopee SG" : "Shopee MY",
        bigSellerName: row.storeName,
      };
      await db.insert(stores).values(createdStore).onConflictDoNothing();
      store = { ...createdStore, createdAt: "" };
      storeByName.set(canonicalName.toLowerCase(), store);
    }
    await db.insert(adBalances).values({
      tenantId: TENANT_ID,
      storeId: store.id,
      sourceStoreName: row.storeName,
      balanceCents: Math.round(balance * 100),
      balanceDate: row.date,
    }).onConflictDoUpdate({
      target: [adBalances.storeId, adBalances.balanceDate],
      set: {
        sourceStoreName: row.storeName,
        balanceCents: Math.round(balance * 100),
        importedAt: new Date().toISOString(),
      },
    });
    updated.push(canonicalName);
  }

  return Response.json({ ok: true, updatedCount: updated.length, updated, unmatched });
}
