const PENDING_SYNC_GRACE_MS = 15 * 60 * 1000;

export function blocksNewVersionForUnsyncedSheet(
  packageStatus: string,
  latestSyncStatus: string | null | undefined,
  latestCreatedAt: string | null | undefined,
  mode: "draft" | "publish",
  now = Date.now(),
) {
  if (mode !== "publish") return false;
  if (!["draft", "review"].includes(packageStatus)) {
    return latestSyncStatus === "pending" || latestSyncStatus === "failed";
  }
  if (latestSyncStatus !== "pending") return false;

  const createdAt = Date.parse(latestCreatedAt ?? "");
  return !Number.isFinite(createdAt) || now - createdAt < PENDING_SYNC_GRACE_MS;
}
