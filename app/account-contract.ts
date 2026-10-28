import type {MarketCode} from './markets';
export type AccountCurrency = "MYR" | "SGD" | "THB" | "PHP";
/** Exact decimal string; never coerce monetary ledger values to floating point. */
export type AccountMoney = string;
export type AccountMappingCandidate = {
  mappingId: string; username: string; storeId: string | null; storeName: string;
};
export type AccountStoreRow = {
  id: string; rosterKey?: string; storeId: string | null; storeName: string; project: string;
  currency: AccountCurrency; statementMonth: string; invoiceMonth: string;
  salesCurrency?: AccountCurrency;
  previewMarketFxEligible?: boolean;
  previewRateDefaultsEligible?: boolean;
  previewServiceFxRate?: {serviceMonth:string;rate:string;policy:'bnm-service-average';verified:true;reference:string;currency?:AccountCurrency;quotationUnit?:1};
  entity?: string; market?: MarketCode; termsVersion?: "NEW" | "OLD";
  mappingStatus?: "resolved" | "candidate" | "ambiguous" | "missing"; mappingReason?: string;
  candidates?: AccountMappingCandidate[];
  latestSettingsVersion?: string; appliedSettingsVersion?: string | null; settingsEffectiveMonth?: string | null;
  mappingEffectiveMonth?: string | null; rateEffectiveMonth?: string | null;
  rateRule?: AccountFeeRule | null; rateHistory?: AccountSettingsHistory[];
  clientType?:'Internal'|'External'; rateCard?:{id:string;version:number;name:string}|null;
  fxPolicy?:'none'|'fixed'|'bnm-service-average'; fxRate?:string|null;
  calculatedFee?: null; calculationStatus?: 'pending_rule' | 'pending_statement';
  servicePeriodStart: string | null; servicePeriodEnd: string | null;
  status: "pending_source" | "pending_mapping" | "pending_terms" | "pending_statement" | "assessed" | "invoiced";
  expectedNetFee: AccountMoney | null; billed: AccountMoney | null;
  collected: AccountMoney | null; outstanding: AccountMoney | null;
};
export type AccountCurrencySummary = {
  currency: AccountCurrency; expectedNetFee: AccountMoney | null;
  billed: AccountMoney | null; collected: AccountMoney | null;
  outstanding: AccountMoney | null; overpaid: AccountMoney | null;
  todayCollected: AccountMoney | null; monthCollected: AccountMoney | null;
  pendingStores: number;
};
export type AccountResponse = {
  invoiceMonth: string; statementMonth: string; today: string; timezone: "Asia/Kuala_Lumpur";
  status: "ready" | "not_configured"; updatedAt: string | null;
  rosterUpdatedAt?: string;
  settingsAvailable?: boolean; storeOptions?: Array<{id:string;name:string;platform:string}>;
  summaries: AccountCurrencySummary[]; stores: AccountStoreRow[];
};
export type AccountFeeRule = {
  type: 'fixed' | 'percent' | 'tiers'; currency: AccountCurrency;
  basis: 'fixed_monthly' | 'merchandise_subtotal' | 'net_gmv' | 'statement_amount' | 'custom';
  basisLabel?: string; fixedAmount?: string; percent?: string;
  tiers?: Array<{from:string;percent:string;cap?:string}>; minimum?:string; cap?:string;
};
export type AccountSettingsHistory = { action:'fee_rule'; version:string; effectiveMonth:string; rule:AccountFeeRule|null; storeId:string|null; changedAt:string };
