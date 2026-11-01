import {MARKET_CONFIG,type MarketCode} from './markets';

/** New TH/PH stores use a monthly rule; onboarding never freezes a numeric rate. */
export function storeExchangeRatePolicy(market:MarketCode) {
  return market==='TH'||market==='PH'
    ? {policy:'bnm-service-average' as const,currency:MARKET_CONFIG[market].currency,quotationUnit:1 as const}
    : null;
}
