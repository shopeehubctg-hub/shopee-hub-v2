export type PackagePriceSchedule = {
  market: "MY" | "SG";
  priceType: "non_campaign" | "campaign";
  originalPrice: number;
  sellingPrice: number;
  effectiveFrom: string;
  effectiveTo: string;
};

export type PackagePriceDisplay = {
  key: string;
  market: "MY" | "SG";
  label: string;
  sellingPrice: number;
  periods: string[];
};

const periodText = (line: PackagePriceSchedule) => `${line.effectiveFrom} → ${line.effectiveTo}`;
const scheduleOrder = (a: PackagePriceSchedule, b: PackagePriceSchedule) =>
  (a.priceType === "non_campaign" ? 0 : 1) - (b.priceType === "non_campaign" ? 0 : 1) ||
  a.effectiveFrom.localeCompare(b.effectiveFrom) || a.effectiveTo.localeCompare(b.effectiveTo);

export function packagePriceDisplay(schedules: PackagePriceSchedule[]): PackagePriceDisplay[] {
  const markets = [...new Set(schedules.map(line => line.market))].sort();
  return markets.flatMap(market => {
    const lines = schedules.filter(line => line.market === market).sort(scheduleOrder);
    const base = lines[0];
    const samePrice = base && lines.some(line => line.priceType === "non_campaign") &&
      lines.some(line => line.priceType === "campaign") &&
      lines.every(line => line.originalPrice === base.originalPrice && line.sellingPrice === base.sellingPrice);
    if (samePrice) {
      return [{
        key: `${market}-same-price`, market,
        label: "Same price · Campaign & Non-Campaign",
        sellingPrice: base.sellingPrice,
        periods: lines.map(line => `${line.priceType === "campaign" ? "Campaign" : "Non-Campaign"}: ${periodText(line)}`),
      }];
    }
    return lines.map(line => ({
      key: `${market}-${line.priceType}-${line.effectiveFrom}-${line.effectiveTo}`,
      market,
      label: line.priceType === "campaign" ? "Campaign" : "Non-Campaign",
      sellingPrice: line.sellingPrice,
      periods: [periodText(line)],
    }));
  });
}
