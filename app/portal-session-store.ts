import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { supabaseRest } from "./supabase-rest";

export type PortalAuthMethod = "password" | "email_link" | "trusted_proxy";
type Principal = { userId: string; tenantId: string };
const MAX_BIGINT_ID = "9223372036854775807";

export function portalSecurityEnabled() {
  return process.env.SHOPEE_ACCOUNT_SECURITY_ENABLED === "1";
}

function bigintId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
    (value.length < MAX_BIGINT_ID.length || value <= MAX_BIGINT_ID);
}

function digestSessionId(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== value) return null;
  return `\\x${createHash("sha256").update(bytes).digest("hex")}`;
}

async function principalForEmail(email: string, requireActive: boolean): Promise<Principal | null> {
  if (!email || email.length > 320) return null;
  const rows = await supabaseRest<Array<{id:string;tenant_id:string;active:boolean}>>(
    `customer_users?select=id::text,tenant_id,active&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
  );
  const member = rows[0];
  if (!member || !bigintId(member.id) || !member.tenant_id || requireActive && member.active !== true) return null;
  const tenants = await supabaseRest<Array<{id:string;active:boolean}>>(
    `tenants?select=id,active&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`,
  );
  if (tenants[0]?.id !== member.tenant_id || requireActive && tenants[0].active !== true) return null;
  return { userId: member.id, tenantId: member.tenant_id };
}

/** Called only after primary authentication. The cookie must be set after this RPC succeeds. */
export async function registerPortalSession(email: string, sessionId: string, expiresAt: number, authMethod: PortalAuthMethod): Promise<boolean> {
  const digest = digestSessionId(sessionId);
  if (!digest || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() / 1000) return false;
  try {
    const principal = await principalForEmail(email, true);
    if (!principal) return false;
    const result = await supabaseRest<string>("rpc/account_register_portal_session", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: principal.tenantId, p_user_id: principal.userId,
        p_session_digest: digest, p_expires_at: new Date(expiresAt * 1000).toISOString(),
        p_auth_method: authMethod, p_request_id: randomUUID(),
      }),
    });
    return result === "created" || result === "existing";
  } catch { return false; }
}

/** A signed ID is insufficient; the persisted primary session must still be active. */
export async function registeredPortalSessionValid(email: string, sessionId: string): Promise<boolean> {
  const digest = digestSessionId(sessionId);
  if (!digest) return false;
  try {
    const principal = await principalForEmail(email, true);
    if (!principal) return false;
    return await supabaseRest<boolean>("rpc/account_portal_session_valid", {
      method: "POST", body: JSON.stringify({
        p_tenant_id: principal.tenantId, p_user_id: principal.userId, p_session_digest: digest,
      }),
    }) === true;
  } catch { return false; }
}

/** Returns true only after persistent revocation (or an already revoked row). */
export async function revokePortalSession(email: string, sessionId: string): Promise<boolean> {
  const digest = digestSessionId(sessionId);
  if (!digest) return false;
  try {
    const principal = await principalForEmail(email, false);
    if (!principal) return false;
    const result = await supabaseRest<string>("rpc/account_revoke_portal_session", {
      method: "POST", body: JSON.stringify({
        p_tenant_id: principal.tenantId, p_user_id: principal.userId,
        p_session_digest: digest, p_request_id: randomUUID(),
      }),
    });
    return result === "revoked" || result === "already_revoked";
  } catch { return false; }
}
