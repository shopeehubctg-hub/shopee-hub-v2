import { getChatGPTUser } from '../../../chatgpt-auth';
import { effectivePermissionModules } from '../../../permission-management';
import { supabaseRest } from '../../../supabase-rest';
import { summarizeAccessibleStoreSales,type AccessibleStoreSale } from '../../../store-sales-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function readStoreSales(path:string,max=10000){
 const rows:AccessibleStoreSale[]=[];
 for(let offset=0;offset<max;offset+=500){
  const page=await supabaseRest<AccessibleStoreSale[]>(`${path}&limit=500&offset=${offset}`);
  rows.push(...page);
  if(page.length<500)return rows;
 }
 throw Error('Store sales read limit reached');
}
export async function GET(request:Request){
 try{
  const actor=await getChatGPTUser();
  if(!actor)return json({error:'Authentication required'},401);
  const members=await supabaseRest<Array<{id:number;tenant_id:string;role:'customer'|'manager'|'superadmin';active:boolean;module_access_mode:'role_default'|'custom';store_access_mode:'all'|'selected'}>>(`customer_users?select=id,tenant_id,role,active,module_access_mode,store_access_mode&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  const member=members[0];
  if(!member?.active)return json({error:'Sales access required'},403);
  const tenant=encodeURIComponent(member.tenant_id);
  const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenant}&limit=1`);
  if(!tenants[0]?.active)return json({error:'Active tenant access required'},403);
  const requested=new URL(request.url).searchParams.get('month');
  if(requested&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested))return json({error:'Choose a valid month.'},400);
  if(member.role!=='superadmin'){
   const [userRows,tenantRows]=await Promise.all([
    supabaseRest<Array<{module_id:string;enabled:boolean;additive_grant:boolean}>>(`user_module_permissions?select=module_id,enabled,additive_grant&user_id=eq.${member.id}`),
    supabaseRest<Array<{module_id:string;enabled:boolean}>>(`tenant_module_permissions?select=module_id,enabled&tenant_id=eq.${tenant}`),
   ]);
   if(!effectivePermissionModules(member,tenantRows,userRows).includes('overview_store_sales'))return json({error:'Store Daily Sales access required'},403);
   const assignedRows=member.store_access_mode==='selected'?await supabaseRest<Array<{store_id:string}>>(`user_store_access?select=store_id&enabled=eq.true&user_id=eq.${member.id}`):await supabaseRest<Array<{id:string}>>(`stores?select=id&tenant_id=eq.${tenant}`);
   const storeIds=[...new Set(assignedRows.map(row=>'store_id'in row?row.store_id:row.id))];
   if(!storeIds.length)return json({month:requested??'',latestDate:null,rows:[],sample:false,scope:'assigned',storeCount:0});
   const storeFilter=`store_id=in.(${storeIds.map(encodeURIComponent).join(',')})`,today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   const latest=await supabaseRest<Array<{report_date:string}>>(`bigseller_store_daily?select=report_date&tenant_id=eq.${tenant}&${storeFilter}&report_date=lte.${today}&order=report_date.desc&limit=1`);
   const month=requested||latest[0]?.report_date.slice(0,7)||'';if(!month)return json({month:'',latestDate:null,rows:[],sample:false,scope:'assigned',storeCount:storeIds.length});
   if(month>today.slice(0,7))return json({error:'Choose a valid month.'},400);
   const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
   const rows=await readStoreSales(`bigseller_store_daily?select=store_id,report_date,marketplace,currency,gross_revenue::text,synced_at&tenant_id=eq.${tenant}&${storeFilter}&report_date=gte.${month}-01&report_date=lt.${next.toISOString().slice(0,10)}&report_date=lte.${today}&order=report_date.asc,store_id.asc`);
   return json({month,sample:false,scope:'assigned',storeCount:storeIds.length,...summarizeAccessibleStoreSales(rows,month)});
  }
  const latest=await supabaseRest<Array<{report_date:string}>>(`sales_overview_daily?select=report_date&tenant_id=eq.${tenant}&order=report_date.desc&limit=1`);
  const month=requested||latest[0]?.report_date.slice(0,7)||'';
  if(!month)return json({month:'',latestDate:null,rows:[],sample:false});
  const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const bounds=`tenant_id=eq.${tenant}&report_date=gte.${month}-01&report_date=lt.${next.toISOString().slice(0,10)}`;
  const fields='report_date,day_all,day_shopee,day_lazada,day_tiktok,mtd_all,mtd_shopee,mtd_lazada,mtd_tiktok,synced_at,target,days_remaining,estimated_monthly,sales_difference,daily_sales_target,target_progress_pct';
  const [rows,sources,currencies]=await Promise.all([
   supabaseRest<unknown[]>(`sales_overview_daily?select=${fields}&${bounds}&order=report_date.asc&limit=31`),
   supabaseRest<unknown[]>(`sales_daily?select=source&${bounds}&source=eq.staging-sample&limit=1`),
   supabaseRest<Array<{currency:string}>>(`sales_daily?select=currency&${bounds}&limit=124`),
  ]);
  if(currencies.some(r=>r.currency!=='MYR'))return json({error:'Sales currency needs review.'},503);
  return json({month,latestDate:latest[0]?.report_date??null,rows,sample:sources.length>0,scope:'company'});
 }catch{return json({error:'Unable to load sales. Please try again.'},503);}
}
