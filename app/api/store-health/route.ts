import {getChatGPTUser} from '../../chatgpt-auth';
import {supabaseRest} from '../../supabase-rest';
import {assertDeploymentIsolation,STAGING_SUPABASE_REF} from '../../deployment-isolation';
import owner from '../../account-roster-data.json';
import {canonicalStoreId} from '../../live-calendar-model';
import {sourceStoreResolver,type SourceStore} from '../../source-store-mapping';
import {buildStoreHealth,type HealthSourceRow} from '../../store-health-model';
import {malaysiaDate} from '../../account-ledger';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
async function bounded<T>(path:string,max:number){const rows:T[]=[];for(let offset=0;offset<max;offset+=500){const page=await supabaseRest<T[]>(`${path}&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)return rows;}throw Error('Source read limit reached');}
export async function GET(request:Request){
 try{
  if(assertDeploymentIsolation()!=='staging'||process.env.SUPABASE_URL?.replace(/\/$/,'')!==`https://${STAGING_SUPABASE_REF}.supabase.co`)return Response.json({error:'Store Health is unavailable in this environment.'},{status:403,headers});
  const actor=await getChatGPTUser();if(!actor)return Response.json({error:'Authentication required'},{status:401,headers});
  const [member]=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  if(!member?.active||member.role!=='superadmin'||member.tenant_id!==owner.tenantId)return Response.json({error:'Store Health access is unavailable.'},{status:403,headers});
  const [tenant]=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`);if(!tenant?.active)return Response.json({error:'Active tenant access required'},{status:403,headers});
  const registry=await bounded<SourceStore>('stores?select=id,tenant_id,name,display_name,bigseller_name,platform&order=id.asc',5000);
  const allowed=new Set(registry.filter(store=>store.tenant_id===member.tenant_id&&canonicalStoreId(store.id)===store.id).map(store=>store.id));
  const selectedStoreId=canonicalStoreId(new URL(request.url).searchParams.get('storeId')??'all');
  if(selectedStoreId!=='all'&&!allowed.has(selectedStoreId))return Response.json({error:'Store access denied'},{status:403,headers});
  const today=malaysiaDate();
  const [latest]=await supabaseRest<Array<{check_date:string}>>(`store_health_snapshots?select=check_date&platform=eq.Shopee&check_date=lte.${today}&order=check_date.desc&limit=1`);
  if(!latest)return Response.json({stores:[],selectedStoreId,latestCheckDate:null},{headers});
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(latest.check_date))throw Error('Invalid check date');
  const directory=await bounded<{store_id:string;store_name:string;tenant_id:string}>('link_directory_stores?select=store_id,store_name,tenant_id&order=store_id.asc',5000);
  // Show one current daily snapshot, never silently revive an older missing store check.
  const rows=await bounded<HealthSourceRow>(`store_health_snapshots?select=check_date,store_name,platform,penalty_points,nfr,lsr,fhr,response_rate,rating,failing,created_at&platform=eq.Shopee&check_date=eq.${latest.check_date}&order=created_at.desc,id.asc`,5000);
  return Response.json(buildStoreHealth(rows,sourceStoreResolver(member.tenant_id,registry,directory),allowed,today,selectedStoreId),{headers});
 }catch{return Response.json({error:'Unable to load Store Health. Please try again.'},{status:503,headers});}
}
