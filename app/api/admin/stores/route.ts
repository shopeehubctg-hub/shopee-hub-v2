import {optionalBillingName} from "../../../registered-names";
import {registeredNamesAvailable} from "../../../registered-names-server";
import { POST as legacyCreateStore, PATCH as legacyUpdateStore } from "./legacy";
import { permissionManagement } from "../../../permission-management";
import { supabaseRest } from "../../../supabase-rest";
import { proposedStoreId, storeNameConflict } from "../../../store-registration";
import { parseStoreDetails } from "../../../store-directory";
import { malaysiaDate } from "../../../account-ledger";
import { isMarket, marketFromPlatform } from "../../../markets";
import { parseStoreAccountSetup } from "../../../store-account-setup-server";
import { accountSecurityGate } from "../../../account-security-server";

export const dynamic = "force-dynamic";

type Store = { id: string; name: string; display_name: string | null; bigseller_name: string; platform: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;


function rpcFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/STORE_LINK_REMOVAL_REQUIRES_APPROVAL/.test(message)) return Response.json({error:"Removing existing project links requires approval. Existing links were kept."},{status:409});
  if (/STORE_DUPLICATE|23505/.test(message)) return Response.json({ error: "A store with this name or source name already exists" }, { status: 409 });
  if (/ACCOUNT_VERSION_CONFLICT|ACCOUNT_REQUEST_CONFLICT|ACCOUNT_CARD_(ARCHIVED|NOT_FOUND|STALE)|RATE_CARD_VERSION_CONFLICT|RATE_CARD_UNAVAILABLE/.test(message)) return Response.json({ error: "Account setup or Rate Card changed. Refresh and try again." }, { status: 409 });
  if (/STORE_ACCESS_DENIED|ACCOUNT_ACCESS_DENIED/.test(message)) return Response.json({ error: "Store management access required" }, { status: 403 });
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
  const accountBearing=Boolean(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&["accountSetup","legalEntity","billingEntity","feeRule","effectiveMonth","accountRosterKey","expectedAccountVersion"].some(key=>key in candidate));
  if(accountBearing){const accountGate=await accountSecurityGate();if(accountGate)return accountGate;}
  const auth=await permissionManagement(request);
  if("error" in auth)return auth.error;
  if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&!accountBearing)return auth.isSuperAdmin?legacyCreateStore(request):Response.json({error:"Use complete Account setup to create a store atomically."},{status:403});
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
  if(body.accountSetup&&typeof body.accountSetup==='object'&&'billingEntity' in body.accountSetup){try{if(!await registeredNamesAvailable())return Response.json({error:'Registered names are not configured in this environment. No store was saved.'},{status:503});}catch{return Response.json({error:'Unable to verify registered names. No store was saved.'},{status:503});}}
  const id = proposedStoreId(name);
  const finalSourceName = sourceName || name;
  try {
    const result = await supabaseRest<{id:string;version:string}>("rpc/account_create_store_with_setup_v2", {
      method: "POST", body: JSON.stringify({
        p_tenant: auth.member.tenant_id, p_actor: auth.actor, p_store_id: id,
        p_name: name, p_source_name: finalSourceName, p_market: body.market, p_setup: setup,
        p_details: details.value, p_request_id: body.requestId,
      }),
    });
    return Response.json({ store: { id: result.id, name, display_name: null, bigseller_name: finalSourceName, platform: `Shopee ${body.market}`,
      ...details.value, accountUnit: { rosterKey: `store:${id}`, legalEntity: setup.legalEntity,billingEntity:setup.billingEntity??null, latestVersion: result.version }, accountUnitCount: 1 } }, { status: 201 });
  } catch (error) { return rpcFailure(error); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed" }, { status: 403 });
  const candidate=await request.clone().json().catch(()=>null);
  const accountBearing=Boolean(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&["accountSetup","legalEntity","billingEntity","feeRule","effectiveMonth","accountRosterKey","expectedAccountVersion"].some(key=>key in candidate));
  if(accountBearing){const accountGate=await accountSecurityGate();if(accountGate)return accountGate;}
  const auth=await permissionManagement(request);
  if("error" in auth)return auth.error;
  if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate)&&!accountBearing)return auth.isSuperAdmin?legacyUpdateStore(request):Response.json({error:"Use complete store setup to update this store atomically."},{status:403});
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!id) return Response.json({ error: "Store ID is required" }, { status: 400 });
  if(!auth.isSuperAdmin&&!auth.storeIds.includes(id))return Response.json({error:"Store access denied"},{status:403});
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
  const billingSupplied=Boolean(body&&Object.prototype.hasOwnProperty.call(body,'billingEntity'));
  let billingEntity:string|null=null;
  if(billingSupplied){
    if(entity===null)return Response.json({error:'Enter Registered Name (Platform) and the effective invoice month before saving Billing name.'},{status:400});
    try{billingEntity=optionalBillingName(body?.billingEntity);}catch(error){return Response.json({error:error instanceof Error?error.message:'Check Registered Name (Billing).'},{status:400});}
    try{if(!await registeredNamesAvailable())return Response.json({error:'Registered names are not configured in this environment. No store was saved.'},{status:503});}catch{return Response.json({error:'Unable to verify registered names. No store was saved.'},{status:503});}
  }
  const market = marketFromPlatform(target.platform);
  const setup = entity === null ? null : { version: 2, legalEntity: entity,...(billingSupplied?{billingEntity}:{}), effectiveMonth: body?.effectiveMonth };
  try {
    const result = await supabaseRest<{id:string;version:string|null}>("rpc/account_update_store_with_setup_v2", {
      method: "POST", body: JSON.stringify({
        p_tenant: auth.member.tenant_id, p_actor: auth.actor, p_store_id: id,
        p_name: name, p_source_name: target.bigseller_name, p_market: market, p_setup: setup,
        p_details: details.value, p_request_id: body.requestId,
        p_roster_key: entity === null ? null : body.accountRosterKey,
        p_expected_version: entity === null ? null : body.expectedAccountVersion,
      }),
    });
    let savedNames:{legal_entity:string;billing_registered_name:string|null}|undefined;
    if(billingSupplied&&entity!==null){
      if(!result.version||!/^\d{1,18}$/.test(result.version))throw Error('ACCOUNT_NAMES_READBACK_REQUIRED');
      const versions=await supabaseRest<Array<{legal_entity:string;billing_registered_name:string|null}>>(`account_billing_unit_versions?select=legal_entity,billing_registered_name&tenant_id=eq.${encodeURIComponent(auth.member.tenant_id)}&roster_key=eq.${encodeURIComponent(String(body.accountRosterKey))}&version=eq.${encodeURIComponent(result.version)}&limit=1`);
      if(versions.length!==1)throw Error('ACCOUNT_NAMES_READBACK_REQUIRED');savedNames=versions[0];
    }
    return Response.json({ store: { ...target, name, display_name: name === target.name ? null : name,
      ...details.value, ...(entity !== null ? { accountUnit: { rosterKey: body.accountRosterKey, legalEntity: savedNames?.legal_entity??entity,...(savedNames?{billingEntity:savedNames.billing_registered_name}:{}), latestVersion: result.version }, accountUnitCount: 1 } : {}) } });
  } catch (error) { return rpcFailure(error); }
}
