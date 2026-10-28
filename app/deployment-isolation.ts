import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export const STAGING_SUPABASE_REF = "ubjfuveoqbvouryldqfu";
export const PRODUCTION_SUPABASE_REF = "zwnmonnbmqncwoytdigd";

type RuntimeEnv = Record<string, string | undefined>;
type Target = "staging" | "production" | "local";

export function deploymentTarget(env: RuntimeEnv = process.env): Target {
  const vercel = env.VERCEL_ENV;
  const declared = env.DASHBOARD_ENVIRONMENT;
  if (vercel && !["preview", "production", "development"].includes(vercel))
    throw Error("Deployment environment is invalid.");
  if (env.VERCEL === "1" && !vercel) throw Error("Deployment environment is missing.");
  if (declared && !["staging", "production", "local"].includes(declared))
    throw Error("Dashboard environment is invalid.");
  if (vercel === "preview") {
    if (declared && declared !== "staging") throw Error("Preview environment must use Staging configuration.");
    return "staging";
  }
  if (vercel === "production") {
    if (declared && declared !== "production") throw Error("Production environment must use Production configuration.");
    return "production";
  }
  return declared === "staging" || declared === "production" ? declared : "local";
}

function projectRefFromDatabaseUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (direct) return direct[1];
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)) return null;
  let username: string;
  try { username = decodeURIComponent(url.username); } catch { return null; }
  return /^postgres\.([a-z0-9]{20})$/.exec(username)?.[1] ?? null;
}

function jwtIdentity(secret: string): { ref: string | null; role: string | null } | null {
  const parts = secret.split(".");
  if (parts.length !== 3) return null;
  try {
    if (parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw Error("Invalid JWT encoding.");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { ref?: unknown; role?: unknown };
    return {
      ref: typeof claims.ref === "string" ? claims.ref : null,
      role: typeof claims.role === "string" ? claims.role : null,
    };
  } catch { return { ref: null, role: null }; }
}

/** Blocks a deployed Preview from using Production Supabase credentials or a mixed pooler. */
export function assertDeploymentIsolation(env: RuntimeEnv = process.env): Target {
  const target = deploymentTarget(env);
  if (target === "local") return target;
  const ref = target === "staging" ? STAGING_SUPABASE_REF : PRODUCTION_SUPABASE_REF;
  let supabaseUrl: URL;
  try { supabaseUrl = new URL(env.SUPABASE_URL ?? ""); }
  catch { throw Error(`${target} Supabase URL is unavailable.`); }
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${ref}.supabase.co` || supabaseUrl.port ||
    supabaseUrl.username || supabaseUrl.password ||
    supabaseUrl.pathname !== "/" || supabaseUrl.search || supabaseUrl.hash)
    throw Error(`${target} Supabase URL points to the wrong project.`);
  const secret = env.SUPABASE_SECRET_KEY;
  if (!secret) throw Error(`${target} Supabase service key is unavailable.`);
  const identity = jwtIdentity(secret);
  if (identity && (identity.ref !== ref || identity.role !== "service_role"))
    throw Error(`${target} Supabase service key has the wrong project or role.`);
  if (target === "staging") {
    const fingerprint = env.STAGING_SUPABASE_SECRET_SHA256;
    if (fingerprint !== undefined && !/^[a-f0-9]{64}$/i.test(fingerprint))
      throw Error("Staging Supabase service key fingerprint is unavailable.");
    if (fingerprint !== undefined) {
      const actual = createHash("sha256").update(secret).digest();
      const expected = Buffer.from(fingerprint, "hex");
      if (!timingSafeEqual(actual, expected)) throw Error("Staging Supabase service key does not match its configured fingerprint.");
    } else if (!identity) {
      throw Error("Staging Supabase service key fingerprint is unavailable.");
    }
  }
  if (env.DATABASE_URL && projectRefFromDatabaseUrl(env.DATABASE_URL) !== ref)
    throw Error(`${target} database URL points to the wrong project.`);
  return target;
}

export function stagingRecipientAllowed(email: string, env: RuntimeEnv = process.env) {
  if (deploymentTarget(env) !== "staging") return true;
  assertDeploymentIsolation(env);
  const allowed = (env.STAGING_AUTH_RECIPIENT_ALLOWLIST ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
