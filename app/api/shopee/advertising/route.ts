import { getChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

const SHOPEE_API_BASE = process.env.SHOPEE_API_BASE_URL ?? "https://partner.shopeemobile.com";
const REQUEST_TIMEOUT_MS = 15_000;

type ShopCredential = { shopId: number; accessToken: string };
type ShopeeEnvelope = { error?: string; message?: string; request_id?: string; response?: unknown };

function readShopCredential(storeId: string): ShopCredential | null {
  const raw = process.env.SHOPEE_ADS_SHOPS_JSON;
  if (raw) {
    try {
      const shops = JSON.parse(raw) as Record<string, { shopId?: number | string; accessToken?: string }>;
      const configured = shops[storeId];
      const shopId = Number(configured?.shopId);
      if (Number.isSafeInteger(shopId) && shopId > 0 && configured?.accessToken) {
        return { shopId, accessToken: configured.accessToken };
      }
    } catch {
      throw new Error("SHOPEE_ADS_SHOPS_JSON is not valid JSON");
    }
  }

  const shopId = Number(process.env.SHOPEE_SHOP_ID);
  const accessToken = process.env.SHOPEE_ACCESS_TOKEN;
  return Number.isSafeInteger(shopId) && shopId > 0 && accessToken ? { shopId, accessToken } : null;
}

async function hmacSha256(secret: string, content: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function shopeeGet(path: string, credential: ShopCredential, query: Record<string, string> = {}) {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !partnerKey) throw new Error("Shopee partner credentials are not configured");

  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256(partnerKey, `${partnerId}${path}${timestamp}${credential.accessToken}${credential.shopId}`);
  const params = new URLSearchParams({
    partner_id: String(partnerId), timestamp: String(timestamp), access_token: credential.accessToken,
    shop_id: String(credential.shopId), sign, ...query,
  });
  const response = await fetch(`${SHOPEE_API_BASE}${path}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json() as ShopeeEnvelope;
  if (!response.ok || payload.error) {
    const detail = payload.message || payload.error || `HTTP ${response.status}`;
    throw new Error(`${path}: ${detail}`);
  }
  return payload.response;
}

function findArray(value: unknown, preferredKeys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const found = findArray(record[key], []);
    if (found.length || Array.isArray(record[key])) return found;
  }
  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) return findArray(nested, []);
  }
  return [];
}

function numberValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return String(record[key]);
  return "";
}

function isoDate(value: unknown) {
  const text = String(value ?? "");
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text.slice(0, 10);
}

function displayMoney(value: number) {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function campaignIds(value: unknown) {
  const rows = findArray(value, ["campaign_id_list", "campaign_list", "list"]);
  return rows.map((row) => stringValue(row, "campaign_id", "id")).filter(Boolean);
}

function normalizeCampaigns(performance: unknown, settings: unknown) {
  const settingRows = findArray(settings, ["campaign_list", "campaign_setting_list", "list"]);
  const settingById = new Map(settingRows.map((row) => [stringValue(row, "campaign_id", "id"), row]));
  const performanceRows = findArray(performance, ["performance_list", "campaign_performance_list", "report_list", "list"]);
  return performanceRows.map((row) => {
    const id = stringValue(row, "campaign_id", "id");
    const setting = settingById.get(id) ?? {};
    const commonInfo = (setting.common_info && typeof setting.common_info === "object" ? setting.common_info : setting) as Record<string, unknown>;
    const metrics = findArray(row, ["metrics_list", "performance_list", "report_list"]);
    const metricRows = metrics.length ? metrics : [row];
    const report = metricRows.reduce<Record<string, number>>((totals, metric) => {
      const values = (metric.report && typeof metric.report === "object" ? metric.report : metric) as Record<string, unknown>;
      for (const key of ["expense","broad_gmv","direct_gmv","impression","clicks","broad_order","direct_order","broad_item_sold","direct_item_sold"]) {
        totals[key] = (totals[key] ?? 0) + numberValue(values, key);
      }
      return totals;
    }, {});
    const spend = numberValue(report, "expense", "spend");
    const sales = numberValue(report, "broad_gmv", "gmv", "sales", "direct_gmv");
    const impressions = numberValue(report, "impression", "impressions");
    const clicks = numberValue(report, "clicks", "click");
    const orders = numberValue(report, "broad_order", "orders", "direct_order");
    const sold = numberValue(report, "broad_item_sold", "item_sold", "direct_item_sold");
    const status = stringValue(commonInfo, "status", "campaign_status") || "Unknown";
    return {
      id, name: stringValue(row, "ad_name", "campaign_name", "name") || stringValue(commonInfo, "ad_name", "campaign_name", "name") || `Campaign ${id}`,
      type: stringValue(row, "campaign_placement", "campaign_type", "ad_type") || stringValue(commonInfo, "campaign_placement", "campaign_type", "ad_type") || "Shopee Ads",
      status: /ongoing|active|running|1/i.test(status) ? "Ongoing" : /pause|2/i.test(status) ? "Paused" : /end|closed|3/i.test(status) ? "Ended" : status,
      budget: displayMoney(numberValue(commonInfo, "daily_budget", "budget")), spend: displayMoney(spend), sales: displayMoney(sales),
      roas: `${(numberValue(report, "broad_roas", "roas", "direct_roas") || (spend > 0 ? sales / spend : 0)).toFixed(2)}×`,
      views: impressions.toLocaleString("en-MY"), clicks: clicks.toLocaleString("en-MY"),
      ctr: `${((numberValue(report, "ctr") || (impressions > 0 ? clicks / impressions : 0)) * 100).toFixed(2)}%`,
      conversionRate: `${((numberValue(report, "broad_conversions", "conversion_rate") || (clicks > 0 ? orders / clicks : 0)) * 100).toFixed(2)}%`,
      sold: sold.toLocaleString("en-MY"), acos: `${(sales > 0 ? spend / sales * 100 : 0).toFixed(2)}%`,
    };
  });
}

export async function GET(request: Request) {
  if (!(await getChatGPTUser())) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId")?.trim();
  if (!storeId || storeId === "all") return Response.json({ status: "unavailable", error: "Select one store to load Shopee Ads API data" }, { status: 400 });

  let credential: ShopCredential | null;
  try { credential = readShopCredential(storeId); }
  catch (error) { return Response.json({ status: "error", error: error instanceof Error ? error.message : "Invalid shop configuration" }, { status: 500 }); }
  if (!credential) return Response.json({ status: "unconfigured", error: "This store has no Shopee Ads API credentials configured" }, { status: 404 });

  const end = url.searchParams.get("end") ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(`${end}T00:00:00Z`); defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
  const start = url.searchParams.get("start") ?? defaultStart.toISOString().slice(0, 10);
  const toShopeeDate = (date: string) => date.split("-").reverse().join("-");

  try {
    const [balancePayload, dailyPayload, idsPayload] = await Promise.all([
      shopeeGet("/api/v2/ads/get_total_balance", credential),
      shopeeGet("/api/v2/ads/get_all_cpc_ads_daily_performance", credential, { start_date: toShopeeDate(start), end_date: toShopeeDate(end) }),
      shopeeGet("/api/v2/ads/get_product_level_campaign_id_list", credential),
    ]);
    const ids = campaignIds(idsPayload).slice(0, 100);
    const campaignQuery = ids.length ? { campaign_id_list: ids.join(","), start_date: toShopeeDate(start), end_date: toShopeeDate(end) } : null;
    const [performance, settings] = campaignQuery ? await Promise.all([
      shopeeGet("/api/v2/ads/get_product_campaign_daily_performance", credential, campaignQuery),
      shopeeGet("/api/v2/ads/get_product_level_campaign_setting_info", credential, { campaign_id_list: ids.join(","), info_type_list:"1,2,3,4" }),
    ]) : [null, null];
    const discoveredDailyRows = findArray(dailyPayload, ["performance_list", "daily_performance_list", "report_list", "list"]);
    const dailyRows = discoveredDailyRows.length ? discoveredDailyRows : dailyPayload && typeof dailyPayload === "object" && (dailyPayload as Record<string, unknown>).date ? [dailyPayload as Record<string, unknown>] : [];
    const daily = dailyRows.map((row) => ({
      date: isoDate(row.date ?? row.performance_date), store: storeId,
      spend: numberValue(row, "expense", "spend"), sales: numberValue(row, "broad_gmv", "gmv", "sales", "direct_gmv"),
      roas: numberValue(row, "broad_roas", "roas", "direct_roas"), views: numberValue(row, "impression", "impressions"),
      clicks: numberValue(row, "clicks", "click"), ctr: numberValue(row, "ctr"), conversion: numberValue(row, "broad_order", "orders", "direct_order"),
      sold: numberValue(row, "broad_item_sold", "item_sold", "direct_item_sold"), acos: numberValue(row, "broad_cir", "acos"),
    })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
    const balanceRecord = (balancePayload && typeof balancePayload === "object" ? balancePayload : {}) as Record<string, unknown>;
    return Response.json({
      status: "connected", storeId, shopId: credential.shopId, fetchedAt: new Date().toISOString(), range: { start, end },
      balance: numberValue(balanceRecord, "total_balance", "balance"), daily, campaigns: normalizeCampaigns(performance, settings),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message : "Shopee Ads request failed" }, { status: 502 });
  }
}
