import { cookies } from "next/headers";
import { createPortalSession, PORTAL_SESSION_COOKIE } from "../../../chatgpt-auth";
import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic = "force-dynamic";

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {accessToken?:string}|null;
  if(!body?.accessToken)return Response.json({error:"Missing session"},{status:400});
  const {url,secret}=supabaseConfig();
  const authResponse=await fetch(`${url}/auth/v1/user`,{headers:{apikey:secret,Authorization:`Bearer ${body.accessToken}`},cache:"no-store"});
  if(!authResponse.ok)return Response.json({error:"Invalid or expired sign-in link"},{status:401});
  const authUser=await authResponse.json() as {email?:string};
  if(!authUser.email)return Response.json({error:"Email is unavailable"},{status:401});
  const membership=await supabaseRest<Array<{active:boolean}>>(`customer_users?select=active&email=eq.${encodeURIComponent(authUser.email.toLowerCase())}&limit=1`);
  if(!membership[0]?.active)return Response.json({error:"This account does not have portal access"},{status:403});
  (await cookies()).set(PORTAL_SESSION_COOKIE,createPortalSession(authUser.email),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*7});
  return Response.json({ok:true});
}

export async function DELETE(){
  (await cookies()).set(PORTAL_SESSION_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  return Response.json({ok:true});
}
