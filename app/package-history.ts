import type { CalculatorSnapshot } from "./calculator-types";

export type PackageHistorySnapshot = {
  name?: string | null;
  market?: string | null;
  platforms?: { platform: string; packageSku: string }[];
  components?: { inventorySku: string; name: string; quantity: number; kind: string }[];
  priceSchedules?: {
    market: string; priceType: string; originalPrice: number; sellingPrice: number;
    promotionType: string; effectiveFrom: string; effectiveTo: string;
  }[];
};

function isCalculatorSnapshot(value: unknown): value is CalculatorSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (snapshot.serviceScenario === "Non-Campaign Day" || snapshot.serviceScenario === "Campaign Day")
    && typeof snapshot.category === "string"
    && ["facebookPrice", "suggestedShopeePrice", "commissionRate", "serviceRate", "actualPayout"]
      .every(field => typeof snapshot[field] === "number" && Number.isFinite(snapshot[field]))
    && ["discountValue", "facebookPricePerUnit", "customerPricePerUnit"]
      .every(field => snapshot[field] == null || (typeof snapshot[field] === "number" && Number.isFinite(snapshot[field])));
}

export function calculatorSnapshots(value: unknown): CalculatorSnapshot[] {
  if (!value || typeof value !== "object") return [];
  const scenarios = (value as { scenarios?: unknown }).scenarios;
  const candidates = Array.isArray(scenarios) ? scenarios : [value];
  return candidates.filter(isCalculatorSnapshot);
}

export function publicCalculatorSettings(value: Record<string, unknown> | null) {
  const snapshots = calculatorSnapshots(value);
  if (!snapshots.length) return null;
  if (Array.isArray(value?.scenarios)) return { scenarios: snapshots };
  const { _packageMetadata, _packageHistorySummary, ...snapshot } = snapshots[0] as CalculatorSnapshot & Record<string, unknown>;
  void _packageMetadata;
  void _packageHistorySummary;
  return snapshot;
}

const missing = "Not recorded";
const sortedLines = (lines: string[]) => lines.sort().join("\n") || "None";

export function packageHistoryFields(snapshot: PackageHistorySnapshot) {
  return {
    "Package name": snapshot.name ?? missing,
    "Selling markets": snapshot.market ? sortedLines(snapshot.market.split(",").map(value => value.trim())) : missing,
    "Platform listing SKUs": snapshot.platforms ? sortedLines(snapshot.platforms.map(line => `${line.platform}: ${line.packageSku}`)) : missing,
    "Inventory items": snapshot.components ? sortedLines(snapshot.components.map(line => `${line.inventorySku} · ${line.name} ×${line.quantity} (${line.kind})`)) : missing,
    "Prices & promotion dates": snapshot.priceSchedules ? sortedLines(snapshot.priceSchedules.map(line =>
      `${line.market} ${line.priceType === "campaign" ? "Campaign" : "Non-Campaign"}: ${line.market === "SG" ? "S$" : "RM"} ${line.originalPrice.toFixed(2)} → ${line.sellingPrice.toFixed(2)} · ${line.effectiveFrom} → ${line.effectiveTo} (${line.promotionType})`,
    )) : missing,
  };
}

export function packageHistoryChanges(previous: PackageHistorySnapshot | undefined, current: PackageHistorySnapshot) {
  const before = previous ? packageHistoryFields(previous) : undefined;
  const after = packageHistoryFields(current);
  return (Object.keys(after) as (keyof typeof after)[])
    .filter(field => !before || before[field] !== after[field])
    .map(field => ({ field, before: before?.[field] ?? "—", after: after[field] }));
}

export function packageHistoryTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return missing;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date) + " MYT";
}
