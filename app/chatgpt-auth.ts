import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { portalSecurityEnabled, registeredPortalSessionValid } from "./portal-session-store";
import { assertDeploymentIsolation } from "./deployment-isolation";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
export const PORTAL_SESSION_COOKIE = "shopee_hub_portal_session";
export const PASSWORD_RESET_COOKIE = "shopee_hub_password_reset";
const MAX_SESSION_COOKIE_LENGTH = 1024;
type PortalSessionPayload = { email: string; exp: number; sid?: string };

function sessionSecret() {
  assertDeploymentIsolation();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is unavailable");
  return secret;
}

function signPortalSession(value: PortalSessionPayload) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function createPortalSession(email: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  return signPortalSession({ email:email.toLowerCase(), exp:Math.floor(Date.now()/1000)+maxAgeSeconds });
}

/** Prepare a random main-session ID; persist its digest before setting the returned cookie. */
export function createPortalSessionWithId(email: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now()/1000)+maxAgeSeconds;
  const cookie = signPortalSession({ email:email.toLowerCase(), exp:expiresAt, sid:sessionId });
  return { cookie, sessionId, expiresAt };
}

export function createPasswordResetRequest(email: string) {
  return createPortalSession(email, 60 * 30);
}

export function readPasswordResetRequest(value: string | undefined) {
  return readPortalSession(value);
}

function readPortalSession(value: string | undefined): string | null {
  return parsePortalSession(value)?.email ?? null;
}

/** Signature and expiry only. The caller must separately verify persistent session state and revocation. */
export function readPortalSessionWithId(value: string | undefined): { email: string; expiresAt: number; sessionId: string } | null {
  const parsed = parsePortalSession(value);
  return parsed?.sid ? { email: parsed.email, expiresAt: parsed.exp, sessionId: parsed.sid } : null;
}

function validSessionId(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 32 && bytes.toString("base64url") === value;
}

function parsePortalSession(value: string | undefined): PortalSessionPayload | null {
  if (!value || value.length > MAX_SESSION_COOKIE_LENGTH) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload,signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256",sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature,"base64url");
  if (received.length !== expected.length || received.toString("base64url") !== signature || !timingSafeEqual(received,expected)) return null;
  try {
    const decoded = Buffer.from(payload,"base64url");
    if (decoded.toString("base64url") !== payload) return null;
    const parsed = JSON.parse(decoded.toString("utf8")) as Partial<PortalSessionPayload> | null;
    if (!parsed || typeof parsed.email !== "string" || !parsed.email || parsed.email.length > 320 ||
        !Number.isSafeInteger(parsed.exp) || parsed.exp! <= Date.now()/1000 ||
        (parsed.sid !== undefined && !validSessionId(parsed.sid))) return null;
    return { email: parsed.email.toLowerCase(), exp: parsed.exp!, ...(parsed.sid ? { sid: parsed.sid } : {}) };
  } catch { return null; }
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  if (portalSecurityEnabled()) {
    // Old cookies and proxy headers alone cannot prove a registered, revocable primary session.
    try {
      const requestHeaders = await headers();
      const signed = readPortalSessionWithId((await cookies()).get(PORTAL_SESSION_COOKIE)?.value);
      const proxyEmail = process.env.VERCEL === "1" ? null : requestHeaders.get(USER_EMAIL_HEADER);
      if (!signed || proxyEmail && proxyEmail.toLowerCase() !== signed.email ||
          !await registeredPortalSessionValid(signed.email, signed.sessionId)) return null;
      return { displayName:signed.email, email:signed.email, fullName:null };
    } catch { return null; }
  }
  const requestHeaders = await headers();
  // Public Vercel requests cannot assert an identity through proxy headers.
  // Vercel portal identity must come from the server-signed session cookie.
  const email = process.env.VERCEL === "1" ? null : requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) {
    const portalEmail = readPortalSession((await cookies()).get(PORTAL_SESSION_COOKIE)?.value);
    return portalEmail ? { displayName:portalEmail, email:portalEmail, fullName:null } : null;
  }

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
