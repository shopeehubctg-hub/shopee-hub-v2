import { permissionManagement } from "../../../permission-management";
import { ALL_PORTAL_MODULE_IDS, isPortalModuleId } from "../../../module-permissions";
import { supabaseRest } from "../../../supabase-rest";

export const dynamic="force-dynamic";
async function requireSuperAdmin(request?:Request){const auth=await permissionManagement(request);if("error"in auth)return auth;if(!auth.isSuperAdmin)return{error:Response.json({error:"Super Admin access required"},{status:403})};return{membership:auth.member,user:{email:auth.actor}};}

export async function GET(){const auth=await requireSuperAdmin();if("error"in auth)return auth.error;const rows=await supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${encodeURIComponent(auth.membership.tenant_id)}`);const configured=new Map(rows.map(row=>[row.module_id,row.enabled]));return Response.json({enabledModules:ALL_PORTAL_MODULE_IDS.filter(id=>id==="live_calendar"?configured.get(id)===true:configured.get(id)!==false)});}

export async function PATCH(request:Request){const auth=await requireSuperAdmin(request);if("error"in auth)return auth.error;const body=await request.json().catch(()=>null)as{enabledModules?:unknown[]}|null;if(!body||!Array.isArray(body.enabledModules)||!body.enabledModules.every(isPortalModuleId))return Response.json({error:"enabledModules must contain valid portal module IDs"},{status:400});const enabled=new Set(body.enabledModules);await supabaseRest("tenant_module_permissions",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(ALL_PORTAL_MODULE_IDS.map(moduleId=>({tenant_id:auth.membership.tenant_id,module_id:moduleId,enabled:enabled.has(moduleId),updated_by:auth.user.email,updated_at:new Date().toISOString()})))});return Response.json({enabledModules:ALL_PORTAL_MODULE_IDS.filter(id=>enabled.has(id))});}
