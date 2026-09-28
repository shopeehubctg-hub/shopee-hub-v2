export function blocksNewVersionForUnsyncedSheet(
  packageStatus: string,
  latestSyncStatus: string | null | undefined,
  mode: "draft" | "publish",
) {
  return mode === "publish"
    && !["draft", "review"].includes(packageStatus)
    && (latestSyncStatus === "pending" || latestSyncStatus === "failed");
}
