import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { assertDeploymentIsolation } from "../../../../../deployment-isolation";
import { getDb } from "../../../../../../db";
import { sql } from "drizzle-orm";
import { assertStagingDriveStorageConfigured, saveStagingDriveRefreshToken } from "../../../image-drive";

const origin = "https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app";
const path = "/api/packages/images/oauth/callback";
const email = "shopeehub.ctg@gmail.com";
const cookie = "__Secure-package-drive-oauth";
const driveScope = "https://www.googleapis.com/auth/drive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (assertDeploymentIsolation() !== "staging" || url.origin !== origin) return new Response(null, {status:404});
  if ((await getChatGPTUser())?.email?.toLowerCase() !== email) return new Response(null, {status:403});
  const clientId = process.env.PACKAGE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.PACKAGE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return new Response("Staging OAuth client is not configured.", {status:503});
  try {
    assertStagingDriveStorageConfigured();
    const db = await getDb();
    await db.execute(sql`select singleton from private.package_drive_oauth where singleton = true`);
  } catch {
    return new Response("Staging Drive token storage is unavailable.", {status:503});
  }
  const redirectUri = origin + path;
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) return new Response("Google authorization was declined.", {status:400});

  if (!code) {
    if (url.searchParams.get("start") !== "1") return new Response(null, {status:400});
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const params = new URLSearchParams({
      client_id:clientId, redirect_uri:redirectUri, response_type:"code", state,
      code_challenge:createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method:"S256", access_type:"offline", prompt:"consent", login_hint:email,
      scope:`openid email ${driveScope}`,
    });
    const reply = NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params);
    reply.cookies.set(cookie, state + "." + verifier, {httpOnly:true, secure:true, sameSite:"lax", path, maxAge:600});
    return reply;
  }

  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const [state, verifier] = (jar.get(cookie)?.value ?? "").split(".");
  if (!state || !verifier || state !== url.searchParams.get("state")) return new Response("Invalid authorization session.", {status:400});
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method:"POST", signal:AbortSignal.timeout(10000), body:new URLSearchParams({
        grant_type:"authorization_code", code, client_id:clientId, client_secret:clientSecret,
        redirect_uri:redirectUri, code_verifier:verifier,
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokens.refresh_token !== "string" || typeof tokens.access_token !== "string") throw Error();
    const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers:{Authorization:`Bearer ${tokens.access_token}`}, signal:AbortSignal.timeout(10000),
    });
    const identity = await identityResponse.json();
    if (!identityResponse.ok || identity.email !== email || identity.email_verified !== true) throw Error();
    if (typeof tokens.scope !== "string" || !tokens.scope.split(/\s+/).includes(driveScope)) {
      return new Response("Google Drive access was not granted. Restart authorization and select Google Drive access.", {
        status: 403, headers: {"Referrer-Policy":"no-referrer","Cache-Control":"no-store"},
      });
    }
    await saveStagingDriveRefreshToken(tokens.refresh_token);
    const reply = NextResponse.redirect(origin + "/?section=packages");
    reply.cookies.set(cookie, "", {httpOnly:true,secure:true,sameSite:"lax",path,maxAge:0});
    reply.headers.set("Referrer-Policy","no-referrer");
    return reply;
  } catch {
    return new Response("Staging Drive authorization could not be saved.", {status:503,headers:{"Referrer-Policy":"no-referrer","Cache-Control":"no-store"}});
  }
}
