import { cookies } from "next/headers";
import { createPortalSession, createPortalSessionWithId, readPortalSessionWithId, PORTAL_SESSION_COOKIE } from "../../../chatgpt-auth";
import { portalSecurityEnabled, registerPortalSession, revokePortalSession } from "../../../portal-session-store";
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
  let signedCookie=createPortalSession(authUser.email);
  if(portalSecurityEnabled()){
    const prepared=createPortalSessionWithId(authUser.email);
    if(!await registerPortalSession(authUser.email,prepared.sessionId,prepared.expiresAt,"email_link"))return Response.json({error:"Portal sign-in is temporarily unavailable."},{status:503});
    signedCookie=prepared.cookie;
  }
  (await cookies()).set(PORTAL_SESSION_COOKIE,signedCookie,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*7});
  return Response.json({ok:true});
}

export async function DELETE(){
  const jar=await cookies();
  if(portalSecurityEnabled()){
    const signed=readPortalSessionWithId(jar.get(PORTAL_SESSION_COOKIE)?.value);
    if(!signed){
      jar.set(PORTAL_SESSION_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
      jar.set("shopee_hub_account_stepup","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
      return Response.json({error:"Portal session is unavailable. Sign in again."},{status:401});
    }
    if(!await revokePortalSession(signed.email,signed.sessionId))return Response.json({error:"Sign-out could not be completed. Please retry."},{status:503});
    jar.set("shopee_hub_account_stepup","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  }
  jar.set(PORTAL_SESSION_COOKIE,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
  return Response.json({ok:true});
}
