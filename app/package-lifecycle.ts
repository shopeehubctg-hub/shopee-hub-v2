import {marketDate,type MarketCode} from './markets';
type PricePeriod = {
  priceType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function marketToday(market:MarketCode='MY',now=new Date()){return marketDate(market,now);}

export function packageLifecycleStatus(
  prices: PricePeriod[], settings: Record<string, unknown> | null | undefined, today: string,
) {
  // A manual stop takes effect immediately, even though its displayed end date
  // includes today. Normal date-based expiry still runs through the end date.
  if (settings?._packageEnded === true) return "expired" as const;
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
