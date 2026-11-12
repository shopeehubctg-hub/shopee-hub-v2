import {isReleasablePermissionId} from '../../../module-permissions';
import {permissionManagement,permissionSaveError} from '../../../permission-management';
import {supabaseRest} from '../../../supabase-rest';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 try{
  const auth=await permissionManagement(request);if('error'in auth)return auth.error;
  if(!auth.isSuperAdmin)return Response.json({error:'Super Admin access required'},{status:403});
  const body=await request.json().catch(()=>null)as{moduleId?:unknown;requestId?:unknown;action?:unknown;users?:unknown}|null;
  if(!body||!isReleasablePermissionId(body.moduleId)||typeof body.requestId!=='string'||!uuid.test(body.requestId))return Response.json({error:'Choose a valid feature release'},{status:400});
  if ('action' in body || 'users' in body) {
    if ((body.action !== 'grant' && body.action !== 'revoke') ||
      !Array.isArray(body.users) || body.users.length < 1 || body.users.length > 1000 ||
      body.users.some(user => !user || !Number.isSafeInteger(user.id) || user.id < 1 ||
        !Number.isSafeInteger(user.version) || user.version < 0) ||
      new Set(body.users.map(user => user.id)).size !== body.users.length) {
      return Response.json({ error: 'Choose valid users and an access action' }, { status: 400 });
    }
    const users = body.users.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id - b.id);
    const result = await supabaseRest('rpc/change_selected_feature_access', {
      method: 'POST',
      body: JSON.stringify({ p_tenant: auth.member.tenant_id, p_actor: auth.actor, p_module: body.moduleId,
        p_action: body.action, p_users: users, p_request_id: body.requestId }),
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const result=await supabaseRest<{granted:number;skipped:number;alreadyEnabled:number}>('rpc/grant_feature_to_all',{method:'POST',body:JSON.stringify({p_tenant:auth.member.tenant_id,p_actor:auth.actor,p_module:body.moduleId,p_request_id:body.requestId})});
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return permissionSaveError(error);}
}
