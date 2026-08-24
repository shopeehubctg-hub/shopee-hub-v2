import { cookies } from "next/headers";
import { createPortalSession, PORTAL_SESSION_COOKIE } from "../../../chatgpt-auth";
import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  const body=await request.json().catch(()=>null)as{email?:string;password?:string}|null;const email=body?.email?.trim().toLowerCase()??"";const password=body?.password??"";
  if(!email||!password)return Response.json({error:"Email and password are required"},{status:400});
  const {url,secret}=supabaseConfig();const authResponse=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:secret,"Content-Type":"application/json"},body:JSON.stringify({email,password}),cache:"no-store"});
  if(!authResponse.ok)return Response.json({error:"Incorrect email or password"},{status:401});
  const membership=await supabaseRest<Array<{active:boolean}>>(`customer_users?select=active&email=eq.${encodeURIComponent(email)}&limit=1`);if(!membership[0]?.active)return Response.json({error:"This account does not have active portal access"},{status:403});
  (await cookies()).set(PORTAL_SESSION_COOKIE,createPortalSession(email),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*7});return Response.json({ok:true});
}
