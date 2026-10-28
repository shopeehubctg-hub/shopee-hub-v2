import { cookies } from "next/headers";
import { createPortalSession, PORTAL_SESSION_COOKIE } from "../../../chatgpt-auth";
import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {accessToken?: string; password?: string} | null;
  const password = body?.password ?? "";
  const accessToken=body?.accessToken??"";
  if(!accessToken||password.length<12)return Response.json({error:"Use your email link and choose a password of at least 12 characters."},{status:400});
  const {url,secret}=supabaseConfig();
  const headers={apikey:secret,Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"};
  const userResponse=await fetch(`${url}/auth/v1/user`,{headers,cache:"no-store"});
  if(!userResponse.ok)return Response.json({error:"This password link is invalid or expired. Request a new link."},{status:401});
  const user=await userResponse.json() as {email?:string};
  const email=user.email?.trim().toLowerCase()??"";
  if(!email)return Response.json({error:"Unable to verify this account."},{status:401});
  const membership = await supabaseRest<Array<{active:boolean;role:string}>>(`customer_users?select=active,role&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!membership[0]?.active) return Response.json({error:"No portal access found. Please contact a Shopee Hub Specialist."},{status:403});
  if (membership[0].role === "superadmin") return Response.json({error:"Contact the system administrator to reset this account."},{status:403});
  const authResponse=await fetch(`${url}/auth/v1/user`,{method:"PUT",headers,body:JSON.stringify({password}),cache:"no-store"});
  if (!authResponse.ok) return Response.json({error:"Unable to reset password. Please contact a Shopee Hub Specialist."},{status:502});
  (await cookies()).set(PORTAL_SESSION_COOKIE,createPortalSession(email),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*7});
  return Response.json({ok:true});
}
