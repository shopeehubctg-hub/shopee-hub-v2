import { assertDeploymentIsolation, deploymentTarget } from "../../deployment-isolation";

export type HistorySyncResult =
  | { status: "synced" }
  | { status: "pending" | "failed"; reason: string };

// The Apps Script webhook deduplicates by Change ID. A second POST can confirm
// a write whose first response was lost without adding another history row.
export async function syncHistoryToGoogleSheet(payload: Record<string, unknown>): Promise<HistorySyncResult> {
  const webhookUrl = process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_HISTORY_SECRET;
  const target = deploymentTarget();
  if (target === "staging") {
    assertDeploymentIsolation();
    // A test publish completes its database lifecycle with a local receipt.
    // Neither inherited Production webhook URLs nor their credentials are used.
    return { status: "synced" };
  }
  if (target === "production") assertDeploymentIsolation();
  if (!webhookUrl || !secret) return { status: "pending", reason: "Google Sheets webhook is not configured" };
  if (webhookUrl === "staging://package-history-receipt") return { status: "failed", reason: "Staging receipt is unavailable outside Staging" };

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
