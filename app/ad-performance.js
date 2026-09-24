export function aggregateAdPerformanceByDate(rows) {
  const dates = new Map();
  for (const row of rows) {
    const date = row.performance_date;
    if (!date) continue;
    const daily = dates.get(date) ?? {
      date, store: "All Stores", spend: 0, sales: 0, roas: 0,
      views: 0, clicks: 0, ctr: 0, conversion: 0, sold: 0, acos: 0,
    };
    daily.spend += Number(row.spend) || 0;
    daily.sales += Number(row.sales) || 0;
    daily.views += Number(row.views) || 0;
    daily.clicks += Number(row.clicks) || 0;
    daily.conversion += Number(row.conversions) || 0;
    daily.sold += Number(row.sold) || 0;
    dates.set(date, daily);
  }
  return [...dates.values()].map((daily) => ({
    ...daily,
    roas: daily.spend > 0 ? daily.sales / daily.spend : 0,
    ctr: daily.views > 0 ? daily.clicks / daily.views : 0,
    acos: daily.sales > 0 ? daily.spend / daily.sales : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function authorizedAdStoreIds(visibleStores, selectedStore, canViewAdvertising) {
  if (!canViewAdvertising) return [];
  return selectedStore ? [selectedStore.id] : visibleStores.map((store) => store.id);
}

export function selectedAdDateFor(requestedDate, availableDates) {
  const latest = availableDates[0] ?? "";
  const earliest = availableDates[availableDates.length - 1] ?? "";
  return requestedDate && requestedDate >= earliest && requestedDate <= latest ? requestedDate : latest;
}

export function selectAdRows(rows, mode, { month, date, rangeStart, rangeEnd }) {
  return rows.filter((row) => mode === "month"
    ? row.date.startsWith(month)
    : mode === "range"
      ? row.date >= rangeStart && row.date <= rangeEnd
      : row.date === date);
}
