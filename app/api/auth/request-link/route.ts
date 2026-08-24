import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic = "force-dynamic";

export async function POST(request:Request) {
  const body = await request.json().catch(()=>null) as {email?:string}|null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({error:"Enter a valid email address"},{status:400});
  const users = await supabaseRest<Array<{email:string;active:boolean}>>(`customer_users?select=email,active&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (users[0]?.active) {
    const {url,secret}=supabaseConfig();
    const redirectTo = `${new URL(request.url).origin}/auth/callback`;
    const response = await fetch(`${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,{
      method:"POST",headers:{apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},
      body:JSON.stringify({email,create_user:true}),cache:"no-store",
    });
    if (!response.ok) return Response.json({error:"Unable to send sign-in link"},{status:502});
  }
  return Response.json({ok:true,message:"If this email has portal access, a sign-in link has been sent."});
}
