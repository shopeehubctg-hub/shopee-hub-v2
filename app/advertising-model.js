const LOW_BALANCE_THRESHOLD = 50;
const TOP_UP_ROUNDING = 50;
const SAFETY_BUFFER = 1.1;

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || /暂无数据|unavailable|by store/i.test(value)) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildAdvertisingFunds(advertising = {}) {
  const balance = parseMoney(advertising.balance);
  const averageDailySpend30d = parseMoney(advertising.averageDailySpend30d ?? advertising.dailySpend);
  const syncStatus = advertising.syncStatus === "delayed" || balance == null || averageDailySpend30d == null
    ? "delayed"
    : "current";
  const alertEnabled = advertising.alertEnabled !== false;
  const lowBalance = syncStatus === "current" && alertEnabled && balance < LOW_BALANCE_THRESHOLD;
  const runwayDays = syncStatus === "current" && averageDailySpend30d > 0
    ? balance / averageDailySpend30d
    : null;
  const rawTopUp = syncStatus === "current"
    ? Math.max(0, averageDailySpend30d * 30 * SAFETY_BUFFER - balance)
    : null;
  const recommendedTopUp = rawTopUp == null ? null : Math.ceil(rawTopUp / TOP_UP_ROUNDING) * TOP_UP_ROUNDING;

  return {
    balance,
    averageDailySpend30d,
    runwayDays,
    recommendedTopUp,
    balanceStatus: syncStatus === "delayed" ? "delayed" : (lowBalance ? "low" : "healthy"),
    topUpOwner: advertising.topUpOwner === "shopee_hub" ? "shopee_hub" : "client",
    approvalRequired: Boolean(advertising.approvalRequired),
    sourceUpdatedAt: advertising.sourceUpdatedAt ?? null,
    syncStatus,
    lowBalance,
  };
}

export function formatRinggit(value, digits = 0) {
  if (value == null) return "—";
  return `RM${value.toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function buildTopUpAction(funds, storeName) {
  if (!funds.lowBalance || funds.topUpOwner === "shopee_hub" || funds.recommendedTopUp == null) return null;
  return {
    title: `Top-up ${formatRinggit(funds.recommendedTopUp)} required`,
    client: storeName,
    due: "Now",
    type: funds.approvalRequired ? "Approval" : "Top-up",
    action: funds.approvalRequired ? "Approve" : "Confirm",
    generated: true,
  };
}

export { LOW_BALANCE_THRESHOLD };
