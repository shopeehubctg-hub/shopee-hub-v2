import { POST as legacyCreateStore, PATCH as legacyUpdateStore } from "./legacy";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { supabaseRest } from "../../../supabase-rest";
import { proposedStoreId, storeNameConflict } from "../../../store-registration";
import { parseStoreDetails } from "../../../store-directory";
import { malaysiaDate } from "../../../account-ledger";
import { isMarket, marketFromPlatform } from "../../../markets";
import { parseStoreAccountSetup } from "../../../store-account-setup-server";

export const dynamic = "force-dynamic";

type Membership = { tenant_id: string; role: string; active: boolean };
type Store = { id: string; name: string; display_name: string | null; bigseller_name: string; platform: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;

async function superAdminMembership() {
  const actor = await getChatGPTUser();
  if (!actor) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const members = await supabaseRest<Membership[]>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  const member = members[0];
  if (!member?.active || member.role !== "superadmin") return { error: Response.json({ error: "Super Admin access required" }, { status: 403 }) };
  const tenants = await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
  if (!tenants[0]?.active) return { error: Response.json({ error: "Active tenant access required" }, { status: 403 }) };
  return { member, actor };
}

function rpcFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/STORE_LINK_REMOVAL_REQUIRES_APPROVAL/.test(message)) return Response.json({error:"Removing existing project links requires approval. Existing links were kept."},{status:409});
  if (/STORE_DUPLICATE|23505/.test(message)) return Response.json({ error: "A store with this name or source name already exists" }, { status: 409 });
  if (/ACCOUNT_VERSION_CONFLICT|ACCOUNT_REQUEST_CONFLICT|ACCOUNT_CARD_(ARCHIVED|NOT_FOUND|STALE)|RATE_CARD_VERSION_CONFLICT|RATE_CARD_UNAVAILABLE/.test(message)) return Response.json({ error: "Account setup or Rate Card changed. Refresh and try again." }, { status: 409 });
  if (/STORE_ACCESS_DENIED|ACCOUNT_ACCESS_DENIED/.test(message)) return Response.json({ error: "Super Admin access required" }, { status: 403 });
  if (/STORE_NOT_FOUND/.test(message)) return Response.json({ error: "Store not found" }, { status: 404 });
  if (/STORE_DETAILS_INVALID|STORE_SETUP_INVALID|ACCOUNT_INVALID|ACCOUNT_PAST_MONTH|ACCOUNT_SETUP_V2_INVALID|RATE_CARD_INVALID/.test(message)) return Response.json({ error: "Check the store details, company, Rate Card and effective month." }, { status: 400 });
  if (/"code":"(PGRST202|PGRST205|42P01|42883)"/.test(message)) return Response.json({ error: "Store Account setup is not configured in this environment." }, { status: 503 });
  return Response.json({ error: "Unable to save store. Please try again." }, { status: 503 });
}

function validMonth(value: unknown) {
  return typeof value === "string" && monthPattern.test(value) && value >= malaysiaDate().slice(0, 7);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed" }, { status: 403 });
  const candidate=await request.clone().json().catch(()=>null);
  if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&!["accountSetup","legalEntity","feeRule","effectiveMonth","accountRosterKey","expectedAccountVersion"].some(key=>key in candidate))return legacyCreateStore(request);
  const auth = await superAdminMembership();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.accountSetup === undefined) return Response.json({ error: "Account setup is required" }, { status: 400 });
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) return Response.json({ error: "Store name is required (up to 120 characters)" }, { status: 400 });
  if (!isMarket(body?.market)) return Response.json({ error: "Select MY, SG, TH or PH market" }, { status: 400 });
  if (sourceName.length > 120) return Response.json({ error: "Source name must be 120 characters or fewer" }, { status: 400 });
  if (typeof body?.requestId !== "string" || !uuidPattern.test(body.requestId)) return Response.json({ error: "A unique save ID is required" }, { status: 400 });
  const details = parseStoreDetails(body ?? {});
  if ("error" in details) return Response.json({ error: details.error }, { status: 400 });
  let setup;
  try { setup = parseStoreAccountSetup(body.accountSetup, body.market); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid Account setup" }, { status: 400 }); }
  const id = proposedStoreId(name);
  const finalSourceName = sourceName || name;
  try {
    const result = await supabaseRest<{id:string;version:string}>("rpc/account_create_store_with_setup_v2", {
      method: "POST", body: JSON.stringify({
        p_tenant: auth.member.tenant_id, p_actor: auth.actor.email.toLowerCase(), p_store_id: id,
        p_name: name, p_source_name: finalSourceName, p_market: body.market, p_setup: setup,
        p_details: details.value, p_request_id: body.requestId,
      }),
    });
    return Response.json({ store: { id: result.id, name, display_name: null, bigseller_name: finalSourceName, platform: `Shopee ${body.market}`,
      ...details.value, accountUnit: { rosterKey: `store:${id}`, legalEntity: setup.legalEntity, latestVersion: result.version }, accountUnitCount: 1 } }, { status: 201 });
  } catch (error) { return rpcFailure(error); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed" }, { status: 403 });
  const candidate=await request.clone().json().catch(()=>null);
  if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&!["accountSetup","legalEntity","feeRule","effectiveMonth","accountRosterKey","expectedAccountVersion"].some(key=>key in candidate))return legacyUpdateStore(request);
  const auth = await superAdminMembership();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!id) return Response.json({ error: "Store ID is required" }, { status: 400 });
  if (!name || name.length > 120) return Response.json({ error: "Store name is required (up to 120 characters)" }, { status: 400 });
  if (typeof body?.requestId !== "string" || !uuidPattern.test(body.requestId)) return Response.json({ error: "A unique save ID is required" }, { status: 400 });
  const details = parseStoreDetails(body ?? {});
  if ("error" in details) return Response.json({ error: details.error }, { status: 400 });
  const existing = await supabaseRest<Store[]>(`stores?select=id,name,display_name,bigseller_name,platform&tenant_id=eq.${encodeURIComponent(auth.member.tenant_id)}`);
  const target = existing.find(store => store.id === id);
  if (!target) return Response.json({ error: "Store not found" }, { status: 404 });
  if (storeNameConflict(existing, name, name, id)) return Response.json({ error: "This store name is already in use" }, { status: 409 });
  const entity = body?.legalEntity === undefined ? null : typeof body.legalEntity === "string" ? body.legalEntity.trim().replace(/\s+/g, " ") : "";
  if (entity !== null && (!entity || entity.length > 240 || !validMonth(body?.effectiveMonth)
    || typeof body.accountRosterKey !== "string" || typeof body.expectedAccountVersion !== "string" || !/^\d{1,18}$/.test(body.expectedAccountVersion)))
    return Response.json({ error: "Enter a legal company and current or future effective month; refresh Account if needed" }, { status: 400 });
  const market = marketFromPlatform(target.platform);
  const setup = entity === null ? null : { version: 2, legalEntity: entity, effectiveMonth: body?.effectiveMonth };
  try {
    const result = await supabaseRest<{id:string;version:string|null}>("rpc/account_update_store_with_setup_v2", {
      method: "POST", body: JSON.stringify({
        p_tenant: auth.member.tenant_id, p_actor: auth.actor.email.toLowerCase(), p_store_id: id,
        p_name: name, p_source_name: target.bigseller_name, p_market: market, p_setup: setup,
        p_details: details.value, p_request_id: body.requestId,
        p_roster_key: entity === null ? null : body.accountRosterKey,
        p_expected_version: entity === null ? null : body.expectedAccountVersion,
      }),
    });
    return Response.json({ store: { ...target, name, display_name: name === target.name ? null : name,
      ...details.value, ...(entity !== null ? { accountUnit: { rosterKey: body.accountRosterKey, legalEntity: entity, latestVersion: result.version }, accountUnitCount: 1 } : {}) } });
  } catch (error) { return rpcFailure(error); }
}
