import { supabaseConfig } from "../../../supabase-rest";

export const dynamic="force-dynamic";
export async function POST(request:Request){const body=await request.json().catch(()=>null)as{accessToken?:string;password?:string}|null;if(!body?.accessToken||!body.password||body.password.length<8)return Response.json({error:"Password must contain at least 8 characters"},{status:400});const{url,secret}=supabaseConfig();const response=await fetch(`${url}/auth/v1/user`,{method:"PUT",headers:{apikey:secret,Authorization:`Bearer ${body.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({password:body.password}),cache:"no-store"});if(!response.ok)return Response.json({error:"This reset link is invalid or expired"},{status:401});return Response.json({ok:true});}
