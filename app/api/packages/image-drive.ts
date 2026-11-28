import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { assertDeploymentIsolation, PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from "../../deployment-isolation";

export const packageDriveTenant = "j-packaging";
export const packageDriveOwner = "shopeehub.ctg@gmail.com";

export function packageDriveOrigin() {
  const environment = assertDeploymentIsolation();
  if (environment === "staging") {
    return "https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app";
  }
  if (environment === "production") return "https://shopee-hub-v2-260731.vercel.app";
  return null;
}

export function packageDriveUploadsEnabled() {
  const environment = assertDeploymentIsolation();
  return environment === "staging" ||
    (environment === "production" && process.env.NEXT_PUBLIC_PACKAGE_DRIVE_PRODUCTION_UPLOADS_ENABLED === "1");
}

function driveEncryptionKey() {
  if (!packageDriveOrigin() || !process.env.PACKAGE_DRIVE_CLIENT_ID) {
    throw new Error("Drive secrets are unavailable.");
  }
  const key = Buffer.from(process.env.PACKAGE_DRIVE_TOKEN_KEY ?? "", "base64url");
  if (key.length !== 32) throw new Error("Drive token encryption key is unavailable.");
  return key;
}

function driveTokenBinding() {
  const ref = assertDeploymentIsolation() === "staging" ? STAGING_SUPABASE_REF : PRODUCTION_SUPABASE_REF;
  return Buffer.from(`package-drive:v1:${ref}:${packageDriveTenant}:${process.env.PACKAGE_DRIVE_CLIENT_ID}`);
}

export function assertPackageDriveStorageConfigured() {
  driveEncryptionKey();
}

export async function savePackageDriveRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", driveEncryptionKey(), iv);
  cipher.setAAD(driveTokenBinding());
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const value = "v1." + [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
  const db = await getDb();
  await db.execute(sql`insert into private.package_drive_oauth (singleton, encrypted_token)
    values (true, ${value}) on conflict (singleton) do update set encrypted_token = excluded.encrypted_token`);
}

async function readPackageDriveRefreshToken() {
  const key = driveEncryptionKey();
  const db = await getDb();
  const rows: {encrypted_token: string}[] = await db.execute<{encrypted_token: string}>(sql`
    select encrypted_token from private.package_drive_oauth where singleton = true`);
  if (!rows[0]) return undefined;
  const [version, ...parts] = rows[0].encrypted_token.split(".");
  if (version !== "v1" || parts.length !== 3) throw new Error("Invalid Drive token envelope.");
  const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(driveTokenBinding());
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}


export async function packageImageDriveToken() {
  if (!packageDriveOrigin()) throw new Error("Image upload is unavailable in this environment.");
  const { PACKAGE_DRIVE_CLIENT_ID, PACKAGE_DRIVE_CLIENT_SECRET } = process.env;
  const PACKAGE_DRIVE_REFRESH_TOKEN = PACKAGE_DRIVE_CLIENT_ID && PACKAGE_DRIVE_CLIENT_SECRET ? await readPackageDriveRefreshToken() : undefined;
  if (!PACKAGE_DRIVE_CLIENT_ID || !PACKAGE_DRIVE_CLIENT_SECRET || !PACKAGE_DRIVE_REFRESH_TOKEN) {
    throw new Error("Drive authorization is required.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: PACKAGE_DRIVE_CLIENT_ID,
      client_secret: PACKAGE_DRIVE_CLIENT_SECRET,
      refresh_token: PACKAGE_DRIVE_REFRESH_TOKEN,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") throw new Error("Drive authorization failed.");
  return result.access_token as string;
}

export async function uploadPackageImage(token: string, folderId: string, name: string, image: Blob, fileId: string) {
  const boundary = crypto.randomUUID();
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ id: fileId, name, parents: [folderId], mimeType: image.type }),
    `\r\n--${boundary}\r\nContent-Type: ${image.type}\r\n\r\n`,
    image,
    `\r\n--${boundary}--\r\n`,
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,parents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || result.id !== fileId || !result.parents?.includes(folderId)) {
    throw new Error("Drive did not confirm the image in its expected folder.");
  }
  return fileId;
}
