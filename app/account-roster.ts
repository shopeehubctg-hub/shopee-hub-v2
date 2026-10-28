import {canonicalStoreId} from './live-calendar-model';
import {MARKET_CONFIG,marketFromPlatform} from './markets';
import 'server-only';
import snapshotData from './account-roster-data.json';
import { accountSelectorCandidates } from './account-selector';
import { emptyAccount } from './account-ledger';
import type { AccountMappingCandidate, AccountResponse } from './account-contract';
export type AccountRosterSnapshot = {
  tenantId:string; invoiceMonth:string; statementMonth:string; generatedAt:string;
  rows:Array<{id:string;entity:string;market:'MY'|'SG';project:string;termsVersion:'NEW'|'OLD';
    mappingStatus:'resolved'|'candidate'|'ambiguous'|'missing';mappingReason:string;
    candidates:AccountMappingCandidate[];sourceRow:number}>;
};
/** Audited October roster only. This is neither a fee ledger nor a live Sheet synchronisation. */
export function accountRosterFallback(tenantId:string,invoiceMonth:string,today:string,storeNames:Map<string,string>,snapshot:AccountRosterSnapshot=snapshotData as AccountRosterSnapshot):AccountResponse|null {
  // A caller's membership must match the audited dataset tenant; never use their requested tenant.
  if(!snapshot.tenantId||snapshot.tenantId!==tenantId||snapshot.invoiceMonth!==invoiceMonth||invoiceMonth!=='2026-10'||snapshot.statementMonth!=='2026-09') return null;
  const account=emptyAccount(invoiceMonth,today,'not_configured');
  account.statementMonth=snapshot.statementMonth;
  account.rosterUpdatedAt=snapshot.generatedAt;
  const seen=new Set<string>();
  account.stores=snapshot.rows.map(row=>{
    if(seen.has(row.id)||!['MY','SG'].includes(row.market)||!['NEW','OLD'].includes(row.termsVersion)) throw new Error('Invalid Account roster snapshot');
    seen.add(row.id);
    const resolved=row.mappingStatus==='resolved'&&row.candidates.length===1&&row.candidates[0].storeId&&storeNames.has(row.candidates[0].storeId);
    const candidate=resolved?row.candidates[0]:null;
    const mappingStatus=row.mappingStatus==='resolved'&&!resolved?'missing':row.mappingStatus;
    return {id:row.id,rosterKey:row.id,storeId:candidate?.storeId??null,storeName:candidate?.storeId?(storeNames.get(candidate.storeId)??row.project):row.project,
      project:row.project,entity:row.entity,market:row.market,termsVersion:row.termsVersion,
      mappingStatus,mappingReason:row.mappingStatus==='resolved'&&!resolved?'Dashboard store mapping requires verification':row.mappingReason,
      candidates:accountSelectorCandidates(row.candidates,row.market,storeNames),salesCurrency:MARKET_CONFIG[row.market].currency,currency:row.market==='MY'?'MYR' as const:'SGD' as const,
      statementMonth:snapshot.statementMonth,invoiceMonth,servicePeriodStart:null,servicePeriodEnd:null,
      status:resolved?'pending_source' as const:'pending_mapping' as const,
      expectedNetFee:null,billed:null,collected:null,outstanding:null};
  });
  for(const summary of account.summaries) summary.pendingStores=account.stores.filter(row=>row.currency===summary.currency).length;
  return account;
}

/** Match only the audited roster key; names, aliases and historical candidates never bind cash. */
export function mergeAccountRoster(account:AccountResponse,roster:AccountResponse|null):AccountResponse {
  if(!roster) return account;
  const represented=new Set(account.stores.flatMap(row=>row.rosterKey?[row.rosterKey]:[]));
  account.stores.push(...roster.stores.filter(row=>!represented.has(row.rosterKey!)));
  account.rosterUpdatedAt=roster.rosterUpdatedAt;
  for(const summary of account.summaries) {
    summary.pendingStores=account.stores.filter(row=>row.currency===summary.currency&&row.expectedNetFee===null).length;
    if(summary.pendingStores) summary.expectedNetFee=null;
  }
  return account;
}

// Generic legacy platforms such as 'Shopee' contain no country evidence.
function explicitStoreMarket(platform:string){return /\b(?:MY|SG|TH|PH|Malaysia|Singapore|Thailand|Philippines)\b/i.test(platform)?marketFromPlatform(platform):undefined;}
export type AccountTenantStore={id:string;name:string;display_name:string|null;platform:string};
/** Input is already restricted to the authenticated tenant. Physical stores add pending rows, never financial records. */
export function appendAccountMarketStores(account:AccountResponse,tenantStores:AccountTenantStore[]):AccountResponse{
 const stores=[...new Map(tenantStores.filter(store=>canonicalStoreId(store.id)===store.id).map(store=>[store.id,store])).values()];
 for(const row of account.stores){
  delete row.previewMarketFxEligible;
  const store=stores.find(item=>item.id===row.storeId||row.rosterKey===`store:${item.id}`);
  const market=store?explicitStoreMarket(store.platform):undefined;
  if(market){row.market=market;row.salesCurrency=MARKET_CONFIG[market].currency;row.previewMarketFxEligible=market==='TH'||market==='PH';}
  else if(store){
    // Keep audited country/sales metadata; ledger currency is not store-country proof.
    if(!row.market&&(row.currency==='MYR'||row.currency==='SGD'))row.market=row.currency==='SGD'?'SG':'MY';
    if(!row.salesCurrency&&(row.market==='MY'||row.market==='SG'))row.salesCurrency=MARKET_CONFIG[row.market].currency;
  }
 }
 for(const store of stores){
  const market=explicitStoreMarket(store.platform);if(market!=='TH'&&market!=='PH')continue;
  const key=`store:${store.id}`;
  if(account.stores.some(row=>row.storeId===store.id||row.rosterKey===key))continue;
  account.stores.push({id:key,rosterKey:key,storeId:store.id,storeName:store.display_name??store.name,project:store.display_name??store.name,market,currency:MARKET_CONFIG[market].currency,salesCurrency:MARKET_CONFIG[market].currency,previewMarketFxEligible:true,statementMonth:account.statementMonth,invoiceMonth:account.invoiceMonth,servicePeriodStart:null,servicePeriodEnd:null,status:'pending_terms',mappingStatus:'resolved',candidates:[{mappingId:'',username:'',storeId:store.id,storeName:store.display_name??store.name}],expectedNetFee:null,billed:null,collected:null,outstanding:null});
 }
 for(const summary of account.summaries){summary.pendingStores=account.stores.filter(row=>row.currency===summary.currency&&row.expectedNetFee===null).length;if(summary.pendingStores)summary.expectedNetFee=null;}
 return account;
}
