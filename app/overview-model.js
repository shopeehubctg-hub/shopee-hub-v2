const METRIC_LABELS = ["Valid Order Sales", "Valid Orders", "Customers", "Sales per Customer"];

function displayValue(value) {
  return value == null || value === "" || value === "暂无数据" ? "—" : String(value);
}

function dataCutoff(snapshot, payload) {
  if (payload?.sourceUpdated) return payload.sourceUpdated;
  if (!snapshot?.importedAt) return null;
  const importedAt = new Date(snapshot.importedAt);
  return Number.isNaN(importedAt.getTime())
    ? null
    : `${new Intl.DateTimeFormat("en-MY", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Kuala_Lumpur" }).format(importedAt)} MYT`;
}

export function buildOverviewState(snapshot, source) {
  const payload = source && snapshot?.payload && typeof snapshot.payload === "object" ? snapshot.payload : null;
  const metricsByLabel = new Map(
    Array.isArray(payload?.overview)
      ? payload.overview.filter(row => Array.isArray(row) && typeof row[0] === "string").map(row => [row[0], row])
      : [],
  );

  return {
    payload,
    metrics: METRIC_LABELS.map(label => {
      const row = metricsByLabel.get(label);
      const value = displayValue(row?.[1]);
      const trend = displayValue(row?.[2]);
      return [label, value, value === "—" || trend === "—" ? "" : trend];
    }),
    asOf: payload ? dataCutoff(snapshot, payload) : null,
    period: payload?.period || null,
  };
}
