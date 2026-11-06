import 'server-only';
import {createHash} from 'node:crypto';
import {assertDeploymentIsolation} from './deployment-isolation';
import {getChatGPTUser} from './chatgpt-auth';
import {permissionManagement} from './permission-management';
import {accountSecurityGate} from './account-security-server';
import {supabaseRest} from './supabase-rest';
import {canonicalStoreId} from './live-calendar-model';
import {isMarket,MARKET_CODES,type MarketCode} from './markets';
import {proposedStoreId} from './store-registration';
import {parseStoreAccountSetup} from './store-account-setup-server';
import {parseStoreDetails} from './store-directory';

export type ProjectStore={id:string;name:string;serviceStatus:'active'|'inactive'|'ended';serviceStatusVersion:string};
export type StoreProject={id:string;name:string;version:string;legacy?:boolean;markets:Array<{market:MarketCode;enabled:boolean;state:'configured'|'pending'|'inactive'|'ended';stores:ProjectStore[]}>};
export type StoreProjectResponse={projects:StoreProject[];ungroupedStores:Array<ProjectStore&{market:MarketCode}>;excludedStoreIds:string[]};
const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const record=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
function allowedKeys(value:Record<string,unknown>,keys:string[]){return Object.keys(value).every(key=>keys.includes(key));}
function requireStoreProjectEnvironment(){if(assertDeploymentIsolation()==='local')throw Error('STORE_PROJECT_ENVIRONMENT');}
function failure(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(/STORE_PROJECT_STATUS_CONFIRMATION_REQUIRED/.test(message))return reply({error:'First review and confirm Inactive or Service ended for every active store in this country. Nothing was saved.'},409);
 if(/STORE_PROJECT_MEMBERS_REQUIRED/.test(message))return reply({error:'Keep all existing country stores in this project. To stop a country, confirm its store status first.'},409);
 if(/STORE_PROJECT_(VERSION_CONFLICT|STORE_ALREADY_GROUPED)|ACCOUNT_(VERSION_CONFLICT|REQUEST_CONFLICT|CARD_)|STORE_DUPLICATE|23505/.test(message))return reply({error:'The project, store or Rate Card changed. Refresh the form before saving.'},409);
 if(/STORE_PROJECT_ACCESS_DENIED|ACCOUNT_ACCESS_DENIED|STORE_ACCESS_DENIED/.test(message))return reply({error:'Super Admin access required.'},403);
 if(/STORE_PROJECT_NOT_FOUND/.test(message))return reply({error:'Project not found.'},404);
 if(/STORE_PROJECT_(INVALID|STORE_SCOPE|MARKET_MISMATCH)|STORE_SETUP_INVALID|STORE_DETAILS_INVALID|ACCOUNT_(INVALID|PAST_MONTH)/.test(message))return reply({error:'Check the project, selected countries, stores and Account setup. Nothing was saved.'},400);
 return reply({error:'Project settings are unavailable in this environment. No change was confirmed.'},503);
}
function checkedRead(value:unknown):StoreProjectResponse{
 const data=record(value);
 if(!data||!Array.isArray(data.projects)||!Array.isArray(data.ungroupedStores)||!Array.isArray(data.excludedStoreIds)||data.projects.length>1000||data.ungroupedStores.length>2000)throw Error('Invalid project response');
 for(const p of data.projects){const project=record(p);if(!project||typeof project.id!=='string'||!uuid.test(project.id)||typeof project.name!=='string'||typeof project.version!=='string'||!/^\d{1,18}$/.test(project.version)||!Array.isArray(project.markets)||project.markets.length>4)throw Error('Invalid project response');for(const m of project.markets){const market=record(m);if(!market||!isMarket(market.market)||typeof market.enabled!=='boolean'||!['configured','pending','inactive','ended'].includes(String(market.state))||!Array.isArray(market.stores)||market.stores.some((s:unknown)=>!validStore(s)))throw Error('Invalid project response');}}
 if(data.ungroupedStores.some((s:unknown)=>!validStore(s)||!isMarket(record(s)?.market))||data.excludedStoreIds.some((id:unknown)=>typeof id!=='string'||canonicalStoreId(id)!==id))throw Error('Invalid project response');
 return data as StoreProjectResponse;
}
function validStore(value:unknown){const s=record(value);return !!s&&typeof s.id==='string'&&canonicalStoreId(s.id)===s.id&&typeof s.name==='string'&&['active','inactive','ended'].includes(String(s.serviceStatus))&&typeof s.serviceStatusVersion==='string'&&/^\d{1,18}$/.test(s.serviceStatusVersion);}

export async function getStoreProjects(admin:boolean):Promise<Response>{
 try{
  requireStoreProjectEnvironment();let tenant:string,actor:string;
  if(admin){const auth=await permissionManagement();if('error'in auth)return auth.error;if(!auth.isSuperAdmin)return reply({error:'Super Admin access required.'},403);tenant=auth.member.tenant_id;actor=auth.actor;}
  else{const user=await getChatGPTUser();if(!user)return reply({error:'Authentication required.'},401);actor=user.email.toLowerCase();const [member]=await supabaseRest<Array<{tenant_id:string;active:boolean}>>(`customer_users?select=tenant_id,active&email=eq.${encodeURIComponent(actor)}&limit=1`);if(!member?.active)return reply({error:'Store access required.'},403);tenant=member.tenant_id;}
  const data=checkedRead(await supabaseRest<unknown>('rpc/read_store_projects',{method:'POST',body:JSON.stringify({p_tenant:tenant,p_actor:actor,p_admin:admin})}));
  if(!admin){
   data.projects.push(...data.ungroupedStores.map(store=>({id:`store:${store.id}`,name:store.name,version:'0',legacy:true,markets:[{market:store.market,enabled:true,state:store.serviceStatus==='active'?'configured' as const:'inactive' as const,stores:[store]}]})));
   data.ungroupedStores=[];
  }
  return reply(data);
 }catch(error){return failure(error);}
}

function childRequest(parent:string,id:string){const hex=createHash('sha256').update(`store-project:${parent}:${id}`).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
/** Extract a bounded, normalized spec. Tenant, actor, canonical Store IDs and child receipts are server-owned. */
function parseSpec(value:unknown){
 const body=record(value);
 if(!body||!allowedKeys(body,['id','name','expectedVersion','requestId','markets'])||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>120||typeof body.expectedVersion!=='string'||!/^\d{1,18}$/.test(body.expectedVersion)||typeof body.requestId!=='string'||!uuid.test(body.requestId)||body.id!==undefined&&(typeof body.id!=='string'||!uuid.test(body.id))||!Array.isArray(body.markets)||body.markets.length<1||body.markets.length>4)throw Error('STORE_PROJECT_INVALID');
 const seenMarkets=new Set<string>(),seenStores=new Set<string>();const newStores:Array<Record<string,unknown>>=[];
 const markets=body.markets.map((value:unknown)=>{
  const country=record(value);if(!country||!allowedKeys(country,['market','enabled','stores'])||!isMarket(country.market)||seenMarkets.has(country.market)||typeof country.enabled!=='boolean'||!Array.isArray(country.stores)||country.stores.length>100)throw Error('STORE_PROJECT_INVALID');
  const market=country.market;seenMarkets.add(market);
  const storeIds=country.stores.map((value:unknown)=>{
   const input=record(value);if(!input)throw Error('STORE_PROJECT_INVALID');let id:string;
   if(Object.prototype.hasOwnProperty.call(input,'storeId')){if(!allowedKeys(input,['storeId'])||typeof input.storeId!=='string'||!input.storeId||input.storeId.length>200||canonicalStoreId(input.storeId)!==input.storeId)throw Error('STORE_PROJECT_INVALID');id=input.storeId;}
   else{
    if(!allowedKeys(input,['name','accountSetup','details'])||!country.enabled||typeof input.name!=='string')throw Error('STORE_PROJECT_INVALID');
    const name=input.name.trim().replace(/\s+/g,' ');if(!name||name.length>120)throw Error('STORE_PROJECT_INVALID');id=proposedStoreId(name);if(id.length>200)throw Error('STORE_PROJECT_INVALID');
    const setup=parseStoreAccountSetup(input.accountSetup,market);
    const rawDetails=input.details===undefined?{}:record(input.details);if(!rawDetails||!allowedKeys(rawDetails,['projectLinks','storeGroupLink','googleDriveLink','adsTopUpOwner']))throw Error('STORE_PROJECT_INVALID');
    const details=parseStoreDetails(rawDetails);if('error'in details)throw Error('STORE_DETAILS_INVALID');
    newStores.push({id,name,sourceName:name,market,setup,details:details.value,requestId:childRequest(body.requestId as string,id)});
   }
   if(seenStores.has(id))throw Error('STORE_PROJECT_INVALID');seenStores.add(id);return id;
  }).sort();
  return {market,enabled:country.enabled,storeIds};
 }).sort((a,b)=>MARKET_CODES.indexOf(a.market)-MARKET_CODES.indexOf(b.market));
 if(seenStores.size>100||newStores.length>12)throw Error('STORE_PROJECT_INVALID');
 return {id:body.id??null,expectedVersion:body.expectedVersion,requestId:body.requestId,spec:{name:body.name.trim().replace(/\s+/g,' '),markets,newStores:newStores.sort((a,b)=>String(a.id).localeCompare(String(b.id)))}};
}
export async function saveStoreProject(request:Request):Promise<Response>{
 try{
  requireStoreProjectEnvironment();const auth=await permissionManagement(request);if('error'in auth)return auth.error;if(!auth.isSuperAdmin)return reply({error:'Super Admin access required.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'A JSON request is required.'},400);
  const raw=await request.text();if(raw.length>100000)return reply({error:'Project request is too large.'},400);
  let parsed:ReturnType<typeof parseSpec>;try{parsed=parseSpec(JSON.parse(raw));}catch{return reply({error:'Check the project, countries and complete Account setup for each new store.'},400);}
  if(parsed.spec.newStores.length){const gate=await accountSecurityGate();if(gate)return gate;}
  const saved=await supabaseRest<{id:string;name:string;version:string;createdStoreIds:string[]}>('rpc/save_store_project',{method:'POST',body:JSON.stringify({p_tenant:auth.member.tenant_id,p_actor:auth.actor,p_project_id:parsed.id,p_spec:parsed.spec,p_expected_version:parsed.expectedVersion,p_request_id:parsed.requestId})});
  if(!uuid.test(saved.id)||!/^\d{1,18}$/.test(saved.version)||!Array.isArray(saved.createdStoreIds))throw Error('Invalid saved project response');
  return reply({saved:true,project:saved},parsed.id?200:201);
 }catch(error){return failure(error);}
}
