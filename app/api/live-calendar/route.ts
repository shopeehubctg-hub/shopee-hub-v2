import { getChatGPTUser } from "../../chatgpt-auth";
import { supabaseRest } from "../../supabase-rest";
import { directoryStoreNames } from "../../live-calendar-store-registry";
import { DIRECTORY_TENANT_ID, canonicalStoreId, canonicalIdForDirectoryName, matchingStore, platformForDirectoryName, storeZone, parseStoreLocal, readAllCalendarPages } from "../../live-calendar-model";

export const dynamic = "force-dynamic";

type Membership = { id:number; tenant_id:string; role:"customer"|"manager"|"superadmin"; active:boolean; module_access_mode:"role_default"|"custom"; store_access_mode:"all"|"selected" };
type Store = { id:string; name:string; display_name:string|null; bigseller_name:string; platform:string };
type Session = { id:string; tenant_id:string; store_id:string; title:string; start_at:string; end_at:string; time_zone:string; status:"scheduled"|"cancelled"; internal_note:string|null; created_at:string; updated_at:string };
type SessionInput = { id?:unknown; storeId?:unknown; directoryName?:unknown; title?:unknown; startLocal?:unknown; endLocal?:unknown; timeZone?:unknown; internalNote?:unknown; confirmOverlap?:unknown; action?:unknown };

const noStore = { error:"Store access denied" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const privateHeaders = { "Cache-Control":"private, no-store" };

async function access() {
  const user = await getChatGPTUser();
  if (!user) return { error:Response.json({error:"Authentication required"},{status:401}) };
  const rows = await supabaseRest<Membership[]>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`);
  const member = rows[0];
  if (!member?.active) return { error:Response.json({error:"Portal access disabled"},{status:403}) };
  const tenants = await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
  if (!tenants[0]?.active) return { error:Response.json({error:"Tenant access disabled"},{status:403}) };
  if (member.role !== "superadmin") {
    const tenantPermissions = await supabaseRest<Array<{enabled:boolean}>>(`tenant_module_permissions?select=enabled&tenant_id=eq.${encodeURIComponent(member.tenant_id)}&module_id=eq.live_calendar&limit=1`);
    if (tenantPermissions[0]?.enabled !== true) return { error:Response.json({error:"Live Calendar access disabled"},{status:403}) };
    if (member.module_access_mode === "custom") {
      const userPermissions = await supabaseRest<Array<{enabled:boolean}>>(`user_module_permissions?select=enabled&user_id=eq.${member.id}&module_id=eq.live_calendar&limit=1`);
      if (userPermissions[0]?.enabled !== true) return { error:Response.json({error:"Live Calendar access disabled"},{status:403}) };
    }
  }
  const storeRows = await supabaseRest<Store[]>(`stores?select=id,name,display_name,bigseller_name,platform&tenant_id=eq.${encodeURIComponent(member.tenant_id)}&order=name.asc`);
  const stores=storeRows.filter(store=>canonicalStoreId(store.id)===store.id);
  if (member.role === "superadmin" || member.role !== "customer" && member.store_access_mode === "all") return { member, user, stores };
  const assigned = await supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&user_id=eq.${member.id}`);
  const ids = new Set(assigned.map(row=>canonicalStoreId(row.store_id)));
  return { member, user, stores:stores.filter(store=>ids.has(store.id)) };
}

function cleanInput(body:SessionInput, stores:Store[]) {
  const store = stores.find(item=>item.id===body.storeId);
  if (!store) return { error:Response.json(noStore,{status:403}) };
  if (body.timeZone !== storeZone(store)) return { error:Response.json({error:"Time zone must match the store market"},{status:400}) };
  const startAt = parseStoreLocal(body.startLocal);
  const endAt = parseStoreLocal(body.endLocal);
  if (!startAt || !endAt || endAt <= startAt) return { error:Response.json({error:"Enter valid start and end times, with end after start"},{status:400}) };
  const title = body.title === undefined || body.title === "" ? "Live session" : body.title;
  const note = body.internalNote === undefined || body.internalNote === "" ? null : body.internalNote;
  if (typeof title !== "string" || title.length > 120 || typeof note !== "string" && note !== null || note !== null && note.length > 2000)
    return { error:Response.json({error:"Title or internal note is too long"},{status:400}) };
  return { store, values:{store_id:store.id,title:title.trim() || "Live session",start_at:startAt,end_at:endAt,time_zone:storeZone(store),internal_note:note} };
}

async function overlaps(tenantId:string, storeId:string, startAt:string, endAt:string, excludeId?:string) {
  const rows = await supabaseRest<Array<Pick<Session,"id"|"title"|"start_at"|"end_at">>>(
    `live_sessions?select=id,title,start_at,end_at&tenant_id=eq.${encodeURIComponent(tenantId)}&store_id=eq.${encodeURIComponent(storeId)}&status=eq.scheduled&start_at=lt.${encodeURIComponent(endAt)}&end_at=gt.${encodeURIComponent(startAt)}&limit=20`
  );
  return rows.filter(row=>row.id!==excludeId);
}

export async function GET(request:Request) {
  try {
    const auth = await access();
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    if (storeId && storeId !== "all" && !auth.stores.some(store=>store.id===storeId)) return Response.json(noStore,{status:403});
    const from = url.searchParams.get("from") || new Date(Date.now()-31*86400000).toISOString();
    const to = url.searchParams.get("to") || new Date(Date.now()+335*86400000).toISOString();
    const fromDate = new Date(from), toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate || toDate.getTime()-fromDate.getTime()>370*86400000)
      return Response.json({error:"Invalid calendar range"},{status:400});
    let unregisteredStores:string[]=[];
    let registryError:string|null=null;
    if(auth.member.role==="superadmin"&&auth.member.tenant_id===DIRECTORY_TENANT_ID) {
      try {
        const names=await directoryStoreNames();
        unregisteredStores=names.filter(name=>!matchingStore(name,auth.stores));
      } catch { registryError="Link Directory could not be checked. Calendar data is still available."; }
    }
    if (!auth.stores.length) return Response.json({stores:[],sessions:[],canManage:auth.member.role==="superadmin",unregisteredStores,registryError},{headers:privateHeaders});
    const visibleIds = storeId && storeId!=="all" ? [storeId] : auth.stores.map(store=>store.id);
    const fields = auth.member.role === "superadmin" ? "id,tenant_id,store_id,title,start_at,end_at,time_zone,status,internal_note,created_at,updated_at" : "id,store_id,title,start_at,end_at,time_zone,status";
    const idFilter = encodeURIComponent(`(${visibleIds.map(id=>JSON.stringify(id)).join(",")})`);
    const statusFilter = auth.member.role === "superadmin" ? "" : "&status=eq.scheduled";
    const sessions = await readAllCalendarPages<Session>((offset,limit)=>supabaseRest<Session[]>(`live_sessions?select=${fields}&tenant_id=eq.${encodeURIComponent(auth.member.tenant_id)}&store_id=in.${idFilter}${statusFilter}&start_at=lt.${encodeURIComponent(toDate.toISOString())}&end_at=gt.${encodeURIComponent(fromDate.toISOString())}&order=start_at.asc,id.asc&offset=${offset}&limit=${limit}`));
    return Response.json({stores:auth.stores.map(store=>({id:store.id,name:store.display_name??store.name,platform:store.platform,timeZone:storeZone(store)})),sessions,canManage:auth.member.role==="superadmin",unregisteredStores,registryError},{headers:privateHeaders});
  } catch (error) {
    console.error("Live Calendar read failed",error);
    return Response.json({error:"Live Calendar is unavailable"},{status:503});
  }
}

export async function POST(request:Request) {
  try {
    const auth = await access();
    if ("error" in auth) return auth.error;
    if (auth.member.role!=="superadmin") return Response.json({error:"Super Admin access required"},{status:403});
    const body = await request.json().catch(()=>null) as SessionInput|null;
    if (!body) return Response.json({error:"Invalid request"},{status:400});
    if (body.action==="registerStore") {
      if(auth.member.tenant_id!==DIRECTORY_TENANT_ID)return Response.json({error:"This Link Directory belongs to another tenant"},{status:403});
      if(typeof body.directoryName!=="string")return Response.json({error:"Directory store name required"},{status:400});
      const names=await directoryStoreNames();
      if(!names.includes(body.directoryName))return Response.json({error:"Store is not in Link Directory"},{status:400});
      const existing=matchingStore(body.directoryName,auth.stores);
      if(existing)return Response.json({store:existing},{headers:privateHeaders});
      const id=canonicalIdForDirectoryName(body.directoryName);
      const platform=platformForDirectoryName(body.directoryName);
      const created=await supabaseRest<Store[]>("stores?select=id,name,display_name,bigseller_name,platform",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({id,tenant_id:auth.member.tenant_id,name:body.directoryName,platform,bigseller_name:body.directoryName})});
      return Response.json({store:created[0]},{status:201,headers:privateHeaders});
    }
    const input = cleanInput(body,auth.stores);
    if ("error" in input) return input.error;
    const conflicts = await overlaps(auth.member.tenant_id,input.store.id,input.values.start_at,input.values.end_at);
    if (conflicts.length && body.confirmOverlap!==true) return Response.json({error:"This store already has a live session at that time",overlaps:conflicts},{status:409});
    const rows = await supabaseRest<Session[]>("live_sessions?select=*",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...input.values,tenant_id:auth.member.tenant_id,created_by:auth.user.email,updated_by:auth.user.email})});
    return Response.json({session:rows[0]},{status:201,headers:privateHeaders});
  } catch (error) {
    console.error("Live Calendar create failed",error);
    return Response.json({error:"Unable to save live session"},{status:503});
  }
}

export async function PATCH(request:Request) {
  try {
    const auth = await access();
    if ("error" in auth) return auth.error;
    if (auth.member.role!=="superadmin") return Response.json({error:"Super Admin access required"},{status:403});
    const body = await request.json().catch(()=>null) as SessionInput|null;
    if (!body || typeof body.id!=="string" || !uuid.test(body.id)) return Response.json({error:"Valid session ID required"},{status:400});
    const rows = await supabaseRest<Session[]>(`live_sessions?select=*&id=eq.${body.id}&tenant_id=eq.${encodeURIComponent(auth.member.tenant_id)}&limit=1`);
    const existing = rows[0];
    if (!existing) return Response.json({error:"Session not found"},{status:404});
    if (existing.status==="cancelled") return Response.json({error:"Cancelled sessions cannot be changed"},{status:409});
    let update:Record<string,unknown>;
    if (body.action==="cancel") update={status:"cancelled"};
    else {
      const input = cleanInput(body,auth.stores);
      if ("error" in input) return input.error;
      const conflicts = await overlaps(auth.member.tenant_id,input.store.id,input.values.start_at,input.values.end_at,existing.id);
      if (conflicts.length && body.confirmOverlap!==true) return Response.json({error:"This store already has a live session at that time",overlaps:conflicts},{status:409});
      update=input.values;
    }
    const changed = await supabaseRest<Session[]>(`live_sessions?id=eq.${existing.id}&tenant_id=eq.${encodeURIComponent(auth.member.tenant_id)}&status=eq.scheduled`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({...update,updated_at:new Date().toISOString(),updated_by:auth.user.email})});
    if (!changed.length) return Response.json({error:"Session was changed by another user"},{status:409});
    return Response.json({session:changed[0]},{headers:privateHeaders});
  } catch (error) {
    console.error("Live Calendar update failed",error);
    return Response.json({error:"Unable to update live session"},{status:503});
  }
}
