import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "shopee_hub_portal_session";
const PUBLIC_PAGES = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
]);
const PUBLIC_AUTH_APIS = new Set([
  "/api/auth/login",
  "/api/auth/recover",
  "/api/auth/password",
  "/api/auth/session",
]);

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hasValidSession(request: NextRequest) {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!value || !secret) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!validSignature) return false;
    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as { email?: string; exp?: number };
    return Boolean(
      session.email && session.exp && session.exp > Date.now() / 1000,
    );
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PAGES.has(pathname) || PUBLIC_AUTH_APIS.has(pathname)) {
    return NextResponse.next();
  }
  if (await hasValidSession(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "returnTo",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
