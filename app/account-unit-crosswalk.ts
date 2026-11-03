import type {AccountResponse,AccountStoreRow} from './account-contract';
import type {AccountSetting} from './account-settings-model';
/** Audited identities only. Labels and shared physical stores never establish a billing identity. */
export const ACCOUNT_UNIT_CROSSWALK:Readonly<Record<string,string>>={
 'roster-2026-10-sg-3':'store:shopee-bonlife-singapore',
 'roster-2026-10-sg-4':'store:shopee-drsmile-whitening-sg-by-ctg4u',
 'roster-2026-10-sg-5':'store:shopee-naturelish-goherb-sg',
 'roster-2026-10-sg-10':'store:shopee-moesie-singapore',
 'roster-2026-10-sg-12':'store:shopee-scale-story-sg-by-ctg4u',
 'roster-2026-10-sg-14':'store:shopee-zeero-skincare-sg-by-ctg4u',
};
const sourceClientLabels:Readonly<Record<string,string>>={'roster-2026-10-sg-3':'BONLIFE SG','roster-2026-10-sg-4':'DRSMILE SG','roster-2026-10-sg-5':'GOHERB SG','roster-2026-10-sg-10':'MOESIE SG','roster-2026-10-sg-12':'SCALE STORY SG','roster-2026-10-sg-14':'ZEERO SKINCARE'};
/** Settings are already restricted to this authenticated tenant. No ledger records or stored keys are rewritten. */
export function projectAccountUnitCrosswalk(account:AccountResponse,settings:AccountSetting[],storeNames:Map<string,string>,tenantId:string):AccountResponse{
 if(tenantId!=='j-packaging'||account.invoiceMonth<'2026-11')return account;
 const configurationOnly=(row:AccountStoreRow)=>row.id===(row.rosterKey??row.id);
 for(const [source,canonical] of Object.entries(ACCOUNT_UNIT_CROSSWALK)){
  if(account.stores.some(row=>row.sourceRosterKey===source&&row.rosterKey===canonical))continue;
  const sourceRows=account.stores.filter(row=>row.rosterKey===source),canonicalRows=account.stores.filter(row=>row.rosterKey===canonical);
  if(sourceRows.length>1||canonicalRows.length>1||sourceRows.some(row=>!configurationOnly(row))||canonicalRows.some(row=>!configurationOnly(row)))continue;
  const row=sourceRows[0]??canonicalRows[0];if(!row)continue;
  const history=settings.filter(setting=>setting.roster_key===canonical&&setting.effective_month.slice(0,7)<=account.invoiceMonth).sort((a,b)=>a.effective_month.localeCompare(b.effective_month)||(BigInt(a.version)<BigInt(b.version)?-1:1));
  const current=history.at(-1),storeId=canonical.slice(6);
  if(!current||current.store_id!==storeId||current.market!=='SG'||!storeNames.has(storeId))continue;
  // Even accidental duplicate configuration with monetary evidence must remain visible for audit.
  if([row,...canonicalRows].some(item=>[item.billed,item.collected,item.outstanding,item.expectedNetFee].some(value=>value!==null&&value!==undefined)))continue;
  // Only canonical name history may populate the merged view; source Billing is not a fallback.
  row.entity='';row.billingEntity=null;
  if(!sourceRows.length)row.project=sourceClientLabels[source];
  row.sourceRosterKey=source;row.canonicalUnitKey=canonical;row.id=canonical;row.rosterKey=canonical;row.currency=current.currency;
  account.stores=account.stores.filter(item=>item===row||item.rosterKey!==canonical);
 }
 return account;
}
