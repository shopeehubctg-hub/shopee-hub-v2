import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic="force-dynamic";
const RECOVERY_MESSAGE="If this email has portal access, a password link will arrive shortly. Check your inbox and spam folder.";
const KNOWN_PORTAL_HOSTS=new Set([
  "shopee-hub-v2-260731.vercel.app",
  "shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app",
]);

function recoveryRedirect(request:Request){
  const origin=new URL(request.url);
  const configured=process.env.PORTAL_PUBLIC_URL;
  const configuredHost=configured?new URL(configured).host:null;
  if(origin.protocol!=="https:" && origin.hostname!=="localhost")throw new Error("Untrusted portal origin");
  if(!KNOWN_PORTAL_HOSTS.has(origin.host)&&origin.host!==configuredHost&&origin.hostname!=="localhost")throw new Error("Untrusted portal origin");
  return new URL("/auth/callback",origin).toString();
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null)as{email?:string}|null;const email=body?.email?.trim().toLowerCase()??"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Enter a valid email address"},{status:400});
  const membership=await supabaseRest<Array<{active:boolean;role:string}>>(`customer_users?select=active,role&email=eq.${encodeURIComponent(email)}&limit=1`);
  if(!membership[0]?.active||membership[0].role==="superadmin")return Response.json({ok:true,message:RECOVERY_MESSAGE});
  let redirectTo:string;
  try{redirectTo=recoveryRedirect(request)}catch{return Response.json({error:"Password recovery is unavailable on this portal address."},{status:503})}
  const {url,secret}=supabaseConfig();
  const response=await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,{
    method:"POST",headers:{apikey:secret,"Content-Type":"application/json"},body:JSON.stringify({email}),cache:"no-store",
  });
  if(!response.ok)return Response.json({error:"Unable to send a password link. Please contact a Shopee Hub Specialist."},{status:502});
  return Response.json({ok:true,message:RECOVERY_MESSAGE});
}
