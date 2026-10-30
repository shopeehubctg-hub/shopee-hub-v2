import roster from './account-roster-data.json';
import {accountSelectorCandidates} from './account-selector';
import {canonicalStoreId} from './live-calendar-model';
import type {MarketCode} from './markets';
export type SourceStore={id:string;tenant_id:string;name:string;display_name?:string|null;bigseller_name?:string|null;platform:string};
type Directory={store_id:string;store_name:string;tenant_id:string};
const normalize=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('en');
/** Identity only. Reads current labels; does not confirm invoice allocation or mutate source facts. */
export function sourceStoreResolver(tenantId:string,registry:SourceStore[],directory:Directory[]=[]){
 const canonical=registry.filter(store=>canonicalStoreId(store.id)===store.id);
 const names=new Map(canonical.filter(store=>store.tenant_id===tenantId).map(store=>[store.id,store.display_name??store.name]));
 const aliases=new Map<string,Set<string>>();
 const add=(alias:unknown,id:string)=>{if(typeof alias!=='string'||!alias.trim())return;const key=normalize(alias);const ids=aliases.get(key)??new Set<string>();ids.add(id);aliases.set(key,ids);};
 for(const store of canonical){for(const alias of [store.name,store.display_name,store.bigseller_name])add(alias,store.id);}
 for(const row of directory)if(canonical.some(store=>store.id===row.store_id&&store.tenant_id===row.tenant_id))add(row.store_name,row.store_id);
 if(tenantId===roster.tenantId)for(const row of roster.rows){
  const resolved=accountSelectorCandidates(row.candidates,row.market as MarketCode,names);
  resolved.forEach((candidate,index)=>{if(candidate.storeId){add(candidate.username,candidate.storeId);add(row.candidates[index]?.storeName,candidate.storeId);}});
 }
 return (sourceName:string):SourceStore|null=>{const ids=aliases.get(normalize(sourceName));if(ids?.size!==1)return null;return canonical.find(store=>store.id===[...ids][0]&&store.tenant_id===tenantId)??null;};
}
