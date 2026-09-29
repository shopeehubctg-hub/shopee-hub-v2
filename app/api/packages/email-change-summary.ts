type VersionSnapshot = {
  components: Array<{inventorySku:string;name:string;quantity:number;kind:string}>;
  calculatorSettings: Record<string,unknown> | null;
};
type Price = {market:string;priceType:string;sellingPrice:number;originalPrice:number;effectiveFrom:string;effectiveTo:string|null;promotionType:string};
type Listing = {platform:string;packageSku:string};
const normalized = (lines: unknown[]) => lines.map(line=>JSON.stringify(line)).sort().join("\n");

export function emailChangeSummary(current: VersionSnapshot, previous: VersionSnapshot, prices: Price[], previousPrices: Price[], skus: Listing[], previousSkus: Listing[]) {
  const changes: string[] = [];
  if (normalized(prices.map(p=>[p.market,p.priceType,p.sellingPrice])) !== normalized(previousPrices.map(p=>[p.market,p.priceType,p.sellingPrice]))) changes.push("Disc Price 修改");
  if (normalized(skus.map(s=>[s.platform,s.packageSku])) !== normalized(previousSkus.map(s=>[s.platform,s.packageSku]))) changes.push("Package SKU 修改");
  if (normalized(current.components.map(c=>[c.inventorySku,c.name,c.quantity,c.kind])) !== normalized(previous.components.map(c=>[c.inventorySku,c.name,c.quantity,c.kind]))) changes.push("OXM Inventory SKU 修改");
  if (normalized(prices.map(p=>[p.market,p.priceType,p.effectiveFrom,p.effectiveTo])) !== normalized(previousPrices.map(p=>[p.market,p.priceType,p.effectiveFrom,p.effectiveTo]))) changes.push("Package Period 修改");
  if (normalized(prices.map(p=>[p.market,p.priceType,p.originalPrice])) !== normalized(previousPrices.map(p=>[p.market,p.priceType,p.originalPrice]))) changes.push("Original Price 修改");
  if (normalized(prices.map(p=>[p.market,p.priceType,p.promotionType])) !== normalized(previousPrices.map(p=>[p.market,p.priceType,p.promotionType]))) changes.push("Promotion Type 修改");
  const meta = current.calculatorSettings?._packageMetadata as {name?:string;market?:string}|undefined;
  const oldMeta = previous.calculatorSettings?._packageMetadata as {name?:string;market?:string}|undefined;
  if (meta && oldMeta) {
    if (meta.name !== oldMeta.name) changes.push("Package 名称修改");
    if (meta.market?.split(",").sort().join(",") !== oldMeta.market?.split(",").sort().join(",")) changes.push("Selling Market 修改");
  }
  return changes.length ? changes.join(" ｜") : "配套资料修改";
}

// This reserved field is written by the server, never trusted from a save body.
export function storedChangeSummary(settings: Record<string,unknown>|null) {
  const value = settings?._packageHistorySummary as {schema?:unknown;summary?:unknown}|undefined;
  return value?.schema === 1 && typeof value.summary === "string" && value.summary.trim() && value.summary.length <= 1000 ? value.summary : null;
}
