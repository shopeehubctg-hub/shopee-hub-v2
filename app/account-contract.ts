export type AccountCurrency = "MYR" | "SGD";
/** Exact decimal string; never coerce monetary ledger values to floating point. */
export type AccountMoney = string;
export type AccountMappingCandidate = {
  mappingId: string; username: string; storeId: string | null; storeName: string;
};
export type AccountStoreRow = {
  id: string; rosterKey?: string; storeId: string | null; storeName: string; project: string;
  currency: AccountCurrency; statementMonth: string; invoiceMonth: string;
  entity?: string; market?: "MY" | "SG"; termsVersion?: "NEW" | "OLD";
  mappingStatus?: "resolved" | "candidate" | "ambiguous" | "missing"; mappingReason?: string;
  candidates?: AccountMappingCandidate[];
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
  summaries: AccountCurrencySummary[]; stores: AccountStoreRow[];
};
