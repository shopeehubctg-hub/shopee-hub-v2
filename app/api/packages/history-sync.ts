export type HistorySyncResult =
  | { status: "synced" }
  | { status: "pending" | "failed"; reason: string };

// The Apps Script webhook deduplicates by Change ID. A second POST can confirm
// a write whose first response was lost without adding another history row.
export async function syncHistoryToGoogleSheet(payload: Record<string, unknown>): Promise<HistorySyncResult> {
  const webhookUrl = process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_HISTORY_SECRET;
  if (!webhookUrl || !secret) return { status: "pending", reason: "Google Sheets webhook is not configured" };

  // Isolated package QC uses a local receipt so synthetic TEST packages never
  // reach the real customer history Sheet. Production cannot enable this path.
  if (webhookUrl === "staging://package-history-receipt") {
    const isolatedPreview = process.env.VERCEL_ENV === "preview"
      && process.env.VERCEL_GIT_COMMIT_REF === "codex/package-batch-history-staging-candidate"
      && process.env.SUPABASE_URL === "https://ubjfuveoqbvouryldqfu.supabase.co";
    return isolatedPreview
      ? { status: "synced" }
      : { status: "failed", reason: "Staging receipt is unavailable outside isolated Preview" };
  }

  let reason = "Google Sheets webhook failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, secret }),
        signal: AbortSignal.timeout(22000),
      });
      if (!response.ok) {
        reason = `Webhook returned ${response.status}`;
        if (response.status < 500) break;
        continue;
      }
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (result?.ok) return { status: "synced" };
      reason = result?.error ?? "Webhook did not confirm the write";
      if (result) break;
    } catch (error) {
      reason = error instanceof Error ? error.message : "Google Sheets webhook failed";
    }
  }
  return { status: "failed", reason };
}
