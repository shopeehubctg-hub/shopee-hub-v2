import {accountAdmin,accountJson,accountSaveError,loadRateCards} from '../../../../account-rate-cards';
import {supabaseRest} from '../../../../supabase-rest';
import {validatePlan,type FeePlanDraft} from '../../../../fee-plan-model';
import {malaysiaDate} from '../../../../account-ledger';
export const dynamic='force-dynamic';
export async function GET(){try{const auth=await accountAdmin();if('error'in auth)return auth.error;return Response.json({plans:await loadRateCards(auth.tenantId),available:true});}catch(error){return accountSaveError(error);}}
async function mutate(request:Request,archive:boolean){try{
 const auth=await accountAdmin(request,true);if('error'in auth)return auth.error;
 const body=await accountJson(request);
 if(typeof body.expectedVersion!=='number'||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw Error('ACCOUNT_INVALID: Refresh rate cards');
 if(archive){
  if(typeof body.id!=='string'||!body.id||body.id.length>120)throw Error('ACCOUNT_INVALID');
  await supabaseRest('rpc/account_archive_rate_card',{method:'POST',body:JSON.stringify({p_tenant:auth.tenantId,p_actor:auth.actor,p_card_id:body.id,p_expected_version:body.expectedVersion,p_request_id:body.requestId})});
 }else{
  let card:FeePlanDraft;try{card=validatePlan(body.card as FeePlanDraft);}catch{throw Error('ACCOUNT_INVALID: Check rate card fields');}
  if(card.effectiveMonth<malaysiaDate().slice(0,7))throw Error('ACCOUNT_PAST_MONTH');
  await supabaseRest('rpc/account_save_rate_card',{method:'POST',body:JSON.stringify({p_tenant:auth.tenantId,p_actor:auth.actor,p_card:card,p_expected_version:body.expectedVersion,p_request_id:body.requestId})});
 }
 return Response.json({saved:true,plans:await loadRateCards(auth.tenantId),available:true});
}catch(error){return accountSaveError(error);}}
export async function POST(request:Request){return mutate(request,false);}
export async function DELETE(request:Request){return mutate(request,true);}
