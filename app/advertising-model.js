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
    topUpOwner: ["shopee_hub", "client_approval", "client"].includes(advertising.topUpOwner) ? advertising.topUpOwner : "client",
    approvalRequired: advertising.topUpOwner === "client_approval" || Boolean(advertising.approvalRequired),
    sourceUpdatedAt: advertising.sourceUpdatedAt ?? null,
    syncStatus,
    lowBalance,
  };
}

export function formatRinggit(value, digits = 0) {
  if (value == null) return "—";
  return `RM${value.toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function buildTopUpAction(funds, storeName, options = {}) {
  if (!funds.lowBalance || funds.topUpOwner === "shopee_hub" || funds.recommendedTopUp == null) return null;
  const amount = formatRinggit(funds.recommendedTopUp);
  const isApproval = funds.topUpOwner === "client_approval" || funds.approvalRequired;
  return {
    title: `待批准广告预算 ${amount}`,
    client: storeName,
    due: "Now",
    type: isApproval ? "Urgent" : "Top-up",
    action: isApproval ? "Approve" : "Top Up",
    href: isApproval ? options.projectGroupHref : "https://accounts.shopee.com.my/seller/login",
    message: isApproval ? "麻烦你们帮我 top up 广告费" : undefined,
    generated: true,
  };
}

export { LOW_BALANCE_THRESHOLD };
