import { createHash } from "node:crypto";
import { packageImageDriveToken, uploadPackageImage } from "../image-drive";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customerUsers, packages, packageVersions, stores } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { assertDeploymentIsolation } from "../../../deployment-isolation";
import { canAccessModule, canAccessStore } from "../../../module-access";
import { packageImageDestination, packageImageName } from "../../../package-image-destination";

const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const uploadLimit = 4_000_000;

export async function POST(request: Request) {
  if (assertDeploymentIsolation() !== "staging") return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return new Response(null, { status: 401 });

  const db = await getDb();
  const [membership] = await db.select().from(customerUsers)
    .where(eq(customerUsers.email, user.email.toLowerCase())).limit(1);
  if (!membership?.active || !await canAccessModule(db, membership, "packages")) {
    return new Response(null, { status: 403 });
  }
  const length = Number(request.headers.get("content-length"));
  if (length > uploadLimit) return Response.json({ error: "Images exceed the upload size limit." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const packageId = form?.get("packageId");
  const version = Number(form?.get("version"));
  const project = form?.get("project");
  if (typeof packageId !== "string" || !Number.isSafeInteger(version) || version < 1 || typeof project !== "string") {
    return new Response(null, { status: 400 });
  }

  const [row] = await db.select({ package: packages, store: stores, version: packageVersions })
    .from(packages)
    .innerJoin(stores, and(eq(stores.id, packages.storeId), eq(stores.tenantId, packages.tenantId)))
    .innerJoin(packageVersions, and(eq(packageVersions.packageId, packages.id), eq(packageVersions.version, version)))
    .where(and(eq(packages.id, packageId), eq(packages.tenantId, membership.tenantId), isNull(packages.deletedAt))).limit(1);
  if (!row || row.store.serviceStatus !== "active" || !await canAccessStore(db, membership, row.store.id)) {
    return new Response(null, { status: 404 });
  }
  const folder = packageImageDestination(row.store.name, row.package.market, project || undefined);
  if (!folder) return Response.json({ error: "Media Resources is not configured for this project." }, { status: 422 });

  const files: { kind: "main" | "package"; image: File; name: string }[] = [];
  let totalSize = 0;
  for (const kind of ["main", "package"] as const) {
    const image = form?.get(kind);
    if (image == null) continue;
    if (typeof image === "string" || !image.size || !Object.hasOwn(extensions, image.type)) {
      return Response.json({ error: "Choose a JPG, PNG or WebP image." }, { status: 400 });
    }
    totalSize += image.size;
    const extension = extensions[image.type as keyof typeof extensions];
    files.push({ kind, image, name: packageImageName(row.package.name, kind, extension) });
  }
  if (!files.length) return new Response(null, { status: 400 });
  if (totalSize > uploadLimit) return new Response(null, { status: 413 });
  try {
    const token = await packageImageDriveToken();
    const saved: { kind: "main" | "package"; name: string; fileId: string }[] = [];
    for (const { kind, image, name } of files) {
      const hash = createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex");
      const idsResponse = await fetch("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      const ids = await idsResponse.json();
      const generatedId = ids.ids?.[0];
      if (!idsResponse.ok || typeof generatedId !== "string") throw new Error("Drive ID reservation failed");

      type ImageReservation = {drive_file_id: string; file_name: string; uploaded_at: string | null};
      const reservations: ImageReservation[] = await db.execute<ImageReservation>(sql`
        insert into public.package_image_versions
          (package_version_id, market, kind, folder_id, project_name, sha256, drive_file_id, file_name, mime_type, byte_size, actor)
        values (${row.version.id}, ${row.package.market}, ${kind}, ${folder}, ${project}, ${hash}, ${generatedId}, ${name}, ${image.type}, ${image.size}, ${user.email})
        on conflict (package_version_id, market, kind, folder_id, sha256) do update
          set drive_file_id = package_image_versions.drive_file_id
        returning drive_file_id, file_name, uploaded_at
      `);
      const record: ImageReservation | undefined = reservations[0];
      if (!record) throw new Error("Image reservation failed");
      if (!record.uploaded_at) {
        try {
          await uploadPackageImage(token, folder, record.file_name, image, record.drive_file_id);
        } catch {
          const existing = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(record.drive_file_id)}?fields=id,name,parents,trashed&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          });
          const file = await existing.json();
          if (!existing.ok || file.trashed || file.id !== record.drive_file_id ||
              file.name !== record.file_name || !file.parents?.includes(folder)) throw new Error("Drive verification failed");
        }
        await db.execute(sql`update public.package_image_versions set uploaded_at = coalesce(uploaded_at, now())
          where drive_file_id = ${record.drive_file_id}`);
      }
      saved.push({ kind, name: record.file_name, fileId: record.drive_file_id });
    }
    return Response.json({ images: saved });
  } catch {
    return Response.json({ error: "Image upload could not be confirmed. Retry the same images." }, { status: 503 });
  }
}
