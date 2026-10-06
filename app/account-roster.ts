import 'server-only';
import snapshotData from './account-roster-data.json';
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
      candidates:row.candidates.map(c=>({mappingId:c.mappingId,username:c.username,storeId:c.storeId,storeName:c.storeName})),currency:row.market==='MY'?'MYR' as const:'SGD' as const,
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
