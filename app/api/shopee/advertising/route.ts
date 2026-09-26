import { getChatGPTUser } from "../../../chatgpt-auth";
import { supabaseRest } from "../../../supabase-rest";
import { canReadShopeeAds } from "../../../shopee-ads-access.js";

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

  if (process.env.SHOPEE_SHOP_STORE_ID !== storeId) return null;
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

function isoDate(value: unknown) {
  const text = String(value ?? "");
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text.slice(0, 10);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId")?.trim();
  if (!storeId || storeId === "all") return Response.json({ status: "unavailable", error: "Select one store to load Shopee Ads API data" }, { status: 400 });

  try {
    const members = await supabaseRest<Array<{id:number;tenant_id:string;role:string;active:boolean;module_access_mode:string;store_access_mode:string}>>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`);
    const membership = members[0];
    if (!membership?.active) return Response.json({ error: "Advertising access denied" }, { status: 403 });
    const tenantId = encodeURIComponent(membership.tenant_id);
    const [tenants,stores,tenantModules,userModules,assignedStores] = await Promise.all([
      supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenantId}&limit=1`),
      supabaseRest<Array<{id:string}>>(`stores?select=id&tenant_id=eq.${tenantId}&id=eq.${encodeURIComponent(storeId)}&limit=1`),
      supabaseRest<Array<{enabled:boolean}>>(`tenant_module_permissions?select=enabled&tenant_id=eq.${tenantId}&module_id=eq.advertising&limit=1`),
      membership.module_access_mode === "custom" ? supabaseRest<Array<{enabled:boolean}>>(`user_module_permissions?select=enabled&user_id=eq.${membership.id}&module_id=eq.advertising&limit=1`) : Promise.resolve([]),
      membership.store_access_mode === "selected" ? supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&user_id=eq.${membership.id}&store_id=eq.${encodeURIComponent(storeId)}&limit=1`) : Promise.resolve([]),
    ]);
    if (!canReadShopeeAds({membership,tenantActive:tenants[0]?.active,storeExists:stores.length>0,tenantAdvertisingEnabled:tenantModules[0]?.enabled,userAdvertisingEnabled:userModules[0]?.enabled,assignedStore:assignedStores.length>0})) {
      return Response.json({ error: "Advertising access denied" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Advertising access could not be verified" }, { status: 503 });
  }

  let credential: ShopCredential | null;
  try { credential = readShopCredential(storeId); }
  catch (error) { return Response.json({ status: "error", error: error instanceof Error ? error.message : "Invalid shop configuration" }, { status: 500 }); }
  if (!credential) return Response.json({ status: "unconfigured", error: "This store has no Shopee Ads API credentials configured" }, { status: 404 });

  const end = url.searchParams.get("end") ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(`${end}T00:00:00Z`); defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
  const start = url.searchParams.get("start") ?? defaultStart.toISOString().slice(0, 10);
  const toShopeeDate = (date: string) => date.split("-").reverse().join("-");

  try {
    const [balancePayload, dailyPayload] = await Promise.all([
      shopeeGet("/api/v2/ads/get_total_balance", credential),
      shopeeGet("/api/v2/ads/get_all_cpc_ads_daily_performance", credential, { start_date: toShopeeDate(start), end_date: toShopeeDate(end) }),
    ]);
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
      balance: numberValue(balanceRecord, "total_balance", "balance"), daily,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ status: "error", error: error instanceof Error ? error.message : "Shopee Ads request failed" }, { status: 502 });
  }
}
