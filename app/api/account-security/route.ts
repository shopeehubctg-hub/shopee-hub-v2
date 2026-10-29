import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hashAccountPassword, verifyAccountPassword } from "../../account-password-crypto";
import { ACCOUNT_STEPUP_COOKIE, accountSecurityEnabled } from "../../account-security-server";
import { getChatGPTUser, PORTAL_SESSION_COOKIE, readPortalSessionWithId } from "../../chatgpt-auth";
import { supabaseConfig, supabaseRest } from "../../supabase-rest";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
type Member = { id: string; tenant_id: string; role: string; active: boolean };
type Tenant = { id: string; active: boolean; account_security_owner_user_id: string | null };
type Principal = { email: string; userId: string; tenantId: string; primaryDigest: string; primaryExpiresAt: number; stepupDigest: string | null };
type LatestRequest = { id: string; purpose: "enroll" | "reset"; status: string; requested_at: string; expires_at: string; credential_version: string; session_matches: boolean };
type SecurityStatus = { enrolled: boolean; credential_version: string; latest_request: LatestRequest | null; is_owner: boolean; pending_approvals: Array<{ id: string; target_user_id: string; target_email: string; purpose: string; requested_at: string; expires_at: string }>; unlocked: boolean; expires_at: string | null };
type ActionBody = { action?: string; purpose?: string; challengeId?: string; decision?: string; dashboardPassword?: string; accountPassword?: string; newAccountPassword?: string };

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: NO_STORE });
}

function digest(value: string | undefined): string | null {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== value) return null;
  return `\\x${createHash("sha256").update(bytes).digest("hex")}`;
}

function validId(value: unknown): value is string {
  const max = "9223372036854775807";
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) &&
    (value.length < max.length || value <= max);
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value);
}

async function principal(): Promise<Principal | null> {
  const jar = await cookies();
  const signed = readPortalSessionWithId(jar.get(PORTAL_SESSION_COOKIE)?.value);
  const primaryDigest = digest(signed?.sessionId);
  if (!signed || !primaryDigest) return null;
  const user = await getChatGPTUser();
  if (!user || user.email.toLowerCase() !== signed.email) return null;
  const members = await supabaseRest<Member[]>(
    `customer_users?select=id::text,tenant_id,role,active&email=eq.${encodeURIComponent(signed.email)}&limit=1`,
  );
  const member = members[0];
  if (!member?.active || member.role !== "superadmin" || !validId(member.id) || !member.tenant_id) return null;
  const tenants = await supabaseRest<Tenant[]>(
    `tenants?select=id,active,account_security_owner_user_id::text&id=eq.${encodeURIComponent(member.tenant_id)}&limit=1`,
  );
  if (tenants[0]?.id !== member.tenant_id || tenants[0].active !== true) return null;
  return {
    email: signed.email, userId: member.id, tenantId: member.tenant_id,
    primaryDigest, primaryExpiresAt: signed.expiresAt,
    stepupDigest: digest(jar.get(ACCOUNT_STEPUP_COOKIE)?.value),
  };
}

async function status(actor: Principal): Promise<SecurityStatus> {
  const result = await supabaseRest<SecurityStatus>("rpc/account_security_status", {
    method: "POST", body: JSON.stringify({
      p_tenant_id: actor.tenantId, p_user_id: actor.userId,
      p_primary_digest: actor.primaryDigest, p_stepup_digest: actor.stepupDigest,
    }),
  });
  if (!result || typeof result.enrolled !== "boolean" || !validVersion(result.credential_version) ||
      typeof result.unlocked !== "boolean" || typeof result.is_owner !== "boolean" ||
      !Array.isArray(result.pending_approvals)) throw new Error("Invalid Account security status");
  return result;
}

async function verifyDashboardPassword(email: string, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || !password || password.length > 1024) return false;
  const { url, secret } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: secret, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }), cache: "no-store",
  });
  return response.ok;
}

function differentPasswords(a: string, b: string): boolean {
  const first = createHash("sha256").update(a, "utf8").digest();
  const second = createHash("sha256").update(b, "utf8").digest();
  return !timingSafeEqual(first, second);
}

function clearStepupCookie() {
  // The browser loses local access only after a confirmed persistent revocation.
  return cookies().then(jar => jar.set(ACCOUNT_STEPUP_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
  }));
}

export async function GET() {
  if (!accountSecurityEnabled()) return json({ enabled: false });
  try {
    const actor = await principal();
    if (!actor) return json({ error: "Account access is unavailable." }, 403);
    return json({ enabled: true, ...await status(actor) });
  } catch {
    return json({ error: "Account security is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!accountSecurityEnabled()) return json({ error: "Account security is disabled." }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "A JSON request is required." }, 415);
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > 8192) return json({ error: "Invalid request size." }, 400);
  const body = (() => { try { return JSON.parse(raw) as ActionBody; } catch { return null; } })();
  if (!body || typeof body.action !== "string") return json({ error: "Invalid request." }, 400);
  try {
    const actor = await principal();
    if (!actor) return json({ error: "Account access is unavailable." }, 403);
    if (body.action === "request") {
      if (body.purpose !== "enroll" && body.purpose !== "reset") return json({ error: "Invalid request purpose." }, 400);
      const current = await status(actor);
      if (body.purpose === "enroll" && current.enrolled || body.purpose === "reset" && !current.enrolled)
        return json({ error: "This request is not available." }, 409);
      const expiryMs = Math.min(Date.now() + 29 * 60_000, actor.primaryExpiresAt * 1000 - 30_000);
      if (expiryMs <= Date.now()) return json({ error: "Dashboard session is expiring. Sign in again." }, 409);
      const expiresAt = new Date(expiryMs).toISOString();
      const result = await supabaseRest<string>("rpc/account_request_challenge", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_target_user_id: actor.userId,
          p_primary_digest: actor.primaryDigest, p_purpose: body.purpose,
          p_request_id: randomUUID(), p_challenge_id: randomUUID(), p_expires_at: expiresAt,
        }),
      });
      return json({ outcome: result }, result === "pending" ? 200 : 409);
    }
    if (body.action === "decide") {
      if (!validUuid(body.challengeId) || (body.decision !== "approve" && body.decision !== "reject"))
        return json({ error: "Invalid decision." }, 400);
      const current = await status(actor);
      if (!current.is_owner || !current.pending_approvals.some(item => item.id === body.challengeId))
        return json({ error: "Approval is unavailable." }, 403);
      if (!await verifyDashboardPassword(actor.email, body.dashboardPassword))
        return json({ error: "Dashboard password is incorrect." }, 401);
      const result = await supabaseRest<string>("rpc/account_decide_challenge", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_owner_user_id: actor.userId,
          p_owner_primary_digest: actor.primaryDigest, p_challenge_id: body.challengeId,
          p_decision: body.decision, p_request_id: randomUUID(),
        }),
      });
      return json({ outcome: result }, result === "approved" || result === "rejected" ? 200 : 409);
    }
    if (body.action === "setup") {
      if (!validUuid(body.challengeId) || typeof body.dashboardPassword !== "string" ||
          typeof body.newAccountPassword !== "string") return json({ error: "Invalid password request." }, 400);
      const current = await status(actor);
      const challenge = current.latest_request;
      if (!challenge || challenge.id !== body.challengeId || challenge.status !== "approved" ||
          !challenge.session_matches || !validVersion(challenge.credential_version) ||
          challenge.credential_version !== current.credential_version)
        return json({ error: "Approved request is unavailable." }, 409);
      if (!await verifyDashboardPassword(actor.email, body.dashboardPassword))
        return json({ error: "Dashboard password is incorrect." }, 401);
      if (!differentPasswords(body.dashboardPassword, body.newAccountPassword))
        return json({ error: "Account password must differ from Dashboard password." }, 400);
      const passwordHash = await hashAccountPassword(body.newAccountPassword);
      const result = await supabaseRest<string>("rpc/account_consume_challenge", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_target_user_id: actor.userId,
          p_primary_digest: actor.primaryDigest, p_challenge_id: body.challengeId,
          p_new_password_hash: passwordHash, p_expected_credential_version: challenge.credential_version,
          p_request_id: randomUUID(),
        }),
      });
      return json({ outcome: result }, result === "ok" ? 200 : 409);
    }
    if (body.action === "unlock") {
      if (typeof body.accountPassword !== "string" || body.accountPassword.length > 1024)
        return json({ error: "Invalid Account password." }, 400);
      const requestId = randomUUID();
      const attemptId = randomUUID();
      const reservation = await supabaseRest<Array<{ allowed: boolean; attempt_id: string; password_hash: string | null }>>("rpc/account_reserve_attempt", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_user_id: actor.userId,
          p_primary_digest: actor.primaryDigest, p_request_id: requestId, p_attempt_id: attemptId,
        }),
      });
      const row = reservation[0];
      if (!row || row.attempt_id !== attemptId || !row.allowed)
        return json({ error: "Account unlock is temporarily limited. Try again later." }, 429);
      const verified = row.password_hash ? await verifyAccountPassword(body.accountPassword, row.password_hash).catch(() => false) : false;
      const token = randomBytes(32).toString("base64url");
      const tokenDigest = digest(token);
      const result = await supabaseRest<string>("rpc/account_finish_attempt", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_user_id: actor.userId,
          p_primary_digest: actor.primaryDigest, p_request_id: requestId,
          p_verified: verified, p_token_digest: verified ? tokenDigest : null,
          p_stepup_id: verified ? randomUUID() : null,
        }),
      });
      if (result !== "succeeded") return json({ error: result === "failed" ? "Incorrect Account password." : "Account unlock could not be completed." }, result === "failed" ? 401 : 409);
      (await cookies()).set(ACCOUNT_STEPUP_COOKIE, token, {
        httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 15 * 60,
      });
      return json({ outcome: "unlocked" });
    }
    if (body.action === "lock") {
      if (!actor.stepupDigest) {
        await clearStepupCookie();
        return json({ outcome: "already_locked" });
      }
      const result = await supabaseRest<string>("rpc/account_lock_session", {
        method: "POST", body: JSON.stringify({
          p_tenant_id: actor.tenantId, p_user_id: actor.userId,
          p_primary_digest: actor.primaryDigest, p_stepup_digest: actor.stepupDigest,
          p_request_id: randomUUID(),
        }),
      });
      if (result !== "locked" && result !== "already_locked")
        return json({ error: "Server lock could not be confirmed. Please retry." }, 503);
      await clearStepupCookie();
      return json({ outcome: result });
    }
    return json({ error: "Unknown Account action." }, 400);
  } catch (error) {
    if (body.action === "setup" && error instanceof Error && error.message === "Invalid Account password length")
      return json({ error: "Choose an Account password with 12–128 characters." }, 400);
    return json({ error: "Account security is temporarily unavailable." }, 503);
  }
}
