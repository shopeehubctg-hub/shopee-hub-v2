import 'server-only';
import roster from './account-roster-data.json';
import { getChatGPTUser } from './chatgpt-auth';
import { supabaseRest } from './supabase-rest';
import { canonicalStoreId } from './live-calendar-model';
import { malaysiaDate } from './account-ledger';
import { validateFeeRule } from './account-settings-model';
export async function saveAccountSetting(request:Request,action:'mapping'|'fee_rule'):Promise<Response> {
  const actor=await getChatGPTUser();
  if(!actor)return Response.json({error:'Authentication required'},{status:401});
  try {
    const members=await supabaseRest<Array<{tenant_id:string;active:boolean;role:string}>>(`customer_users?select=tenant_id,active,role&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
    const member=members[0];
    if(!member?.active||member.role!=='superadmin')return Response.json({error:'Super Admin access required'},{status:403});
    const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
    if(!tenants[0]?.active||member.tenant_id!==roster.tenantId)return Response.json({error:'Account access required'},{status:403});
    if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Reload the Dashboard before saving'},{status:403});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'A JSON request is required'},{status:400});
    const raw=await request.text();if(raw.length>20000)return Response.json({error:'Fee rule is too large'},{status:400});
    let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid save request'},{status:400});}
    if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Invalid save request'},{status:400});
    const unit=roster.rows.find(row=>row.id===body.rosterKey);
    if(!unit)return Response.json({error:'Choose a valid billing project'},{status:400});
    if(typeof body.effectiveMonth!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.effectiveMonth)||body.effectiveMonth<malaysiaDate().slice(0,7))return Response.json({error:'Choose the current or a future invoice month'},{status:400});
    if(typeof body.expectedVersion!=='string'||!/^\d{1,18}$/.test(body.expectedVersion))return Response.json({error:'Refresh the Account before saving'},{status:400});
    if(typeof body.requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))return Response.json({error:'A unique save ID is required'},{status:400});
    let storeId:string|null=null;let rule=null;
    if(action==='mapping') {
      if(typeof body.storeId!=='string'||canonicalStoreId(body.storeId)!==body.storeId)return Response.json({error:'Choose a store from the Store Selector'},{status:400});
      const stores=await supabaseRest<Array<{id:string}>>(`stores?select=id&tenant_id=eq.${encodeURIComponent(member.tenant_id)}&id=eq.${encodeURIComponent(body.storeId)}&limit=1`);
      if(!stores[0])return Response.json({error:'Choose a store from the Store Selector'},{status:400});storeId=stores[0].id;
    } else {
      try{rule=validateFeeRule(body.rule,unit.market==='MY'?'MYR':'SGD');}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid fee rule'},{status:400});}
    }
    const result=await supabaseRest<{version:string}>('rpc/account_save_billing_unit_version',{method:'POST',body:JSON.stringify({
      p_tenant:member.tenant_id,p_actor:actor.email.toLowerCase(),p_roster_key:unit.id,p_roster_project:unit.project,p_entity:unit.entity,
      p_currency:unit.market==='MY'?'MYR':'SGD',p_effective_month:`${body.effectiveMonth}-01`,p_action:action,p_store_id:storeId,p_rule:rule,
      p_expected_version:body.expectedVersion,p_request_id:body.requestId,
    })});
    return Response.json({saved:true,version:result.version});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(/ACCOUNT_VERSION_CONFLICT|ACCOUNT_REQUEST_CONFLICT/.test(message))return Response.json({error:'This project changed. Refresh Account and try again.'},{status:409});
    if(/ACCOUNT_INVALID|ACCOUNT_PAST_MONTH/.test(message))return Response.json({error:'Check the store, fee rule and effective month.'},{status:400});
    if(/ACCOUNT_ACCESS_DENIED/.test(message))return Response.json({error:'Super Admin access required'},{status:403});
    if(/"code":"(PGRST202|PGRST205|42P01)"/.test(message))return Response.json({error:'Account saving is not configured in this environment.'},{status:503});
    return Response.json({error:'Unable to save Account. Please try again.'},{status:503});
  }
}
