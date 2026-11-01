import {MARKET_CONFIG,type MarketCode} from './markets';
type Period = { effectiveFrom: string; effectiveTo: string | null; promotionType: "monthly" | "custom" };

// Preserve elapsed periods, truncate open/current ones, and cancel future ones.
// The original planned periods remain in the preceding immutable version.
export function endedPackagePeriods<T extends Period>(prices: T[], today: string): T[] {
  return prices.filter(price => price.effectiveFrom <= today).map(price =>
    price.effectiveTo === null || price.effectiveTo > today
      ? { ...price, effectiveTo: today, promotionType: "custom" }
      : { ...price },
  );
}

export function endedPackageSettings(settings: Record<string, unknown> | null, now: string, today: string, actor: string, market:MarketCode='MY') {
  return {
    ...settings,
    _packageEnded: true,
    _endedAt: now,
    _endedDate: today,
    _endedBy: actor,
    _longTermLifecycle: false,
    _recurringCampaign: null,
    _packageHistorySummary: { schema: 1, summary: `Package ended immediately by ${actor}. End date: ${today} (${MARKET_CONFIG[market].name}). Future promotions cancelled.` },
  };
}

export function packageHistoryAction(settings: Record<string, unknown> | null, version: number) {
  return settings?._packageEnded === true ? "Package Ended" : version === 1 ? "Created" : "Version Updated";
}
