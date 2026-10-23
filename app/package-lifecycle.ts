type PricePeriod = {
  priceType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function marketToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function packageLifecycleStatus(
  prices: PricePeriod[], settings: Record<string, unknown> | null | undefined, today: string,
) {
  // Normal Day defines when the package is available. A Campaign price can
  // never keep an otherwise ended package active. Older campaign-only packages
  // still use their saved price periods.
  const normalPeriods = prices.filter(price => price.priceType === "non_campaign");
  const periods = normalPeriods.length ? normalPeriods : prices;
  const isLongTerm = settings?._longTermLifecycle === true;
  const end = (period: PricePeriod) => period.effectiveTo ?? (isLongTerm ? null : period.effectiveFrom);
  if (periods.some(period => period.effectiveFrom <= today && (end(period) === null || end(period)! >= today))) return "active" as const;
  if (periods.some(period => period.effectiveFrom > today)) return "scheduled" as const;
  return "expired" as const;
}
