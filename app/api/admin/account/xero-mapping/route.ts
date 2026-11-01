import {GET as getAccount} from '../route';
import {xeroActor,xeroHeaders,xeroUnavailable} from '../../../../xero-server';
import {xeroRpc} from '../../../../xero-store';
import {supabaseRest} from '../../../../supabase-rest';
import type {AccountResponse} from '../../../../account-contract';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const version=/^\d{1,18}$/;
export async function POST(request:Request){
 try{
  const actor=await xeroActor(request,true);if(actor instanceof Response)return actor;if(!actor.config)return xeroUnavailable();
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'A JSON request is required.'},{status:400,headers:xeroHeaders});
  const raw=await request.text();if(raw.length>60000)return Response.json({error:'Choose fewer mappings at a time.'},{status:400,headers:xeroHeaders});
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid mapping request.'},{status:400,headers:xeroHeaders});}
  if(!body||Array.isArray(body)||typeof body!=='object'||typeof body.requestId!=='string'||!uuid.test(body.requestId)||!Array.isArray(body.mappings)||!body.mappings.length||body.mappings.length>100)return Response.json({error:'Choose billing clients before saving.'},{status:400,headers:xeroHeaders});
  const month=body.invoiceMonth??body.mappings[0]?.effectiveMonth;
  if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return Response.json({error:'Choose a valid invoice month.'},{status:400,headers:xeroHeaders});
  const seen=new Set<string>();
  for(const item of body.mappings){
   if(!item||typeof item!=='object'||Array.isArray(item)||!['contactId','categoryId','optionId'].every(key=>typeof item[key]==='string'&&uuid.test(item[key]))||typeof item.unitKey!=='string'||typeof item.expectedVersion!=='string'||!version.test(item.expectedVersion)||item.effectiveMonth!==month) return Response.json({error:'Check the billing client and invoice month.'},{status:400,headers:xeroHeaders});
   const key=JSON.stringify([item.contactId,item.categoryId,item.optionId]);if(seen.has(key))return Response.json({error:'Choose one billing client per source.'},{status:400,headers:xeroHeaders});seen.add(key);
  }
  // Replay is checked before current-version/source reads: a committed save advances both.
  // Only compare the caller's stable intent; the original server-owned source/target evidence
  // is passed back to the RPC, which revalidates the session and its exact saved payload.
  const intent=(bindings:Array<Record<string,unknown>>,stored=false)=>bindings.map(item=>({contactId:item.contactId,categoryId:item.categoryId,optionId:item.optionId,unitKey:stored?item.rosterKey:item.unitKey,effectiveMonth:month,expectedVersion:item.expectedVersion})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const replay=async():Promise<Response|null>=>{
   const prior=await supabaseRest<Array<{request_payload:Record<string,unknown>}>>(`account_store_requests?select=request_payload&tenant_id=eq.${encodeURIComponent(actor.tenantId)}&request_id=eq.${encodeURIComponent(body.requestId as string)}&limit=1`);
   if(!prior.length)return null;
   const saved=prior[0].request_payload;
   if(saved.mode!=='xero-billing-mappings'||saved.actor!==actor.actorEmail||saved.environment!==actor.config!.environment||saved.invoiceMonth!==month+'-01'||typeof saved.sourceRunId!=='string'||!uuid.test(saved.sourceRunId)||!Array.isArray(saved.bindings)||saved.bindings.length!==(body.mappings as unknown[]).length||JSON.stringify(intent(saved.bindings,true))!==JSON.stringify(intent(body.mappings as Array<Record<string,unknown>>)))return Response.json({error:'This save ID was already used for a different request.'},{status:409,headers:xeroHeaders});
   const result=await xeroRpc(actor,'xero_billing_mappings_save',{p_environment:actor.config!.environment,p_source_run_id:saved.sourceRunId,p_invoice_month:saved.invoiceMonth,p_bindings:saved.bindings,p_request_id:body.requestId});
   return Response.json({saved:true,result},{headers:xeroHeaders});
  };
  const replayed=await replay();if(replayed)return replayed;
  const url=new URL('/api/admin/account',request.url);url.searchParams.set('invoiceMonth',month);
  const response=await getAccount(new Request(url));if(!response.ok)return response;
  const account=await response.json() as AccountResponse;
  if(!account.xero?.connected||!account.xero.sourceRunId||account.xero.status==='identity_sync_required'||account.xero.status==='unavailable'){const raced=await replay();return raced??Response.json({error:'Sync accounting data before saving mappings.'},{status:409,headers:xeroHeaders});}
  const bindings=[];
  for(const item of body.mappings){
   const group=account.xero.groups.find(row=>row.contactId===item.contactId&&row.categoryId===item.categoryId&&row.optionId===item.optionId);
   const unit=account.stores.find(row=>(row.rosterKey??row.id)===item.unitKey);
   if(!group||!unit||!unit.market||!unit.entity||group.expectedVersion!==item.expectedVersion){const raced=await replay();return raced??Response.json({error:'Account changed. Refresh and check the mapping.'},{status:409,headers:xeroHeaders});}
   const liveIds=new Set((account.storeOptions??[]).map(store=>store.id));
   const candidates=[...new Set((unit.candidates??[]).flatMap(candidate=>candidate.storeId&&liveIds.has(candidate.storeId)?[candidate.storeId]:[]))];
   const storeId=unit.storeId?(liveIds.has(unit.storeId)?unit.storeId:null):candidates.length===1?candidates[0]:null;
   if(!storeId){const raced=await replay();return raced??Response.json({error:'Store mapping required. Choose a store for this billing client first.'},{status:409,headers:xeroHeaders});}
   bindings.push({contactId:item.contactId,categoryId:item.categoryId,optionId:item.optionId,rosterKey:item.unitKey,expectedVersion:item.expectedVersion,targetExpectedVersion:unit.latestSettingsVersion??'0',targetSeed:{project:unit.project,entity:unit.entity,currency:unit.currency,market:unit.market,storeId}});
  }
  const result=await xeroRpc(actor,'xero_billing_mappings_save',{p_environment:actor.config.environment,p_source_run_id:account.xero.sourceRunId,p_invoice_month:month+'-01',p_bindings:bindings,p_request_id:body.requestId});
  return Response.json({saved:true,result},{headers:xeroHeaders});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  if(/VERSION_CONFLICT|REQUEST_CONFLICT|SOURCE_CHANGED|SNAPSHOT_CHANGED|SOURCE_STALE|TARGET_CONFLICT/.test(code))return Response.json({error:'Account changed. Refresh and try again.'},{status:409,headers:xeroHeaders});
  if(/ACCESS_DENIED|SESSION|STEPUP/.test(code))return Response.json({error:'Unlock Account to continue.'},{status:403,headers:xeroHeaders});
  if(/INVALID|MAPPING_CONFLICT|MAPPING_DUPLICATE|STORE_DENIED|STORE_REQUIRED|TARGET_REQUIRED/.test(code))return Response.json({error:'Check the selected billing clients and try again.'},{status:400,headers:xeroHeaders});
  return Response.json({error:'Unable to save mappings. No partial changes were saved.'},{status:503,headers:xeroHeaders});
 }
}
