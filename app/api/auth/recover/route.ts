import { cookies } from "next/headers";
import { createPasswordResetRequest, PASSWORD_RESET_COOKIE } from "../../../chatgpt-auth";
import { supabaseRest } from "../../../supabase-rest";

export const dynamic="force-dynamic";
const SPECIALIST_WHATSAPP="601120784022";

export async function POST(request:Request){
  const body=await request.json().catch(()=>null)as{email?:string}|null;const email=body?.email?.trim().toLowerCase()??"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter a valid email address"},{status:400});
  const membership=await supabaseRest<Array<{active:boolean;role:string}>>(`customer_users?select=active,role&email=eq.${encodeURIComponent(email)}&limit=1`);
  if(!membership[0]?.active)return Response.json({error:"No portal access found. Please contact a Shopee Hub Specialist."},{status:403});
  if(membership[0].role==="superadmin")return Response.json({error:"Super Admin passwords cannot be reset here. Please contact the system administrator."},{status:403});
  (await cookies()).set(PASSWORD_RESET_COOKIE,createPasswordResetRequest(email),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*30});
  const text=`Hi Shopee Hub Specialist, I need a temporary password to reset my Shopee Hub account: ${email}`;
  return Response.json({ok:true,email,whatsappUrl:`https://wa.me/${SPECIALIST_WHATSAPP}?text=${encodeURIComponent(text)}`});
}
