import { getChatGPTUser } from '../../../chatgpt-auth';
import { supabaseRest } from '../../../supabase-rest';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 try{
  const actor=await getChatGPTUser();
  if(!actor)return json({error:'Authentication required'},401);
  const members=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  const member=members[0];
  if(!member?.active||member.role!=='superadmin')return json({error:'Super Admin access required'},403);
  const tenant=encodeURIComponent(member.tenant_id);
  const tenants=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenant}&limit=1`);
  if(!tenants[0]?.active)return json({error:'Active tenant access required'},403);
  const requested=new URL(request.url).searchParams.get('month');
  if(requested&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested))return json({error:'Choose a valid month.'},400);
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
  return json({month,latestDate:latest[0]?.report_date??null,rows,sample:sources.length>0});
 }catch{return json({error:'Unable to load sales. Please try again.'},503);}
}
