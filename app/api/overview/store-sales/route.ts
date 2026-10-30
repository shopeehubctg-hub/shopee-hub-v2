import {getChatGPTUser} from '../../../chatgpt-auth';
import {supabaseRest} from '../../../supabase-rest';
import {summarizeStoreSales,type StoreSale} from '../../../store-sales-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 try{
  const actor=await getChatGPTUser();if(!actor)return json({error:'Authentication required'},401);
  const [member]=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  if(!member?.active||member.role!=='superadmin')return json({error:'Super Admin access required'},403);
  const tenant=encodeURIComponent(member.tenant_id),params=new URL(request.url).searchParams,storeId=params.get('storeId');
  if(!storeId||storeId==='all'||storeId.length>200)return json({error:'Choose a store.'},400);
  const [tenants,stores]=await Promise.all([
   supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenant}&limit=1`),
   supabaseRest<Array<{id:string;name:string;display_name:string|null}>>(`stores?select=id,name,display_name&tenant_id=eq.${tenant}&id=eq.${encodeURIComponent(storeId)}&limit=1`),
  ]);
  if(!tenants[0]?.active||!stores[0])return json({error:'Store access denied'},403);
  const bounds=`tenant_id=eq.${tenant}&store_id=eq.${encodeURIComponent(storeId)}`;
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const [latest]=await supabaseRest<Array<{report_date:string}>>(`bigseller_store_daily?select=report_date&${bounds}&report_date=lte.${today}&order=report_date.desc&limit=1`);
  const requested=params.get('month'),month=requested||latest?.report_date.slice(0,7)||today.slice(0,7);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))return json({error:'Choose a valid month.'},400);
  const next=new Date(month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  const rows=await supabaseRest<StoreSale[]>(`bigseller_store_daily?select=report_date,marketplace,currency,gross_revenue::text,canceled_orders,canceled_sales::text,synced_at&${bounds}&report_date=gte.${month}-01&report_date=lt.${next.toISOString().slice(0,10)}&report_date=lte.${today}&order=report_date.asc&limit=32`);
  if(rows.length>31)return json({error:'Store sales need review.'},503);
  return json({store:{id:stores[0].id,name:stores[0].display_name||stores[0].name},month,currency:'MYR',...summarizeStoreSales(rows,month)});
 }catch{return json({error:'Unable to load store sales. Please try again.'},503);}
}
