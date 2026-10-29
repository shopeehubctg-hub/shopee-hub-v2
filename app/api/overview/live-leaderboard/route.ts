import {getChatGPTUser} from '../../../chatgpt-auth';
import {supabaseRest} from '../../../supabase-rest';
import {publicLeaderboard,validWeek,weekBounds} from '../../../live-leaderboard-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 try{
  const actor=await getChatGPTUser();if(!actor)return json({error:'Authentication required'},401);
  const [member]=await supabaseRest<Array<{tenant_id:string;role:string;active:boolean}>>(`customer_users?select=tenant_id,role,active&email=eq.${encodeURIComponent(actor.email.toLowerCase())}&limit=1`);
  if(!member?.active||member.role!=='superadmin')return json({error:'Super Admin access required'},403);
  const tenant=encodeURIComponent(member.tenant_id);
  const [active]=await supabaseRest<Array<{active:boolean}>>(`tenants?select=active&id=eq.${tenant}&limit=1`);
  if(!active?.active)return json({error:'Active tenant access required'},403);
  const start=new URL(request.url).searchParams.get('week')||weekBounds().start;
  if(!validWeek(start))return json({error:'Choose a valid week.'},400);
  const end=new Date(start+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);
  const period={start,end:end.toISOString().slice(0,10)};
  const [row]=await supabaseRest<Array<Record<string,unknown>>>(`live_leaderboard_snapshots?select=status,currency,observed_sales_cents,observed_shops,missing_shops,synced_at&tenant_id=eq.${tenant}&report_kind=eq.weekly&period_start=eq.${start}&period_end=eq.${period.end}&limit=1`);
  return json({period,...(row?publicLeaderboard(row):{status:'pending',currency:'MYR',shops:[],pending:[],totalCents:null,updated:null})});
 }catch{return json({error:'Unable to load leaderboard. Please try again.'},503);}
}
