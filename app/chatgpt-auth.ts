import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

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

function sessionSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is unavailable");
  return secret;
}

export function createPortalSession(email: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const payload = Buffer.from(JSON.stringify({ email:email.toLowerCase(), exp:Math.floor(Date.now()/1000)+maxAgeSeconds })).toString("base64url");
  const signature = createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readPortalSession(value: string | undefined): string | null {
  if (!value) return null;
  const [payload,signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256",sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature,"base64url");
  if (received.length !== expected.length || !timingSafeEqual(received,expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {email?:string;exp?:number};
    return parsed.email && parsed.exp && parsed.exp > Date.now()/1000 ? parsed.email.toLowerCase() : null;
  } catch { return null; }
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
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
