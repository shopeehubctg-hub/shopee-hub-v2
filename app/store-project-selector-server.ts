import 'server-only';
import {getChatGPTUser} from './chatgpt-auth';
import {supabaseRest} from './supabase-rest';
import {canonicalStoreId} from './live-calendar-model';
import type {MarketCode} from './markets';
import type {StoreProject} from './store-project-selection';

type SelectorStore={id:string;name:string;display_name:string|null;platform:string};
// Reviewed selector relationship only. This is not a Store, billing-unit or access migration.
const reviewedProjects=[{tenant:'j-packaging',id:'project:skindae',name:'SkinDae',stores:[{id:'shopee-skindae-my-by-ctg4u',market:'MY'},{id:'shopee-skindae-sg',market:'SG'}]}] as const;
const headers={'Cache-Control':'private, no-store'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
function storeMarket(platform:string):MarketCode|null{return platform==='Shopee'?'MY':platform==='Shopee MY'?'MY':platform==='Shopee SG'?'SG':platform==='Shopee TH'?'TH':platform==='Shopee PH'?'PH':null;}
export function projectSelectorProjection(tenant:string,registry:SelectorStore[],scope:string[]):{projects:StoreProject[];allowedStoreIds:string[]}{
 if(!Array.isArray(scope)||scope.length>2000||scope.some(id=>typeof id!=='string'||!id||canonicalStoreId(id)!==id)||new Set(scope).size!==scope.length)throw Error('Invalid store scope');
 const allowed=new Set(scope),stores=registry.filter(store=>canonicalStoreId(store.id)===store.id&&allowed.has(store.id)&&storeMarket(store.platform)!==null);
 if(new Set(stores.map(store=>store.id)).size!==stores.length)throw Error('Invalid store registry');
 const byId=new Map(stores.map(store=>[store.id,store])),grouped=new Set<string>(),projects:StoreProject[]=[];
 for(const spec of reviewedProjects.filter(spec=>spec.tenant===tenant)){
  const markets:StoreProject['markets']=[];
  for(const identity of spec.stores){const store=byId.get(identity.id);if(!store||storeMarket(store.platform)!==identity.market)continue;grouped.add(store.id);markets.push({market:identity.market,state:'configured',stores:[{id:store.id,name:store.display_name??store.name,serviceStatus:'active'}]});}
  if(markets.length)projects.push({id:spec.id,name:spec.name,version:'0',markets});
 }
 for(const store of stores.filter(store=>!grouped.has(store.id)))projects.push({id:`store:${store.id}`,name:store.display_name??store.name,version:'0',markets:[{market:storeMarket(store.platform)!,state:'configured',stores:[{id:store.id,name:store.display_name??store.name,serviceStatus:'active'}]}]});
 return {projects:projects.sort((a,b)=>a.name.localeCompare(b.name)),allowedStoreIds:stores.map(store=>store.id)};
}
export async function getProjectSelector():Promise<Response>{
 try{
  const actor=await getChatGPTUser();if(!actor)return reply({error:'Authentication required.'},401);
  const [member]=await supabaseRest<Array<{id:number;tenant_id:string;active:boolean}>>(`customer_users?select=id,tenant_id,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  if(member?.active!==true||!Number.isSafeInteger(member.id)||!member.tenant_id)return reply({error:'Store access required.'},403);
  const [tenant]=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);
  if(tenant?.active!==true)return reply({error:'Store access required.'},403);
  // Existing deployed RPC is read-only but does not check actor/tenant active: those checks above are mandatory.
  const scope=await supabaseRest<string[]>('rpc/permission_effective_stores',{method:'POST',body:JSON.stringify({p_tenant:member.tenant_id,p_user_id:member.id})});
  const registry:SelectorStore[]=[];
  for(let offset=0;offset<2000;offset+=500){const page=await supabaseRest<SelectorStore[]>(`stores?select=id,name,display_name,platform&tenant_id=eq.${encodeURIComponent(member.tenant_id)}&order=id.asc&limit=500&offset=${offset}`);registry.push(...page);if(page.length<500)return reply(projectSelectorProjection(member.tenant_id,registry,scope));}
  return reply({error:'Project selector is unavailable.'},503);
 }catch{return reply({error:'Project selector is unavailable. Refresh and try again.'},503);}
}
