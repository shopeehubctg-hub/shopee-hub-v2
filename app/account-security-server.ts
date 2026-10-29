import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getChatGPTUser, PORTAL_SESSION_COOKIE, readPortalSessionWithId } from "./chatgpt-auth";
import { supabaseRest } from "./supabase-rest";

export const ACCOUNT_STEPUP_COOKIE = "shopee_hub_account_stepup";

export function accountSecurityEnabled() {
  return process.env.SHOPEE_ACCOUNT_SECURITY_ENABLED === "1";
}

function tokenDigest(value: string | undefined): string | null {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== value) return null;
  return `\\x${createHash("sha256").update(bytes).digest("hex")}`;
}

function bigintId(value: unknown): value is string {
  const max = "9223372036854775807";
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
    (value.length < max.length || value <= max);
}

/** The RPC verifies persisted primary and step-up sessions in one database snapshot. */
export async function accountAccessGranted(): Promise<boolean> {
  if (!accountSecurityEnabled()) return true;
  try {
    const jar = await cookies();
    const primary = readPortalSessionWithId(jar.get(PORTAL_SESSION_COOKIE)?.value);
    const primaryDigest = tokenDigest(primary?.sessionId);
    const stepupDigest = tokenDigest(jar.get(ACCOUNT_STEPUP_COOKIE)?.value);
    if (!primary || !primaryDigest || !stepupDigest) return false;
    // Existing routes may use a trusted proxy identity outside Vercel. It must be the signed-cookie subject.
    const routeUser = await getChatGPTUser();
    if (!routeUser || routeUser.email.toLowerCase() !== primary.email) return false;
    const members = await supabaseRest<Array<{id:string;tenant_id:string;role:string;active:boolean}>>(
      `customer_users?select=id::text,tenant_id,role,active&email=eq.${encodeURIComponent(primary.email)}&limit=1`,
    );
    const member = members[0];
    if (!member?.active || member.role !== "superadmin" || !bigintId(member.id) || !member.tenant_id) return false;
    const tenants = await supabaseRest<Array<{id:string;active:boolean}>>(
      `tenants?select=id,active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`,
    );
    if (tenants[0]?.active !== true || tenants[0].id !== member.tenant_id) return false;
    const valid = await supabaseRest<boolean>("rpc/account_session_valid", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: member.tenant_id,
        p_user_id: member.id,
        p_primary_digest: primaryDigest,
        p_stepup_digest: stepupDigest,
      }),
    });
    return valid === true;
  } catch {
    return false;
  }
}

/** Null means the route may continue. On a locked Account, no sensitive work should start. */
export async function accountSecurityGate(): Promise<Response | null> {
  if (await accountAccessGranted()) return null;
  return Response.json({ error: "Account is locked. Sign in and complete Account verification." }, {
    status: 423, headers: { "Cache-Control": "private, no-store" },
  });
}
