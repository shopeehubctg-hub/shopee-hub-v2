import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { adBalances, customerUsers, dashboardSnapshots, managementActions, stores, tenants } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { contactsForStore } from "../../project-group-links";

export const dynamic = "force-dynamic";

const connectedShopeeStoreNames = [
  "AgePros By Swissmed","Berlanco Beauty Official","Berlanco SG","Beyoute Official Store","Beyoute Singapore","BioTech by Swissmed","Bonlife Official Store","Bonlife SG","Bugucare by Naturelish","CTG4U Malaysia","Daionica Official Store","Dancoly Paris HQ","Dr Smile Whitening by CTG4u","Dr Smile Whitening SG by CTG4u.sg","Eco Plus by Naturelish","Funffy by CTG4u","Go Herb Singapore","GoHerb Official Store","Hair Factory Official","iLady Haircare by CTG4u","iLady Haircare SG by CTG4u","ILady SG","J Packaging","Jeeroul by CTG4u","Jen Mommy Essential Oil","Jourish Natural Wellness","KATA Care Malaysia","KATA Marine Malaysia","KATA Singapore","LivAct Official Store","livact.os.sg","M Formula SG","M+ SkinPro by CTG4u","Master Nerv Official Store","MCS Malaysia","MCS Singapore","MFormula Official","Mizino Official Store","Mizino Premium","Moesie Malaysia","NatureLish Healthcare","Naturelish Healthcare Singapore","Naturelish Isokae by CTG4u","NINOKO Official Store","Ninoko Singapore","NomoQ Malaysia","PAW PAWs Official","Petavit Official Store","Scale Gem Collagen by CTG4u","Scale Gem SG","Scale Story Official Store","Scale Story SG","SkinDae Official Store","SkinDae SG","True Golden Care by Naturelish","Uro360 by CTG4u","White Skin Care","Wiluv Official","Yuan Chuan Tang Herbal by CTG4u","Zeero MY","Zeero SG","Zeero Skincare SG",
];
const AD_BALANCE_SHEET_CSV = "https://docs.google.com/spreadsheets/d/13NOwTGkbDjW8y869CvS6lr6H8I7XRn3I0urt_-rqkgs/gviz/tq?tqx=out:csv&sheet=Sheet1";
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

async function readSheetBalance(storeName: string) {
  try {
    const response = await fetch(AD_BALANCE_SHEET_CSV, { cache: "no-store" });
    if (!response.ok) return null;
    const lines = (await response.text()).trim().split(/\r?\n/).slice(1);
    const matches = lines.map(parseCsvLine).filter((row) => (adBalanceAliases[row[1]] ?? row[1]) === storeName);
    const latest = matches.sort((a, b) => b[0].localeCompare(a[0]))[0];
    const balance = Number(latest?.[2]);
    if (!latest || !Number.isFinite(balance) || balance < 0) return null;
    return {
      balance,
      balanceDate: latest[0],
      sourceStoreName: latest[1],
      sourceUpdatedAt: `${latest[0]} · 9:00 am`,
      syncStatus: "current",
    };
  } catch {
    return null;
  }
}

function storeIdFor(name: string) {
  return `shopee-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function isSingaporeStore(name: string) {
  return /\bSG\b|Singapore|\.sg$/i.test(name);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  const db = await getDb();
  const [membership] = await db.select({ tenantId: customerUsers.tenantId })
    .from(customerUsers)
    .where(eq(customerUsers.email, user.email.toLowerCase()))
    .limit(1);
  if (!membership) return Response.json({ error: "No customer dashboard is assigned to this account" }, { status: 403 });

  const [tenant] = await db.select().from(tenants).where(and(eq(tenants.id, membership.tenantId), eq(tenants.active, true))).limit(1);
  if (!tenant) return Response.json({ error: "Customer dashboard is inactive" }, { status: 403 });

  const tenantStores = await db.select().from(stores).where(eq(stores.tenantId, tenant.id));
  const storedByName = new Map(tenantStores.map((store) => [store.name, store]));
  const visibleStores = connectedShopeeStoreNames.map((name) => storedByName.get(name) ?? ({
    id: storeIdFor(name), tenantId: tenant.id, name, platform: isSingaporeStore(name) ? "Shopee SG" : "Shopee MY", bigSellerName: name, createdAt: "",
  }));
  const requestedStoreId = new URL(request.url).searchParams.get("storeId");
  const allStoresRequested = !requestedStoreId || requestedStoreId === "all";
  const selectedStore = requestedStoreId && !allStoresRequested
    ? visibleStores.find((store) => store.id === requestedStoreId)
    : (allStoresRequested ? undefined : visibleStores[0]);
  if (requestedStoreId && !allStoresRequested && !selectedStore) return Response.json({ error: "Store access denied" }, { status: 403 });
  const latest = allStoresRequested ? [] : await db.select().from(dashboardSnapshots)
    .where(selectedStore
      ? and(eq(dashboardSnapshots.tenantId, tenant.id), eq(dashboardSnapshots.storeId, selectedStore.id))
      : eq(dashboardSnapshots.tenantId, tenant.id))
    .orderBy(desc(dashboardSnapshots.importedAt), desc(dashboardSnapshots.id))
    .limit(1);
  const latestBalance = allStoresRequested || !selectedStore ? [] : await db.select().from(adBalances)
    .where(and(eq(adBalances.tenantId, tenant.id), eq(adBalances.storeId, selectedStore.id)))
    .orderBy(desc(adBalances.balanceDate), desc(adBalances.importedAt), desc(adBalances.id))
    .limit(1);
  const sheetBalance = selectedStore ? await readSheetBalance(selectedStore.name) : null;
  const actions = await db.select().from(managementActions)
    .where(selectedStore
      ? and(eq(managementActions.tenantId, tenant.id), eq(managementActions.storeId, selectedStore.id))
      : eq(managementActions.tenantId, tenant.id))
    .orderBy(desc(managementActions.actionDate), desc(managementActions.id))
    .limit(20);

  return Response.json({
    customer: { id: tenant.id, name: tenant.name },
    stores: visibleStores.map(({ id, name, platform }) => ({ id, name, platform, contacts: contactsForStore(name) })),
    selectedStoreId: allStoresRequested ? "all" : (selectedStore?.id ?? null),
    snapshot: latest[0] ?? null,
    adBalance: sheetBalance ?? (latestBalance[0] ? {
      balance: latestBalance[0].balanceCents / 100,
      balanceDate: latestBalance[0].balanceDate,
      sourceStoreName: latestBalance[0].sourceStoreName,
      sourceUpdatedAt: `${latestBalance[0].balanceDate} · 9:00 am`,
      syncStatus: "current",
    } : null),
    actions,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
