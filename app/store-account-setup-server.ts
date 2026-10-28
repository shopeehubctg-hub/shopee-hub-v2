import { MARKET_CONFIG, isMarket, type MarketCode } from "./markets";
import { malaysiaDate } from "./account-ledger";
import { validateFeeRule } from "./account-settings-model";
import type { AccountSetupPayload } from "./store-account-setup-model";

const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseStoreAccountSetup(value: unknown, market: MarketCode): AccountSetupPayload {
  const input = object(value);
  if (!input || input.version !== 2) throw Error("Choose Account setup for this store.");
  const legalEntity = typeof input.legalEntity === "string" ? input.legalEntity.trim().replace(/\s+/g, " ") : "";
  if (!legalEntity || legalEntity.length > 240) throw Error("Enter a company name (up to 240 characters).");
  const effectiveMonth = input.effectiveMonth;
  if (typeof effectiveMonth !== "string" || !monthPattern.test(effectiveMonth) || effectiveMonth < malaysiaDate().slice(0, 7))
    throw Error("Choose the current or a future invoice month.");
  const clientType = input.clientType;
  if (clientType !== "Internal" && clientType !== "External") throw Error("Choose Internal or External client type.");
  if (!isMarket(market) || input.inputCurrency !== MARKET_CONFIG[market].currency || input.billingCurrency !== "MYR")
    throw Error("Store market and Account currencies do not match.");
  const rateCardInput = input.rateCard;
  let rateCard: AccountSetupPayload["rateCard"] = null;
  if (rateCardInput !== null) {
    const card = object(rateCardInput);
    if (!card || typeof card.id !== "string" || !card.id.trim() || card.id.length > 120 ||
      !Number.isSafeInteger(card.version) || Number(card.version) < 1)
      throw Error("Choose a valid Rate Card version.");
    rateCard = { id: card.id.trim(), version: Number(card.version) };
  }
  const feeRule = validateFeeRule(input.feeRule, "MYR");
  let fxPolicy: AccountSetupPayload["fxPolicy"];
  if (market === "MY") fxPolicy = "none";
  else if (market === "TH" || market === "PH") fxPolicy = "bnm-service-average";
  else fxPolicy = clientType === "Internal" ? "fixed" : input.fxPolicy as AccountSetupPayload["fxPolicy"];
  if (input.fxPolicy !== fxPolicy || (fxPolicy !== "none" && fxPolicy !== "fixed" && fxPolicy !== "bnm-service-average") ||
    (market === "SG" && fxPolicy === "none")) throw Error("Choose the required market exchange rate policy.");
  if (fxPolicy === "fixed" && input.fxRate !== "3.2") throw Error("Fixed SGD exchange rate must be 3.2.");
  if (fxPolicy !== "fixed" && input.fxRate !== undefined) throw Error("Remove the exchange rate from this market policy.");
  return { version: 2, legalEntity, effectiveMonth, clientType, rateCard, feeRule,
    inputCurrency: MARKET_CONFIG[market].currency, billingCurrency: "MYR", fxPolicy,
    ...(fxPolicy === "fixed" ? { fxRate: "3.2" as const } : {}) };
}
