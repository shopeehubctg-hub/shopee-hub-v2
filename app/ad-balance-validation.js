export function malaysiaDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRecentDate(value, today, maximumAgeDays) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const age = Date.parse(`${today}T00:00:00Z`) - date.getTime();
  return age >= 0 && age <= maximumAgeDays * 24 * 60 * 60 * 1000;
}

export function isCurrentBalanceDate(value, today = malaysiaDate()) {
  return isRecentDate(value, today, 3);
}

export function isCurrentPerformanceDate(value, today = malaysiaDate()) {
  return isRecentDate(value, today, 2);
}

export function balanceCsvColumns(cells) {
  if (!Array.isArray(cells)) return null;
  const normalized = cells.map(cell => String(cell).trim().toLowerCase());
  const dateIndex = normalized.indexOf("date");
  const storeIndex = normalized.indexOf("store name");
  const balanceIndex = normalized.indexOf("ad balance (rm)");
  if (dateIndex < 0 || storeIndex < 0 || balanceIndex < 0 || new Set([dateIndex, storeIndex, balanceIndex]).size !== 3) return null;
  return { dateIndex, storeIndex, balanceIndex };
}

export function parseAdBalance(value) {
  if (typeof value !== "string") return null;
  const amount = value.trim().replace(/^RM\s*/i, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount)) return null;
  const balance = Number(amount.replaceAll(",", ""));
  return Number.isFinite(balance) ? balance : null;
}
