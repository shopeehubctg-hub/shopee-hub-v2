import {getChatGPTUser} from '../../../chatgpt-auth';
import {effectivePermissionModules} from '../../../permission-management';
import {canonicalStoreId} from '../../../live-calendar-model';
import {scopeLeaderboard} from '../../../leaderboard-access-model';
import {supabaseRest} from '../../../supabase-rest';
import {sourceStoreResolver,type SourceStore} from '../../../source-store-mapping';
import {monthBounds,publicLeaderboard,validMonth,validWeek,weekBounds} from '../../../live-leaderboard-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 try{
  const actor=await getChatGPTUser();if(!actor)return json({error:'Authentication required'},401);
  const [member]=await supabaseRest<Array<{id:number;tenant_id:string;role:'customer'|'manager'|'superadmin';active:boolean;module_access_mode:'custom'|'role_default';store_access_mode:'all'|'selected'}>>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  if(!member?.active)return json({error:'Leaderboard access required'},403);
  const tenant=encodeURIComponent(member.tenant_id);
  const [active]=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenant}&limit=1`);
  if(!active?.active)return json({error:'Active tenant access required'},403);
  const userRows=member.role==='superadmin'?[]:await supabaseRest<Array<{module_id:string;enabled:boolean}>>(`user_module_permissions?select=module_id,enabled&user_id=eq.${member.id}`);
  const effective=effectivePermissionModules(member,[],userRows);
  if(!effective.includes('overview_leaderboard'))return json({error:'Leaderboard access required'},403);
  const allBoard=member.role==='superadmin'||effective.includes('overview_leaderboard_all_stores');
  const assigned=!allBoard&&member.store_access_mode==='selected'?await supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&enabled=eq.true&user_id=eq.${member.id}`):[];
  const assignedIds=new Set(assigned.map(row=>canonicalStoreId(row.store_id)));
  const registry=await supabaseRest<SourceStore[]>(`stores?select=id,tenant_id,name,display_name,bigseller_name,platform&tenant_id=eq.${tenant}&limit=500`);
  const resolveStore=sourceStoreResolver(member.tenant_id,registry);
  const labelShops=<T extends {name:string}>(shops:T[])=>shops.map(shop=>{const mapped=resolveStore(shop.name);return {...shop,name:mapped?(mapped.display_name??mapped.name):shop.name,storeId:mapped?.id??null};});
  const allowedIds=new Set(registry.filter(store=>canonicalStoreId(store.id)===store.id&&(allBoard||member.store_access_mode==='all'||assignedIds.has(store.id))).map(store=>store.id));
  const params=new URL(request.url).searchParams,mode=params.get('mode')||'weekly';
  if(!['weekly','monthly'].includes(mode))return json({error:'Choose a valid period.'},400);
  const monthly=mode==='monthly',month=params.get('month')||monthBounds().start.slice(0,7);
  const start=monthly?month+'-01':params.get('week')||weekBounds().start;
  if(monthly?!validMonth(month):!validWeek(start))return json({error:'Choose a valid period.'},400);
  const end=new Date(start+'T00:00:00Z');if(monthly)end.setUTCMonth(end.getUTCMonth()+1,0);else end.setUTCDate(end.getUTCDate()+6);
  const period={start,end:end.toISOString().slice(0,10)};
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const bounds=monthly?`report_kind=eq.month_to_date&period_start=eq.${start}&period_end=gte.${start}&period_end=lte.${period.end<today?period.end:today}&order=period_end.desc,synced_at.desc`:`report_kind=eq.weekly&period_start=eq.${start}&period_end=eq.${period.end}`;
  const fields='status,currency,observed_sales_cents,observed_shops,missing_shops,synced_at,period_end';
  const [row]=await supabaseRest<Array<Record<string,unknown>>>(`live_leaderboard_snapshots?select=${fields}&tenant_id=eq.${tenant}&${bounds}&limit=1`);
  if(row){const result=publicLeaderboard(row);return json({period,mode,through:row.period_end,...scopeLeaderboard({...result,shops:labelShops(result.shops)},allBoard,allowedIds)});}
  // Reuse only names for the empty period, never amounts or freshness from another period.
  const [roster]=await supabaseRest<Array<Record<string,unknown>>>(`live_leaderboard_snapshots?select=observed_shops,missing_shops&tenant_id=eq.${tenant}&order=period_end.desc,synced_at.desc&limit=1`);
  const names=new Map<string,string>();
  for(const source of [roster?.observed_shops,roster?.missing_shops])if(Array.isArray(source))for(const shop of source){const name=typeof shop?.shop_username==='string'?shop.shop_username.trim():'';if(name)names.set(name.toLowerCase(),name);}
  return json({period,mode,through:null,...scopeLeaderboard({status:'pending',currency:'MYR',shops:labelShops([...names.values()].sort().map(name=>({name,salesCents:0,observed:false,rank:0}))),pending:[],totalCents:null,updated:null},allBoard,allowedIds)});
 }catch{return json({error:'Unable to load leaderboard. Please try again.'},503);}
}
