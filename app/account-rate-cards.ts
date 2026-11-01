import 'server-only';
import {getChatGPTUser} from './chatgpt-auth';
import {accountSecurityGate} from './account-security-server';
import {supabaseRest} from './supabase-rest';
import {validatePlan,type FeePlan} from './fee-plan-model';

type CardRow={card_id:string;version:string|number;name:string;client_type:FeePlan['clientType'];currency:FeePlan['currency'];effective_month:string;fee_rule:FeePlan['rule'];archived_at:string|null};
export async function accountAdmin(request?:Request,write=false){
 const gate=await accountSecurityGate();if(gate)return {error:gate};
 const actor=await getChatGPTUser();if(!actor)return {error:Response.json({error:'Authentication required'},{status:401})};
 const members=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
 const member=members[0];if(!member?.active||member.role!=='superadmin')return {error:Response.json({error:'Super Admin access required'},{status:403})};
 const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
 if(!tenants[0]?.active)return {error:Response.json({error:'Active tenant access required'},{status:403})};
 if(write&&(!request||request.headers.get('origin')!==new URL(request.url).origin))return {error:Response.json({error:'Reload the Dashboard before saving'},{status:403})};
 return {tenantId:member.tenant_id,actor:actor.email.toLowerCase()};
}
export async function accountJson(request:Request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('ACCOUNT_INVALID: A JSON request is required');
 const raw=await request.text();if(raw.length>60000)throw Error('ACCOUNT_INVALID: Request is too large');
 let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{throw Error('ACCOUNT_INVALID: Invalid request');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('ACCOUNT_INVALID: Invalid request');
 if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))throw Error('ACCOUNT_INVALID: A unique save ID is required');
 return body;
}
export function accountSaveError(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(/VERSION_CONFLICT|REQUEST_CONFLICT|CARD_STALE|CARD_ARCHIVED/.test(message))return Response.json({error:'This rate card or record changed. Refresh and try again.'},{status:409});
 if(/ACCESS_DENIED/.test(message))return Response.json({error:'Super Admin access required'},{status:403});
 if(/ACCOUNT_INVALID|ACCOUNT_PAST_MONTH|CARD_INVALID|ACCOUNT_LOCKED/.test(message))return Response.json({error:'Check the rate card, selected records and effective Invoice Month.'},{status:400});
 if(/"code":"(PGRST202|PGRST204|PGRST205|42P01|42883|42703)"/.test(message))return Response.json({error:'Account saving is unavailable. No partial changes were saved.'},{status:503});
 return Response.json({error:'Unable to save Account. Please try again.'},{status:503});
}
export async function loadRateCards(tenantId:string):Promise<FeePlan[]>{
 const rows=await supabaseRest<CardRow[]>(`account_rate_card_versions?select=card_id,version::text,name,client_type,currency,effective_month,fee_rule,archived_at&tenant_id=eq.${encodeURIComponent(tenantId)}&order=version.asc`);
 const archived=new Map(rows.filter(row=>row.archived_at).map(row=>[row.card_id,row.archived_at!]));
 return rows.map(row=>{
  const version=Number(row.version);if(!Number.isSafeInteger(version)||version<1)throw Error('Invalid stored rate card version');
  return {...validatePlan({id:row.card_id,name:row.name,clientType:row.client_type,currency:row.currency,effectiveMonth:row.effective_month.slice(0,7),rule:row.fee_rule}),version,...(archived.has(row.card_id)?{archivedAt:archived.get(row.card_id)}:{})};
 });
}
