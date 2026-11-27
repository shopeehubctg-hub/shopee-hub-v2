import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

function stagingEncryptionKey() {
  if (assertDeploymentIsolation() !== "staging" || !process.env.PACKAGE_DRIVE_CLIENT_ID) {
    throw new Error("Staging Drive secrets are unavailable.");
  }
  const key = Buffer.from(process.env.PACKAGE_DRIVE_TOKEN_KEY ?? "", "base64url");
  if (key.length !== 32) throw new Error("Staging Drive token encryption key is unavailable.");
  return key;
}

function stagingTokenBinding() {
  return Buffer.from(`package-drive:v1:ubjfuveoqbvouryldqfu:j-packaging:${process.env.PACKAGE_DRIVE_CLIENT_ID}`);
}

export function assertStagingDriveStorageConfigured() {
  stagingEncryptionKey();
}

export async function saveStagingDriveRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stagingEncryptionKey(), iv);
  cipher.setAAD(stagingTokenBinding());
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const value = "v1." + [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
  const db = await getDb();
  await db.execute(sql`insert into private.package_drive_oauth (singleton, encrypted_token)
    values (true, ${value}) on conflict (singleton) do update set encrypted_token = excluded.encrypted_token`);
}

async function readStagingDriveRefreshToken() {
  const key = stagingEncryptionKey();
  const db = await getDb();
  const rows: {encrypted_token: string}[] = await db.execute<{encrypted_token: string}>(sql`
    select encrypted_token from private.package_drive_oauth where singleton = true`);
  if (!rows[0]) return undefined;
  const [version, ...parts] = rows[0].encrypted_token.split(".");
  if (version !== "v1" || parts.length !== 3) throw new Error("Invalid Drive token envelope.");
  const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(stagingTokenBinding());
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

import { assertDeploymentIsolation } from "../../deployment-isolation";

export async function packageImageDriveToken() {
  if (assertDeploymentIsolation() !== "staging") throw new Error("Image upload is unavailable in this environment.");
  const { PACKAGE_DRIVE_CLIENT_ID, PACKAGE_DRIVE_CLIENT_SECRET } = process.env;
  const PACKAGE_DRIVE_REFRESH_TOKEN = PACKAGE_DRIVE_CLIENT_ID && PACKAGE_DRIVE_CLIENT_SECRET ? await readStagingDriveRefreshToken() : undefined;
  if (!PACKAGE_DRIVE_CLIENT_ID || !PACKAGE_DRIVE_CLIENT_SECRET || !PACKAGE_DRIVE_REFRESH_TOKEN) {
    throw new Error("Staging Drive authorization is required.");
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
  if (!response.ok || typeof result.access_token !== "string") throw new Error("Staging Drive authorization failed.");
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
