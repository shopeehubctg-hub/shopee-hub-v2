import { and, eq, isNull } from "drizzle-orm";
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

  const files = [];
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
  // Fail closed until image records can reserve Drive IDs and reconcile retries.
  return Response.json({ error: "Package image persistence is not configured." }, { status: 503 });
}
