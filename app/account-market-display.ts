import {MARKET_CODES,MARKET_CONFIG,isMarket,type MarketCode} from './markets';
import type {AccountStoreRow,AccountCurrencySummary} from './account-contract';

export function accountRowMarket(row:AccountStoreRow):MarketCode {
  return isMarket(row.market)?row.market:MARKET_CODES.find(market=>MARKET_CONFIG[market].currency===(row.salesCurrency??row.currency))??'MY';
}
/** Ledger-currency totals are not country totals. Hide new currencies with no financial evidence. */
export function showAccountSummary(summary:AccountCurrencySummary) {
  return summary.currency==='MYR'||summary.currency==='SGD'||[summary.billed,summary.collected,summary.outstanding,summary.expectedNetFee,summary.todayCollected,summary.monthCollected].some(value=>value!==null&&value!==undefined);
}
