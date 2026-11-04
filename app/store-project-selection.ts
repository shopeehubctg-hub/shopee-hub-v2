import {marketFromPlatform,type MarketCode} from './markets';
export type ProjectStore={id:string;name:string;serviceStatus:string};
export type StoreProject={id:string;name:string;version:string;markets:Array<{market:MarketCode;state:'configured'|'pending'|'inactive'|'ended';enabled?:boolean;stores:ProjectStore[]}>};
export function projectSelection(projects:StoreProject[],stores:Array<{id:string;name:string;platform:string}>,storeId:string){
 const authorized=new Set(stores.map(store=>store.id));const grouped=new Set(projects.flatMap(project=>project.markets.flatMap(market=>market.stores.map(store=>store.id))));
 const visible=projects.map(project=>({...project,markets:project.markets.filter(market=>market.enabled!==false).map(market=>({...market,stores:market.stores.filter(store=>authorized.has(store.id)&&store.serviceStatus!=='ended')})).filter(market=>market.stores.length)})).filter(project=>project.markets.length);
 for(const project of visible)for(const market of project.markets)for(const store of market.stores)grouped.add(store.id);
 for(const store of stores)if(!grouped.has(store.id)){
  // A configured Ended store must not reappear through the legacy fallback.
  if(projects.some(project=>project.markets.some(market=>market.stores.some(child=>child.id===store.id&&child.serviceStatus==='ended'))))continue;
  visible.push({id:`store:${store.id}`,name:store.name,version:'0',markets:[{market:marketFromPlatform(store.platform),state:'configured',stores:[{id:store.id,name:store.name,serviceStatus:'active'}]}]});
 }
 const selected=visible.find(project=>project.markets.some(market=>market.stores.some(store=>store.id===storeId)));
 return {projects:visible.sort((a,b)=>a.name.localeCompare(b.name)),selectedProjectId:selected?.id??'',selectedMarket:selected?.markets.find(market=>market.stores.some(store=>store.id===storeId))?.market??null};
}
