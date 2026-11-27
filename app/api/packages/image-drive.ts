import "server-only";
import { assertDeploymentIsolation } from "../../deployment-isolation";

export async function packageImageDriveToken() {
  if (assertDeploymentIsolation() !== "staging") throw new Error("Image upload is unavailable in this environment.");
  const { PACKAGE_DRIVE_CLIENT_ID, PACKAGE_DRIVE_CLIENT_SECRET, PACKAGE_DRIVE_REFRESH_TOKEN } = process.env;
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
