import { buildAdvertisingFunds, buildTopUpAction } from "./advertising-model.js";

export function shouldShowAllStoresTopUps(allStores, role, accessibleStoreCount, canViewAdvertising) {
  return Boolean(allStores && canViewAdvertising && (role === "superadmin" || accessibleStoreCount > 1));
}

export function summarizeAllStoresTopUps(stores, performanceRows, balancesByStoreId) {
  const spendingByStore = new Map();
  for (const row of performanceRows) {
    const current = spendingByStore.get(row.store_id) ?? { spend: 0, dates: new Set(), latestDate: "" };
    current.spend += Number(row.spend) || 0;
    current.dates.add(row.performance_date);
    if (row.performance_date > current.latestDate) current.latestDate = row.performance_date;
    spendingByStore.set(row.store_id, current);
  }

  let assessedStoreCount = 0;
  const needsTopUp = [];
  for (const store of stores) {
    const candidateBalance = balancesByStoreId.get(store.id);
    const spending = spendingByStore.get(store.id);
    const balance = spending?.latestDate && candidateBalance?.balanceDate >= spending.latestDate ? candidateBalance : null;
    const averageDailySpend30d = spending?.dates.size ? spending.spend / spending.dates.size : null;
    const funds = buildAdvertisingFunds({
      balance: balance?.balance ?? null,
      averageDailySpend30d,
      topUpOwner: store.topUpOwner,
      approvalRequired: store.approvalRequired,
    });
    if (funds.syncStatus !== "current") continue;
    assessedStoreCount += 1;
    if (!funds.lowBalance) continue;
    const action = buildTopUpAction(funds, store.name);
    needsTopUp.push({
      storeId: store.id,
      storeName: store.name,
      recommendedTopUp: funds.recommendedTopUp,
      actionLabel: action?.action ?? "Managed by Shopee Hub",
      balanceDate: balance.balanceDate,
    });
  }
  needsTopUp.sort((a, b) => b.recommendedTopUp - a.recommendedTopUp || a.storeName.localeCompare(b.storeName));
  return { totalStoreCount: stores.length, assessedStoreCount, needsTopUp };
}
