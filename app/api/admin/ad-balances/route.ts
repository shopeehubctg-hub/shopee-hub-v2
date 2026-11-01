import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adBalances, customerUsers, stores } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

const ADMIN_EMAIL = "shopeehub.ctg@gmail.com";
const TENANT_ID = "j-packaging";
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
  "Kata Skincare Malaysia": "KATA Marine Malaysia",
};
type BalanceRow = { date: string; storeName: string; balance: number };

function normalized(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return Response.json({ error: "Administrator access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { rows?: BalanceRow[] } | null;
  if (!Array.isArray(body?.rows) || !body.rows.length) {
    return Response.json({ error: "At least one balance row is required" }, { status: 400 });
  }

  const db = await getDb();
  const membership = await db.select().from(customerUsers)
    .where(and(eq(customerUsers.email, ADMIN_EMAIL), eq(customerUsers.tenantId, TENANT_ID))).limit(1);
  if (!membership.length) return Response.json({ error: "Dashboard owner is not configured" }, { status: 400 });

  const tenantStores = await db.select().from(stores).where(eq(stores.tenantId, TENANT_ID));
  const storeByName = new Map<string, typeof tenantStores[number] | null>();
  for (const store of tenantStores) {
    for (const name of [store.name, store.bigSellerName]) {
      const key = normalized(name);
      if (!key) continue;
      const previous = storeByName.get(key);
      storeByName.set(key, previous === undefined || previous?.id === store.id ? store : null);
    }
  }
  const updated: string[] = [];
  const unmatched: string[] = [];

  for (const row of body.rows) {
    const sourceName = typeof row?.storeName === "string" ? row.storeName.trim() : "";
    const directKey = normalized(sourceName);
    const legacyName = aliases[sourceName];
    const store = storeByName.has(directKey)
      ? storeByName.get(directKey)
      : legacyName ? storeByName.get(normalized(legacyName)) : undefined;
    const balance = Number(row?.balance);
    if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(row?.date ?? "") || !Number.isFinite(balance) || balance < 0) {
      unmatched.push(sourceName || "Unknown store");
      continue;
    }
    await db.insert(adBalances).values({
      tenantId: TENANT_ID,
      storeId: store.id,
      sourceStoreName: sourceName,
      balanceCents: Math.round(balance * 100),
      balanceDate: row.date,
    }).onConflictDoUpdate({
      target: [adBalances.storeId, adBalances.balanceDate],
      set: {
        sourceStoreName: sourceName,
        balanceCents: Math.round(balance * 100),
        importedAt: new Date().toISOString(),
      },
    });
    updated.push(store.name);
  }

  return Response.json({ ok: true, updatedCount: updated.length, updated, unmatched });
}
