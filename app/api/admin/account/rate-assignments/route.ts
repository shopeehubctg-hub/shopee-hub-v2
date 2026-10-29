import {accountAdmin,accountJson,accountSaveError,loadRateCards} from '../../../../account-rate-cards';
import {supabaseRest} from '../../../../supabase-rest';
import {malaysiaDate} from '../../../../account-ledger';
import {projectSalesCurrency,sourceProjectRate,projectFeeCurrency} from '../../../../fee-preview-currency';
import {rateSourceForTenant} from '../../../../fee-preview-source.server';
import type {AccountResponse} from '../../../../account-contract';
import {GET as getAccount} from '../route';
export const dynamic='force-dynamic';
export async function PUT(request:Request){try{
 const auth=await accountAdmin(request,true);if('error'in auth)return auth.error;
 const body=await accountJson(request);
 if(!Array.isArray(body.unitKeys)||!body.unitKeys.length||body.unitKeys.length>100||!body.unitKeys.every(key=>typeof key==='string')||new Set(body.unitKeys).size!==body.unitKeys.length)throw Error('ACCOUNT_INVALID');
 if(typeof body.effectiveMonth!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.effectiveMonth)||body.effectiveMonth<malaysiaDate().slice(0,7))throw Error('ACCOUNT_PAST_MONTH');
 if(typeof body.planId!=='string'||!body.planId||typeof body.planVersion!=='number'||!Number.isSafeInteger(body.planVersion)||body.planVersion<1)throw Error('ACCOUNT_INVALID');
 if(!body.expectedVersions||typeof body.expectedVersions!=='object'||Array.isArray(body.expectedVersions))throw Error('ACCOUNT_INVALID');
 const expected=body.expectedVersions as Record<string,unknown>;
 const snapshot=await getAccount(new Request(`${new URL(request.url).origin}/api/admin/account?invoiceMonth=${body.effectiveMonth}`));
 if(!snapshot.ok)return snapshot;
 const account=await snapshot.json() as AccountResponse;
 if(!account.settingsAvailable)throw Error('Supabase REST: {"code":"PGRST205"}');
 const catalog=await loadRateCards(auth.tenantId);
 const defaults=rateSourceForTenant(auth.tenantId);
 // Historical versions remain readable for idempotent retries after archive/revision.
 // The RPC checks active/month-effective state only after its request replay lookup.
 const card=catalog.find(item=>item.id===body.planId&&item.version===body.planVersion);
 if(!card)throw Error('ACCOUNT_INVALID');
 const units=body.unitKeys.map(key=>{
  const row=account.stores.find(item=>(item.rosterKey??item.id)===key);
  if(!row||typeof expected[key]!=='string'||!/^\d{1,18}$/.test(expected[key] as string))throw Error('ACCOUNT_INVALID');
  const source=sourceProjectRate(row,body.effectiveMonth as string,defaults);
  const clientType=row.clientType??source?.clientType;
  if(clientType&&clientType!==card.clientType||card.currency!==projectFeeCurrency(row,body.effectiveMonth as string,defaults))throw Error('ACCOUNT_INVALID');
  const inputCurrency=projectSalesCurrency(row);const currency=projectFeeCurrency(row,body.effectiveMonth as string,defaults);
  const storedFxRate=row.fxRate??source?.fxRate;
  const fixedRate=storedFxRate?.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  const fxPolicy=row.fxPolicy??(row.market==='TH'||row.market==='PH'?'bnm-service-average':source?.fxPolicy??'none');
  if(inputCurrency!==currency&&fxPolicy==='none')throw Error('ACCOUNT_INVALID: Set an exchange-rate policy first');
  return {rosterKey:key,project:row.project||row.storeName,legalEntity:row.entity||row.project||row.storeName,currency:row.currency,storeId:row.storeId,expectedVersion:expected[key],market:row.market,inputCurrency,fxPolicy,...(fxPolicy==='fixed'?{fxRate:fixedRate}:{})};
 });
 const result=await supabaseRest('rpc/account_assign_rate_card',{method:'POST',body:JSON.stringify({p_tenant:auth.tenantId,p_actor:auth.actor,p_units:units,p_card_id:body.planId,p_card_version:body.planVersion,p_effective_month:`${body.effectiveMonth}-01`,p_request_id:body.requestId})});
 return Response.json({saved:true,...result as object});
}catch(error){return accountSaveError(error);}}
