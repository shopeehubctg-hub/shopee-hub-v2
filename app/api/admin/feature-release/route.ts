import {isReleasablePermissionId} from '../../../module-permissions';
import {permissionManagement,permissionSaveError} from '../../../permission-management';
import {supabaseRest} from '../../../supabase-rest';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 try{
  const auth=await permissionManagement(request);if('error'in auth)return auth.error;
  if(!auth.isSuperAdmin)return Response.json({error:'Super Admin access required'},{status:403});
  const body=await request.json().catch(()=>null)as{moduleId?:unknown;requestId?:unknown}|null;
  if(!body||!isReleasablePermissionId(body.moduleId)||typeof body.requestId!=='string'||!uuid.test(body.requestId))return Response.json({error:'Choose a valid feature release'},{status:400});
  const result=await supabaseRest<{granted:number;skipped:number;alreadyEnabled:number}>('rpc/grant_feature_to_all',{method:'POST',body:JSON.stringify({p_tenant:auth.member.tenant_id,p_actor:auth.actor,p_module:body.moduleId,p_request_id:body.requestId})});
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return permissionSaveError(error);}
}
