import type { AccountCurrency, AccountMoney } from "./account-contract";

const currencySymbols: Record<AccountCurrency, string> = { MYR: "RM", SGD: "S$" };

/** Keep ledger decimals as strings so display cannot round received money. */
export function accountMoney(value: AccountMoney | null | undefined, currency: AccountCurrency) {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "—";
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${currencySymbols[currency]} ${grouped}.${fraction.padEnd(2, "0")}`;
}
