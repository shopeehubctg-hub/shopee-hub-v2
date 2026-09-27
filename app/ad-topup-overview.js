import { buildAdvertisingFunds, buildTopUpAction, LOW_BALANCE_THRESHOLD } from "./advertising-model.js";
import { hasCurrentTopUpInputs, isCurrentBalanceDate, malaysiaDate } from "./ad-balance-validation.js";

export function shouldShowAllStoresTopUps(allStores, role, accessibleStoreCount, canViewAdvertising) {
  return Boolean(allStores && canViewAdvertising && (role === "superadmin" || accessibleStoreCount > 1));
}

export function summarizeAllStoresTopUps(stores, performanceRows, balancesByStoreId, today = malaysiaDate()) {
  const spendingByStore = new Map();
  const startDate = new Date(`${today}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const firstDay = startDate.toISOString().slice(0, 10);
  for (const row of performanceRows) {
    if (row.performance_date < firstDay || row.performance_date > today) continue;
    const current = spendingByStore.get(row.store_id) ?? { spend: 0, dates: new Set(), latestDate: "" };
    current.spend += Number(row.spend) || 0;
    current.dates.add(row.performance_date);
    if (row.performance_date > current.latestDate) current.latestDate = row.performance_date;
    spendingByStore.set(row.store_id, current);
  }

  let assessedStoreCount = 0;
  const needsTopUp = [];
  const needsAttention = [];
  for (const store of stores) {
    const ownerGroup = store.topUpOwner === "shopee_hub" ? "shopee_hub" : "client";
    const candidateBalance = balancesByStoreId.get(store.id);
    const spending = spendingByStore.get(store.id);
    const balance = hasCurrentTopUpInputs(candidateBalance?.balanceDate, spending?.latestDate, today) ? candidateBalance : null;
    const averageDailySpend30d = spending?.dates.size ? spending.spend / spending.dates.size : null;
    const funds = buildAdvertisingFunds({
      balance: balance?.balance ?? null,
      averageDailySpend30d,
      topUpOwner: store.topUpOwner,
      approvalRequired: store.approvalRequired,
    });
    if (funds.syncStatus !== "current") {
      if (isCurrentBalanceDate(candidateBalance?.balanceDate, today)
        && typeof candidateBalance.balance === "number"
        && Number.isFinite(candidateBalance.balance)
        && candidateBalance.balance >= 0
        && candidateBalance.balance < LOW_BALANCE_THRESHOLD) {
        needsAttention.push({
          storeId: store.id,
          storeName: store.name,
          balance: candidateBalance.balance,
          balanceDate: candidateBalance.balanceDate,
          performanceDate: spending?.latestDate ?? null,
          ownerGroup,
        });
      }
      continue;
    }
    assessedStoreCount += 1;
    const lowBalance = funds.balance < LOW_BALANCE_THRESHOLD;
    const shortRunway = funds.runwayDays !== null && funds.runwayDays < 3;
    if (!lowBalance && !shortRunway) continue;
    const action = buildTopUpAction(funds, store.name);
    needsTopUp.push({
      storeId: store.id,
      storeName: store.name,
      recommendedTopUp: averageDailySpend30d > 0 ? funds.recommendedTopUp : null,
      actionLabel: action?.action ?? (ownerGroup === "shopee_hub" ? "Managed by Shopee Hub" : "Managed by Client"),
      ownerGroup,
      balance: funds.balance,
      runwayDays: funds.runwayDays,
      reasons: [lowBalance ? "Balance below RM50" : null, shortRunway ? "Runway under 3 days" : null].filter(Boolean),
      balanceDate: balance.balanceDate,
      performanceDate: spending.latestDate,
    });
  }
  needsTopUp.sort((a, b) => (b.recommendedTopUp ?? -1) - (a.recommendedTopUp ?? -1) || a.storeName.localeCompare(b.storeName));
  needsAttention.sort((a, b) => a.balance - b.balance || a.storeName.localeCompare(b.storeName));
  return { totalStoreCount: stores.length, assessedStoreCount, needsTopUp, needsAttention };
}
