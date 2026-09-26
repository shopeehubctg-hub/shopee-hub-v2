import { pathToFileURL } from "node:url";

const PAGE_SIZE = 1000;

export function cents(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`Invalid money value: ${value}`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export async function readPages(baseUrl, table, filters, headers, fetcher = fetch, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetcher(url, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`${table} read failed (HTTP ${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${table} returned a non-array response`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function readLatestDate(baseUrl, tenantFilter, headers) {
  const url = new URL("/rest/v1/ad_performance_daily", baseUrl);
  for (const [key, value] of Object.entries({ select: "performance_date", tenant_id: tenantFilter, order: "performance_date.desc", limit: "1" })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`Latest FullAd date read failed (HTTP ${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Latest FullAd date returned a non-array response");
  return rows[0]?.performance_date;
}

export function summarizeMonth(rows, latestDate, accessibleStoreIds) {
  const month = latestDate.slice(0, 7);
  const covered = new Set();
  const totals = { spendCents: 0n, salesCents: 0n, views: 0n, clicks: 0n, conversions: 0n, sold: 0n, rows: 0 };
  for (const row of rows) {
    if (!row.performance_date.startsWith(month) || row.performance_date > latestDate) continue;
    if (!accessibleStoreIds.has(row.store_id)) throw new Error(`Unrecognized store in FullAd rows: ${row.store_id}`);
    covered.add(row.store_id);
    totals.spendCents += cents(row.spend);
    totals.salesCents += cents(row.sales);
    totals.views += BigInt(row.views);
    totals.clicks += BigInt(row.clicks);
    totals.conversions += BigInt(row.conversions);
    totals.sold += BigInt(row.sold);
    totals.rows += 1;
  }
  return { ...totals, coveredStores: covered.size, accessibleStores: accessibleStoreIds.size };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the live release gate`);
  return value;
}

function assertEqual(label, actual, expected) {
  if (String(actual) !== String(expected)) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  const baseUrl = new URL(required("SUPABASE_URL"));
  if (baseUrl.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS for the live release gate");
  const secret = required("SUPABASE_SECRET_KEY");
  const tenantId = required("QC_TENANT_ID");
  const expectedDate = required("QC_EXPECTED_LATEST_DATE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw new Error("QC_EXPECTED_LATEST_DATE must be YYYY-MM-DD");
  const expectedSpend = cents(required("QC_EXPECTED_MTD_SPEND"));
  const expectedSales = cents(required("QC_EXPECTED_MTD_SALES"));
  const expectedCovered = Number(required("QC_EXPECTED_COVERED_STORES"));
  const expectedAccessible = Number(required("QC_EXPECTED_ACCESSIBLE_STORES"));
  if (![expectedCovered, expectedAccessible].every(Number.isSafeInteger)) throw new Error("Expected store counts must be integers");
  const headers = { apikey: secret, Authorization: `Bearer ${secret}` };
  const tenantFilter = `eq.${tenantId}`;
  const [stores, latestDate] = await Promise.all([
    readPages(baseUrl, "stores", { select: "id", tenant_id: tenantFilter, order: "id.asc" }, headers),
    readLatestDate(baseUrl, tenantFilter, headers),
  ]);
  if (!latestDate) throw new Error("No FullAd rows found for the tenant");
  assertEqual("Latest FullAd date", latestDate, expectedDate);
  const monthStart = `${latestDate.slice(0, 7)}-01`;
  const rows = await readPages(baseUrl, "ad_performance_daily", {
    select: "store_id,performance_date,spend,sales,views,clicks,conversions,sold",
    tenant_id: tenantFilter,
    performance_date: `gte.${monthStart}`,
    order: "performance_date.asc,store_id.asc",
  }, headers);
  const summary = summarizeMonth(rows, latestDate, new Set(stores.map(store => store.id)));
  assertEqual("MTD spend", summary.spendCents, expectedSpend);
  assertEqual("MTD ad sales", summary.salesCents, expectedSales);
  assertEqual("Covered stores", summary.coveredStores, expectedCovered);
  assertEqual("Accessible stores", summary.accessibleStores, expectedAccessible);
  const money = value => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
  console.log(`PASS live FullAd: through ${latestDate}; ${summary.rows} rows; ${summary.coveredStores}/${summary.accessibleStores} stores; spend RM${money(summary.spendCents)}; sales RM${money(summary.salesCents)}; views ${summary.views}; clicks ${summary.clicks}; conversions ${summary.conversions}; sold ${summary.sold}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`FAIL live FullAd: ${error.message}`); process.exitCode = 1; });
}
