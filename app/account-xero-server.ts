import 'server-only';
import type {AccountResponse,AccountXeroStatus} from './account-contract';
import {buildAccountXeroProjection,type AccountXeroMappingVersion,type AccountXeroSnapshot} from './account-xero-model';
import {xeroActor} from './xero-server';
import {readXeroConnection,xeroRpc} from './xero-store';
export type BillingMappingRead={sourceRunId:string|null;lastSyncedAt?:string|null;snapshot?:AccountXeroSnapshot|null;mappings:Array<{contactId:string;categoryId:string;optionId:string;rosterKey:string;version:string;effectiveMonth:string;targetUnitVersion:string}>};
export async function decorateAccountXero(account:AccountResponse,request:Request):Promise<AccountResponse>{
 const empty:AccountXeroStatus={configured:false,connected:false,status:'not_configured',month:account.invoiceMonth,groups:[],unmappedInvoiceCount:0,unmappedTotals:[],totals:[],collections:[],outstanding:[]};
 try{
  const actor=await xeroActor(request,false,{allowUnconfiguredRead:true});
  if(actor instanceof Response){account.xero={...empty,status:'access_required'};return account;}
  if(!actor.config){account.xero=empty;return account;}
  const stored=await readXeroConnection(actor,actor.config);
  const connection=stored.connection;
  if(!connection){account.xero={...empty,configured:true,status:'not_connected'};return account;}
  const read=await xeroRpc<BillingMappingRead>(actor,'xero_billing_mappings_read',{p_environment:actor.config.environment,p_invoice_month:account.invoiceMonth+'-01'});
  const snapshot=read.snapshot?.month===account.invoiceMonth?read.snapshot:null;
  const mappings:AccountXeroMappingVersion[]=read.mappings.map(row=>({...row,unitKey:row.rosterKey,effectiveMonth:row.effectiveMonth.slice(0,7)}));
  const projection=buildAccountXeroProjection({rows:account.stores,snapshot,mappings,month:account.invoiceMonth,lastSyncedAt:read.lastSyncedAt??connection.lastSyncedAt});
  // Select one authoritative actuals source; never add Xero and the legacy ledger.
  for(const row of account.stores)row.xeroActuals=projection.byUnit[row.rosterKey??row.id];
  const report=snapshot?.report as (AccountXeroSnapshot['report']&Partial<Pick<AccountXeroStatus,'totals'|'collections'|'outstanding'>>)|undefined;
  account.xero={...empty,configured:true,connected:true,organisationName:connection.organisationName,
   status:!snapshot?'not_synced':projection.needsIdentitySync?'identity_sync_required':connection.status,
   lastSyncedAt:read.lastSyncedAt??connection.lastSyncedAt,lastError:connection.lastError,
   groups:projection.groups,targets:projection.targets,sourceRunId:read.sourceRunId,
   unmappedInvoiceCount:projection.unmappedInvoiceCount,unmappedTotals:projection.unmappedTotals,
   totals:report?.totals??[],collections:report?.collections??[],outstanding:report?.outstanding??[]};
 }catch{
  // A connection/mapping outage must not discard fee configuration or masquerade as zero income.
  account.xero={...empty,configured:true,status:'unavailable'};
 }
 return account;
}
