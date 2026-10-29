import {getChatGPTUser} from '../../../chatgpt-auth';
import {supabaseRest} from '../../../supabase-rest';
import {monthBounds,publicLeaderboard,validMonth,validWeek,weekBounds} from '../../../live-leaderboard-model';
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
  if(row)return json({period,mode,through:row.period_end,...publicLeaderboard(row)});
  // Reuse only names for the empty period, never amounts or freshness from another period.
  const [roster]=await supabaseRest<Array<Record<string,unknown>>>(`live_leaderboard_snapshots?select=observed_shops,missing_shops&tenant_id=eq.${tenant}&order=period_end.desc,synced_at.desc&limit=1`);
  const names=new Map<string,string>();
  for(const source of [roster?.observed_shops,roster?.missing_shops])if(Array.isArray(source))for(const shop of source){const name=typeof shop?.shop_username==='string'?shop.shop_username.trim():'';if(name)names.set(name.toLowerCase(),name);}
  return json({period,mode,through:null,status:'pending',currency:'MYR',shops:[...names.values()].sort().map(name=>({name,salesCents:0,observed:false,rank:0})),pending:[],totalCents:null,updated:null});
 }catch{return json({error:'Unable to load leaderboard. Please try again.'},503);}
}
