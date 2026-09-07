import { timingSafeEqual } from "node:crypto";
import { supabaseConfig, supabaseRest } from "../../../supabase-rest";

export const dynamic = "force-dynamic";
type AuthUser = { id: string; email?: string };

function matchesTemporaryPassword(value: string) {
  const expected = process.env.PORTAL_TEMPORARY_PASSWORD;
  if (!expected) return false;
  const entered = Buffer.from(value);
  const reference = Buffer.from(expected);
  return entered.length === reference.length && timingSafeEqual(entered, reference);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {email?: string; temporaryPassword?: string; password?: string} | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return Response.json({error:"Enter a valid email and a new password of at least 8 characters"},{status:400});

  if (!body?.temporaryPassword || !matchesTemporaryPassword(body.temporaryPassword)) return Response.json({error:"The temporary password is incorrect"},{status:401});

  const membership = await supabaseRest<Array<{active:boolean;role:string}>>(`customer_users?select=active,role&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!membership[0]?.active) return Response.json({error:"No portal access found. Please contact a Shopee Hub Specialist."},{status:403});
  if (membership[0].role === "superadmin") return Response.json({error:"Super Admin passwords cannot be reset with the temporary password. Please contact the system administrator."},{status:403});

  const {url,secret} = supabaseConfig();
  const headers = {apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"};
  const listResponse = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`,{headers,cache:"no-store"});
  if (!listResponse.ok) return Response.json({error:"Unable to reset password. Please contact a Shopee Hub Specialist."},{status:502});
  const listed = await listResponse.json() as {users?:AuthUser[]}|AuthUser[];
  const users = Array.isArray(listed) ? listed : listed.users ?? [];
  const authUser = users.find(user => user.email?.toLowerCase() === email);
  const authResponse = authUser
    ? await fetch(`${url}/auth/v1/admin/users/${authUser.id}`,{method:"PUT",headers,body:JSON.stringify({password}),cache:"no-store"})
    : await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers,body:JSON.stringify({email,password,email_confirm:true}),cache:"no-store"});
  if (!authResponse.ok) return Response.json({error:"Unable to reset password. Please contact a Shopee Hub Specialist."},{status:502});
  return Response.json({ok:true});
}
