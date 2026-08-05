import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { adBalances, customerUsers, dashboardSnapshots, managementActions, stores, tenants } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { contactsForStore, directoryStoreNameFor } from "../../project-group-links";
import { storeSnapshots } from "../../store-snapshots";

export const dynamic = "force-dynamic";

const AD_BALANCE_SHEET_CSV = "https://docs.google.com/spreadsheets/d/13NOwTGkbDjW8y869CvS6lr6H8I7XRn3I0urt_-rqkgs/gviz/tq?tqx=out:csv&sheet=Sheet1";
const LINK_DIRECTORY_CSV = "https://docs.google.com/spreadsheets/d/1iMNKdNs5tqgXgWUQhtg-UhWcb0mP3SlGYbTOyx4avkc/gviz/tq?tqx=out:csv&sheet=WhatsApp%20Group";
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
const topUpOwnerFallbacks: Record<string, string> = {
  "AgePros By Swissmed":"shopee_hub", "Berlanco Beauty Official":"shopee_hub", "Beyoute Official Store":"shopee_hub", "BioTech by Swissmed":"shopee_hub",
  "Bonlife Official Store":"client", "CTG4u Malaysia":"client_approval", "Daionica Official Store":"client", "Dancoly Paris HQ":"shopee_hub",
  "Dr Smile Whitening by CTG4u":"client", "Funffy by CTG4u":"client_approval", "GoHerb Official Store":"client", "Hair Factory Official":"shopee_hub",
  "iLady Haircare by CTG4u":"client_approval", "J Packaging":"shopee_hub", "Jeeroul by CTG4u":"client_approval", "Jen Mommy Essential Oil":"client",
  "Jourish Natural Wellness":"client_approval", "Kata Skincare Malaysia":"client", "LivAct Official Store":"shopee_hub", "M+ SkinPro by CTG4u":"client",
  "Master Nerv Official Store":"shopee_hub", "MCS Skincare by CTG4u":"client", "MFormula Official":"client", "Mizino Official Store":"shopee_hub",
  "Mizino Premium":"shopee_hub", "Moesie Malaysia":"client", "Naturelish Bugucare by CTG4u":"client_approval", "Naturelish Eco Plus by CTG4u":"client_approval",
  "Naturelish Isokae by CTG4u":"client_approval", "NatureLish Recovit by CTG4u":"shopee_hub", "Naturelish Uro360 by CTG4u":"shopee_hub",
  "NINOKO Official Store":"client", "NomoQ by CTG4u":"client", "PAW PAWs Official":"client", "Petavit Official Store":"client",
  "Scale Gem Collagen by CTG4u":"shopee_hub", "Scale Story Official Store":"shopee_hub", "SkinDae MY by CTG4u":"shopee_hub",
  "True Golden Care by Naturelish":"client", "White Skin Care":"shopee_hub", "Yuan Chuan Tang Herbal by CTG4u":"client", "Zeero Skincare Official":"client",
};
const fallbackConnectedShopeeStoreNames = Object.keys(topUpOwnerFallbacks);

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

type LinkDirectoryContact = { project: string; href: string };
type LinkDirectoryStore = {
  name: string;
  topUpOwner: string | null;
  contacts: LinkDirectoryContact[];
  storeGroupLink: string | null;
  driveLink: string | null;
};

function fallbackDirectoryStores(): LinkDirectoryStore[] {
  return fallbackConnectedShopeeStoreNames.map((name) => ({
    name,
    topUpOwner: topUpOwnerFallbacks[name] ?? null,
    contacts: contactsForStore(name),
    storeGroupLink: null,
    driveLink: null,
  }));
}

async function readLinkDirectory(): Promise<LinkDirectoryStore[]> {
  try {
    const response = await fetch(LINK_DIRECTORY_CSV, { cache: "no-store" });
    if (!response.ok) return fallbackDirectoryStores();
    const rows = (await response.text()).trim().split(/\r?\n/).map(parseCsvLine);
    const header = rows[0] ?? [];
    const nameIndex = header.indexOf("Store Name");
    const projectIndex = header.indexOf("Project");
    const projectGroupIndex = header.indexOf("Project Group Link");
    const storeGroupIndex = header.indexOf("Store Group Link");
    const driveIndex = header.indexOf("Google Drive Link");
    const ownerIndex = header.indexOf("Ads Top Up List");
    if (nameIndex < 0) return fallbackDirectoryStores();

    const stores = new Map<string, LinkDirectoryStore>();
    for (const row of rows.slice(1)) {
      const name = row[nameIndex]?.trim();
      if (!name) continue;
      const existing = stores.get(name);
      const projectGroupLink = row[projectGroupIndex]?.trim();
      const contacts = existing?.contacts ? [...existing.contacts] : [];
      if (projectGroupLink && !contacts.some((contact) => contact.href === projectGroupLink)) {
        contacts.push({ project: row[projectIndex]?.trim() || name, href: projectGroupLink });
      }
      stores.set(name, {
        name,
        topUpOwner: existing?.topUpOwner ?? normalizeTopUpOwner(row[ownerIndex]),
        contacts,
        storeGroupLink: existing?.storeGroupLink ?? row[storeGroupIndex]?.trim() ?? null,
        driveLink: existing?.driveLink ?? row[driveIndex]?.trim() ?? null,
      });
    }
    return stores.size ? [...stores.values()] : fallbackDirectoryStores();
  } catch {
    return fallbackDirectoryStores();
  }
}

async function readSheetBalance(storeName: string, storedName = storeName) {
  try {
    const response = await fetch(AD_BALANCE_SHEET_CSV, { cache: "no-store" });
    if (!response.ok) return null;
    const lines = (await response.text()).trim().split(/\r?\n/).slice(1);
    const matches = lines.map(parseCsvLine).filter((row) => row[1] === storeName || (adBalanceAliases[row[1]] ?? row[1]) === storedName);
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

function normalizeTopUpOwner(value?: string | null) {
  if (/client\s*approval/i.test(value ?? "")) return "client_approval";
  if (/shopee\s*hub/i.test(value ?? "")) return "shopee_hub";
  if (/client/i.test(value ?? "")) return "client";
  return null;
}

function storeIdFor(name: string) {
  return `shopee-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function isSingaporeStore(name: string) {
  return /\bSG\b|Singapore|\.sg$/i.test(name);
}

export async function GET(request: Request) {
  // Vercel cannot access the Cloudflare D1 binding used by the ChatGPT Sites
  // deployment. Keep the public mirror useful by reading the two live Google
  // Sheets sources and serving the portable snapshots bundled with the app.
  if (process.env.VERCEL === "1") {
    const directoryStores = await readLinkDirectory();
    const visibleStores = directoryStores.map(({ name }) => ({
      id: storeIdFor(name),
      name,
      platform: isSingaporeStore(name) ? "Shopee SG" : "Shopee MY",
    }));
    const requestedStoreId = new URL(request.url).searchParams.get("storeId");
    const allStoresRequested = !requestedStoreId || requestedStoreId === "all";
    const selectedStore = allStoresRequested ? undefined : visibleStores.find((store) => store.id === requestedStoreId);
    if (requestedStoreId && !allStoresRequested && !selectedStore) {
      return Response.json({ error: "Store access denied" }, { status: 403 });
    }
    const selectedDirectory = selectedStore ? directoryStores.find((store) => store.name === selectedStore.name) : undefined;
    const snapshotPayload = selectedStore ? storeSnapshots[selectedStore.name] ?? null : null;
    const sheetBalance = selectedStore ? await readSheetBalance(selectedStore.name) : null;
    return Response.json({
      customer: { id: "shopee-hub", name: "Shopee Hub" },
      stores: visibleStores.map((store) => {
        const directory = directoryStores.find((item) => item.name === store.name);
        return {
          ...store,
          contacts: directory?.contacts.length ? directory.contacts : contactsForStore(store.name),
          storeGroupLink: directory?.storeGroupLink ?? null,
          driveLink: directory?.driveLink ?? null,
        };
      }),
      selectedStoreId: allStoresRequested ? "all" : selectedStore?.id ?? null,
      snapshot: snapshotPayload ? { payload: snapshotPayload, importedAt: snapshotPayload.sourceUpdated ?? new Date().toISOString() } : null,
      adBalance: sheetBalance ? { ...sheetBalance, topUpOwner: selectedDirectory?.topUpOwner ?? topUpOwnerFallbacks[selectedStore?.name ?? ""] ?? null } : null,
      actions: [],
      dataSources: {
        directory: "Google Sheets · WhatsApp Group / Link Directory",
        advertisingBalance: "Google Sheets · Ad Balance Sheet1",
        performance: snapshotPayload ? "Portable snapshot exported from the ChatGPT Sites dashboard" : "Advertising exports and bundled dashboard data",
      },
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  }

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
  const directoryStores = await readLinkDirectory();
  const directoryByName = new Map(directoryStores.map((store) => [store.name, store]));
  const directoryOrder = new Map(directoryStores.map((store, index) => [store.name, index]));
  const kataDisplayNames: Record<string, string> = {
    "shopee-kata-marine-malaysia": "Kata Skincare Malaysia",
    "shopee-kata-singapore": "Kata Skincare Singapore",
  };
  const visibleStores = (tenantStores.length ? tenantStores
    .filter((stored) => stored.id !== "shopee-kata-care-malaysia")
    .map((stored) => {
    const candidates = [stored.bigSellerName, stored.name, directoryStoreNameFor(stored.bigSellerName ?? ""), directoryStoreNameFor(stored.name)];
    const directoryName = candidates.find((name) => name && directoryByName.has(name)) ?? directoryStoreNameFor(stored.name);
    return {
      ...stored,
      storedName: stored.name,
      directoryName,
      name: kataDisplayNames[stored.id] ?? directoryByName.get(directoryName)?.name ?? stored.name,
    };
  }) : directoryStores.map(({ name }) => ({
    id: storeIdFor(name), tenantId: tenant.id, name, storedName: name, directoryName: name,
    platform: isSingaporeStore(name) ? "Shopee SG" : "Shopee MY", bigSellerName: name, createdAt: "",
  }))).sort((a, b) => {
    const directoryDifference = (directoryOrder.get(a.directoryName) ?? Number.MAX_SAFE_INTEGER) - (directoryOrder.get(b.directoryName) ?? Number.MAX_SAFE_INTEGER);
    return directoryDifference || a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name);
  });
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
  const sheetBalance = selectedStore ? await readSheetBalance(selectedStore.name, selectedStore.storedName) : null;
  const topUpOwner = selectedStore
    ? directoryByName.get(selectedStore.directoryName)?.topUpOwner ?? topUpOwnerFallbacks[selectedStore.directoryName] ?? null
    : null;
  const actions = await db.select().from(managementActions)
    .where(selectedStore
      ? and(eq(managementActions.tenantId, tenant.id), eq(managementActions.storeId, selectedStore.id))
      : eq(managementActions.tenantId, tenant.id))
    .orderBy(desc(managementActions.actionDate), desc(managementActions.id))
    .limit(20);

  return Response.json({
    customer: { id: tenant.id, name: tenant.name },
    stores: visibleStores.map(({ id, name, platform, directoryName }) => {
      const directory = directoryByName.get(directoryName);
      return {
        id,
        name,
        platform,
        contacts: directory?.contacts.length ? directory.contacts : contactsForStore(name),
        storeGroupLink: directory?.storeGroupLink ?? null,
        driveLink: directory?.driveLink ?? null,
      };
    }),
    selectedStoreId: allStoresRequested ? "all" : (selectedStore?.id ?? null),
    snapshot: latest[0] ?? null,
    adBalance: sheetBalance ? { ...sheetBalance, topUpOwner } : (latestBalance[0] ? {
      balance: latestBalance[0].balanceCents / 100,
      balanceDate: latestBalance[0].balanceDate,
      sourceStoreName: latestBalance[0].sourceStoreName,
      sourceUpdatedAt: `${latestBalance[0].balanceDate} · 9:00 am`,
      syncStatus: "current",
      topUpOwner,
    } : null),
    actions,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
