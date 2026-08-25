import { getChatGPTUser } from "../../../chatgpt-auth";
import { ALL_PORTAL_MODULE_IDS, isPortalModuleId } from "../../../module-permissions";
import { supabaseRest } from "../../../supabase-rest";
import { supabaseConfig } from "../../../supabase-rest";
import { randomBytes } from "node:crypto";

export const dynamic="force-dynamic";
type Role="customer"|"manager"|"superadmin";
type Member={id:number;email:string;display_name:string|null;tenant_id:string;role:Role;active:boolean;module_access_mode:"role_default"|"custom";store_access_mode:"all"|"selected";created_at:string};

async function authSuperAdmin(){const actor=await getChatGPTUser();if(!actor)return{error:Response.json({error:"Authentication required"},{status:401})};const rows=await supabaseRest<Member[]>(`customer_users?select=*&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);const membership=rows[0];if(!membership?.active||membership.role!=="superadmin")return{error:Response.json({error:"Super Admin access required"},{status:403})};return{membership};}

async function portalUsers(tenantId:string){
  const [users,tenantModules,tenantStores]=await Promise.all([
    supabaseRest<Member[]>(`customer_users?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&order=email.asc`),
    supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(tenantId)}`),
    supabaseRest<Array<{id:string;name:string;platform:string}>>(`stores?select=id,name,platform&tenant_id=eq.${encodeURIComponent(tenantId)}&order=name.asc`),
  ]);
  const ids=users.map(user=>user.id);const [moduleRows,storeRows]=ids.length?await Promise.all([
    supabaseRest<Array<{user_id:number;module_id:string;enabled:boolean}>>(`user_module_permissions?select=user_id,module_id,enabled&user_id=in.(${ids.join(",")})`),
    supabaseRest<Array<{user_id:number;store_id:string}>>(`user_store_access?select=user_id,store_id&user_id=in.(${ids.join(",")})`),
  ]):[[],[]];
  const clientDefaults=ALL_PORTAL_MODULE_IDS.filter(id=>tenantModules.find(row=>row.module_id===id)?.enabled!==false);
  return{stores:tenantStores,clientDefaults,users:users.map(user=>({id:user.id,email:user.email,displayName:user.display_name??"",role:user.role,active:user.active,moduleAccessMode:user.module_access_mode,storeAccessMode:user.store_access_mode,createdAt:user.created_at,enabledModules:user.module_access_mode==="custom"?ALL_PORTAL_MODULE_IDS.filter(id=>moduleRows.find(row=>row.user_id===user.id&&row.module_id===id)?.enabled===true):(user.role==="customer"?clientDefaults:ALL_PORTAL_MODULE_IDS),storeIds:user.store_access_mode==="selected"?storeRows.filter(row=>row.user_id===user.id).map(row=>row.store_id):tenantStores.map(store=>store.id)}))};
}

export async function GET(){const auth=await authSuperAdmin();if("error"in auth)return auth.error;return Response.json(await portalUsers(auth.membership.tenant_id));}

export async function POST(request:Request){const auth=await authSuperAdmin();if("error"in auth)return auth.error;const body=await request.json().catch(()=>null)as{email?:string;displayName?:string;role?:Role}|null;const email=body?.email?.trim().toLowerCase();const role=body?.role??"customer";if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter a valid email address"},{status:400});if(!["customer","manager","superadmin"].includes(role))return Response.json({error:"Invalid role"},{status:400});const existing=await supabaseRest<Array<{id:number;tenant_id:string}>>(`customer_users?select=id,tenant_id&email=eq.${encodeURIComponent(email)}&limit=1`);if(existing[0]&&existing[0].tenant_id!==auth.membership.tenant_id)return Response.json({error:"This email already has portal access"},{status:409});const createdPortalUser=!existing.length;if(createdPortalUser)await supabaseRest("customer_users",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({email,display_name:body?.displayName?.trim()||null,tenant_id:auth.membership.tenant_id,role,active:true})});const{url,secret}=supabaseConfig();const authResponse=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers:{apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({email,password:randomBytes(32).toString("base64url"),email_confirm:true}),cache:"no-store"});if(!authResponse.ok&&authResponse.status!==422){if(createdPortalUser)await supabaseRest(`customer_users?email=eq.${encodeURIComponent(email)}`,{method:"DELETE"});return Response.json({error:"Unable to create login account"},{status:502});}return Response.json(await portalUsers(auth.membership.tenant_id),{status:createdPortalUser?201:200});}

export async function PATCH(request:Request){
  const auth=await authSuperAdmin();if("error"in auth)return auth.error;const body=await request.json().catch(()=>null)as{id?:number;displayName?:string;role?:Role;active?:boolean;moduleAccessMode?:"role_default"|"custom";enabledModules?:unknown[];storeAccessMode?:"all"|"selected";storeIds?:unknown[]}|null;
  if(!body?.id)return Response.json({error:"User ID is required"},{status:400});const targets=await supabaseRest<Member[]>(`customer_users?select=*&id=eq.${body.id}&tenant_id=eq.${encodeURIComponent(auth.membership.tenant_id)}&limit=1`);const target=targets[0];if(!target)return Response.json({error:"User not found"},{status:404});
  if(target.id===auth.membership.id&&(body.active===false||body.role&&body.role!=="superadmin"))return Response.json({error:"You cannot remove your own Super Admin access"},{status:400});if(body.role&&!["customer","manager","superadmin"].includes(body.role))return Response.json({error:"Invalid role"},{status:400});if(body.moduleAccessMode==="custom"&&(!Array.isArray(body.enabledModules)||!body.enabledModules.every(isPortalModuleId)))return Response.json({error:"Invalid module selection"},{status:400});
  const tenantStores=await supabaseRest<Array<{id:string}>>(`stores?select=id&tenant_id=eq.${encodeURIComponent(auth.membership.tenant_id)}`);const validStoreIds=new Set(tenantStores.map(store=>store.id));if(body.storeAccessMode==="selected"&&(!Array.isArray(body.storeIds)||!body.storeIds.every(id=>typeof id==="string"&&validStoreIds.has(id))))return Response.json({error:"Invalid store selection"},{status:400});
  await supabaseRest(`customer_users?id=eq.${target.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:body.displayName?.trim()||null,role:body.role??target.role,active:body.active??target.active,module_access_mode:body.moduleAccessMode??target.module_access_mode,store_access_mode:body.storeAccessMode??target.store_access_mode})});
  await supabaseRest(`user_module_permissions?user_id=eq.${target.id}`,{method:"DELETE"});if(body.moduleAccessMode==="custom")await supabaseRest("user_module_permissions",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(ALL_PORTAL_MODULE_IDS.map(moduleId=>({user_id:target.id,module_id:moduleId,enabled:(body.enabledModules as string[]).includes(moduleId)})))});
  await supabaseRest(`user_store_access?user_id=eq.${target.id}`,{method:"DELETE"});if(body.storeAccessMode==="selected"&&body.storeIds?.length)await supabaseRest("user_store_access",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify((body.storeIds as string[]).map(storeId=>({user_id:target.id,store_id:storeId})))});
  return Response.json(await portalUsers(auth.membership.tenant_id));
}
