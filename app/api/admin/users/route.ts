import { ALL_PORTAL_MODULE_IDS } from "../../../module-permissions";
import { canonicalStoreId } from "../../../live-calendar-model";
import { supabaseRest } from "../../../supabase-rest";
import { supabaseConfig } from "../../../supabase-rest";
import { randomBytes } from "node:crypto";
import { permissionManagement, permissionSaveError, manageablePermissionUser, effectivePermissionModules, type PermissionContext, type PermissionMember } from "../../../permission-management";
import { storeDetails, storeDirectory } from "../../../store-directory";
import { malaysiaDate } from "../../../account-ledger";

export const dynamic="force-dynamic";
type Role="customer"|"manager"|"superadmin";
type Member=PermissionMember & { permissions_version: number };
const headers={"Cache-Control":"private, no-store"};

async function portalUsers(auth: PermissionContext){
  const tenantId=auth.member.tenant_id;
  const [users,tenantModules,tenantStoreRows,directory,accountStatus,storeSetupAvailable]=await Promise.all([
    supabaseRest<Member[]>(`customer_users?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&order=email.asc`),
    supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(tenantId)}`),
    supabaseRest<Array<{id:string;name:string;display_name:string|null;platform:string;bigseller_name:string}>>(`stores?select=id,name,display_name,platform,bigseller_name&tenant_id=eq.${encodeURIComponent(tenantId)}&order=name.asc`),
    storeDirectory(tenantId),
    supabaseRest<Array<{roster_key:string;legal_entity:string;version:string;store_id:string|null;effective_month:string}>>(`account_billing_unit_versions?select=roster_key,legal_entity,version::text,store_id,effective_month&tenant_id=eq.${encodeURIComponent(tenantId)}&order=version.desc`)
      .then(rows=>({rows,available:true}))
      .catch(error=>{if(error instanceof Error&&/"code":"(PGRST205|42P01)"/.test(error.message))return {rows:[],available:false};throw error;}),
    supabaseRest<boolean>("rpc/account_store_setup_v2_available",{method:"POST"})
      .catch(error=>{if(error instanceof Error&&/"code":"(PGRST202|PGRST205|42883)"/.test(error.message))return false;throw error;}),
  ]);
  const accountVersions=accountStatus.rows;
  const latestByKey=new Map<string,typeof accountVersions[number]>();
  const currentByKey=new Map<string,typeof accountVersions[number]>();
  const currentMonth=malaysiaDate().slice(0,7);
  for(const version of accountVersions){
    const latest=latestByKey.get(version.roster_key);
    if(!latest||BigInt(version.version)>BigInt(latest.version))latestByKey.set(version.roster_key,version);
    if(version.effective_month.slice(0,7)<=currentMonth){
      const current=currentByKey.get(version.roster_key);
      if(!current||version.effective_month>current.effective_month||version.effective_month===current.effective_month&&BigInt(version.version)>BigInt(current.version))currentByKey.set(version.roster_key,version);
    }
  }
  const unitsByStore=new Map<string,Array<{rosterKey:string;legalEntity:string;latestVersion:string}>>();
  for(const [key,current] of currentByKey){
    if(!current.store_id)continue;
    const units=unitsByStore.get(current.store_id)??[];
    units.push({rosterKey:key,legalEntity:current.legal_entity,latestVersion:latestByKey.get(key)?.version??current.version});
    unitsByStore.set(current.store_id,units);
  }
  for(const [key,latest] of latestByKey){
    if(currentByKey.has(key)||!latest.store_id)continue;
    const units=unitsByStore.get(latest.store_id)??[];
    units.push({rosterKey:key,legalEntity:latest.legal_entity,latestVersion:latest.version});
    unitsByStore.set(latest.store_id,units);
  }
  const tenantStores=tenantStoreRows.filter(store=>canonicalStoreId(store.id)===store.id).map(store=>{
    const units=unitsByStore.get(store.id)??[];
    return {...store,name:store.display_name??store.name,...storeDetails(directory,store.id),accountUnit:units.length===1?units[0]:null,accountUnitCount:units.length};
  });
  const ids=users.map(user=>user.id);const [moduleRows,storeRows]=ids.length?await Promise.all([
    supabaseRest<Array<{user_id:number;module_id:string;enabled:boolean}>>(`user_module_permissions?select=user_id,module_id,enabled&user_id=in.(${ids.join(",")})`),
    supabaseRest<Array<{user_id:number;store_id:string}>>(`user_store_access?select=user_id,store_id&enabled=eq.true&user_id=in.(${ids.join(",")})`),
  ]):[[],[]];
  const clientDefaults=ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?tenantModules.find(row=>row.module_id===id)?.enabled===true:tenantModules.find(row=>row.module_id===id)?.enabled!==false);
  const allowedStores=tenantStores.filter(store=>auth.storeIds.includes(store.id));
  const exposedUsers=users.flatMap(user=>{
    const rows=moduleRows.filter(row=>row.user_id===user.id);
    const delegated=user.can_manage_permissions===true;
    const storeIds=user.store_access_mode==="selected"?[...new Set(storeRows.filter(row=>row.user_id===user.id).map(row=>canonicalStoreId(row.store_id)))].filter(id=>tenantStores.some(store=>store.id===id)):tenantStores.map(store=>store.id);
    const enabledModules=effectivePermissionModules(user,tenantModules,rows);
    const editable=manageablePermissionUser(auth,user,storeIds,delegated)
      && (auth.isSuperAdmin||enabledModules.every(id=>auth.grantableModules.includes(id)));
    if(!auth.isSuperAdmin&&!editable)return [];
    return [{id:user.id,email:user.email,displayName:user.display_name??"",role:user.role,active:user.active,
      moduleAccessMode:user.module_access_mode,storeAccessMode:user.store_access_mode,createdAt:user.created_at,
      enabledModules,storeIds,canManagePermissions:user.role==="superadmin"||delegated,editable,
      permissionsVersion:user.permissions_version}];
  });
  return{stores:allowedStores,accountSettingsAvailable:accountStatus.available&&storeSetupAvailable===true,
    clientDefaults,users:exposedUsers,access:{isSuperAdmin:auth.isSuperAdmin,canManageStores:true,
      canManageDefaults:auth.isSuperAdmin,grantableModules:auth.grantableModules}};
}

export async function GET(){
  try{const auth=await permissionManagement();if("error"in auth)return auth.error;return Response.json(await portalUsers(auth),{headers});}
  catch(error){return permissionSaveError(error);}
}

export async function POST(request:Request){
  try{
    const auth=await permissionManagement(request);if("error"in auth)return auth.error;
    const body=await request.json().catch(()=>null)as{email?:string;displayName?:string;role?:Role}|null;
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const role=body?.role??"customer";
    if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter a valid email address"},{status:400});
    if(!["customer","manager","superadmin"].includes(role)||!auth.isSuperAdmin&&role!=="customer")return Response.json({error:"Role is outside your authorized access"},{status:403});
    if(body?.displayName!==undefined&&(typeof body.displayName!=="string"||body.displayName.length>120))return Response.json({error:"Enter a display name of up to 120 characters"},{status:400});
    const existing=await supabaseRest<Member[]>(`customer_users?select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
    if(existing.length)return Response.json({error:"This email already has portal access. Manage its existing account."},{status:409});
    // Create login first. An auth failure must never delete a portal or business record.
    const{url,secret}=supabaseConfig();
    const authResponse=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers:{apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({email,password:randomBytes(32).toString("base64url"),email_confirm:true}),cache:"no-store"});
    if(!authResponse.ok&&authResponse.status!==422)return Response.json({error:"Unable to create login account. Please try again."},{status:502});
    await supabaseRest("customer_users",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({email,display_name:body?.displayName?.trim()||null,tenant_id:auth.member.tenant_id,role,active:true,...(!auth.isSuperAdmin?{module_access_mode:"custom",store_access_mode:"selected"}:{})})});
    return Response.json(await portalUsers(auth),{status:201,headers});
  }catch(error){return permissionSaveError(error);}
}

export async function PATCH(request:Request){
  try{
    const auth=await permissionManagement(request);if("error"in auth)return auth.error;
    const raw=await request.text();if(raw.length>40000)return Response.json({error:"Permission update is too large"},{status:400});
    let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return Response.json({error:"Invalid permission update"},{status:400});}
    if(!body||typeof body!=="object"||Array.isArray(body)||!Number.isSafeInteger(body.id)||Number(body.id)<1)return Response.json({error:"User ID is required"},{status:400});
    const allowed=["displayName","role","active","moduleAccessMode","enabledModules","storeAccessMode","storeIds","canManagePermissions","expectedVersion","requestId"];
    const payload=Object.fromEntries(allowed.filter(key=>key in body).map(key=>[key,body[key]]));
    if(!auth.isSuperAdmin){payload.role??="customer";payload.canManagePermissions??=false;}
    if(payload.role==="customer"&&payload.moduleAccessMode==="custom"&&Array.isArray(payload.enabledModules)&&payload.enabledModules.includes("live_calendar")&&(payload.storeAccessMode!=="selected"||!Array.isArray(payload.storeIds)||payload.storeIds.length===0))
      return Response.json({error:"Select the customer's authorized stores before enabling Live Calendar"},{status:400});
    await supabaseRest("rpc/save_user_access",{method:"POST",body:JSON.stringify({p_tenant:auth.member.tenant_id,p_actor:auth.actor,p_target_id:body.id,p_payload:payload})});
    return Response.json(await portalUsers(auth),{headers});
  }catch(error){return permissionSaveError(error);}
}
