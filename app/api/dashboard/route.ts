import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { adBalances, customerUsers, dashboardSnapshots, managementActions, stores, tenants } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { contactsForStore } from "../../project-group-links";

export const dynamic = "force-dynamic";

const connectedShopeeStoreNames = [
  "AgePros By Swissmed","Berlanco Beauty Official","Berlanco SG","Beyoute Official Store","Beyoute Singapore","BioTech by Swissmed","Bonlife Official Store","Bonlife SG","Bugucare by Naturelish","CTG4U Malaysia","Daionica Official Store","Dancoly Paris HQ","Dr Smile Whitening by CTG4u","Dr Smile Whitening SG by CTG4u.sg","Eco Plus by Naturelish","Funffy by CTG4u","Go Herb Singapore","GoHerb Official Store","Hair Factory Official","iLady Haircare by CTG4u","iLady Haircare SG by CTG4u","ILady SG","J Packaging","Jeeroul by CTG4u","Jen Mommy Essential Oil","Jourish Natural Wellness","KATA Care Malaysia","KATA Marine Malaysia","KATA Singapore","LivAct Official Store","livact.os.sg","M Formula SG","M+ SkinPro by CTG4u","Master Nerv Official Store","MCS Malaysia","MCS Singapore","MFormula Official","Mizino Official Store","Mizino Premium","Moesie Malaysia","NatureLish Healthcare","Naturelish Healthcare Singapore","Naturelish Isokae by CTG4u","NINOKO Official Store","Ninoko Singapore","NomoQ Malaysia","PAW PAWs Official","Petavit Official Store","Scale Gem Collagen by CTG4u","Scale Gem SG","Scale Story Official Store","Scale Story SG","SkinDae Official Store","SkinDae SG","True Golden Care by Naturelish","Uro360 by CTG4u","White Skin Care","Wiluv Official","Yuan Chuan Tang Herbal by CTG4u","Zeero MY","Zeero SG","Zeero Skincare SG",
];

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
    adBalance: latestBalance[0] ? {
      balance: latestBalance[0].balanceCents / 100,
      balanceDate: latestBalance[0].balanceDate,
      sourceStoreName: latestBalance[0].sourceStoreName,
      sourceUpdatedAt: `${latestBalance[0].balanceDate} · 9:00 am`,
      syncStatus: "current",
    } : null,
    actions,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
