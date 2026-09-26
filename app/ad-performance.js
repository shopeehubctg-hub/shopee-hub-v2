export function aggregateAdPerformanceByDate(rows) {
  const dates = new Map();
  for (const row of rows) {
    const date = row.performance_date;
    if (!date) continue;
    const daily = dates.get(date) ?? {
      date, store: "All Stores", spend: 0, sales: 0, roas: 0,
      views: 0, clicks: 0, ctr: 0, conversion: 0, sold: 0, acos: 0,
      storeIds: new Set(),
    };
    daily.spend += Number(row.spend) || 0;
    daily.sales += Number(row.sales) || 0;
    daily.views += Number(row.views) || 0;
    daily.clicks += Number(row.clicks) || 0;
    daily.conversion += Number(row.conversions) || 0;
    daily.sold += Number(row.sold) || 0;
    daily.storeIds.add(row.store_id);
    dates.set(date, daily);
  }
  return [...dates.values()].map((daily) => ({
    ...daily,
    storeIds: [...daily.storeIds],
    roas: daily.spend > 0 ? daily.sales / daily.spend : 0,
    ctr: daily.views > 0 ? daily.clicks / daily.views : 0,
    acos: daily.sales > 0 ? daily.spend / daily.sales : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function authorizedAdStoreIds(visibleStores, selectedStore, canViewAdvertising) {
  if (!canViewAdvertising) return [];
  return selectedStore ? [selectedStore.id] : visibleStores.map((store) => store.id);
}

export function latestAdSyncTime(rows) {
  let latest = null;
  let latestMs = -Infinity;
  for (const row of rows) {
    const time = row.synced_at;
    const ms = Date.parse(time);
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = time;
      latestMs = ms;
    }
  }
  return latest;
}

export function selectedAdDateFor(requestedDate, availableDates) {
  const latest = availableDates[0] ?? "";
  const earliest = availableDates[availableDates.length - 1] ?? "";
  return requestedDate && requestedDate >= earliest && requestedDate <= latest ? requestedDate : latest;
}

export function selectAdRows(rows, mode, { month, date, rangeStart, rangeEnd, latestDate }) {
  return rows.filter((row) => mode === "mtd"
    ? row.date.startsWith(latestDate.slice(0, 7)) && row.date <= latestDate
    : mode === "month"
    ? row.date.startsWith(month)
    : mode === "range"
      ? row.date >= rangeStart && row.date <= rangeEnd
      : row.date === date);
}

export function aggregateSelectedAdRows(rows) {
  if (!rows.length) return null;
  const totals = rows.reduce((total, row) => ({
    spend: total.spend + row.spend,
    sales: total.sales + row.sales,
    views: total.views + row.views,
    clicks: total.clicks + row.clicks,
    conversion: total.conversion + row.conversion,
    sold: total.sold + row.sold,
  }), { spend: 0, sales: 0, views: 0, clicks: 0, conversion: 0, sold: 0 });
  return {
    ...totals,
    roas: totals.spend > 0 ? totals.sales / totals.spend : 0,
    acos: totals.sales > 0 ? totals.spend / totals.sales : 0,
    ctr: totals.views > 0 ? totals.clicks / totals.views : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    conversionRate: totals.clicks > 0 ? totals.conversion / totals.clicks : 0,
    costPerConversion: totals.conversion > 0 ? totals.spend / totals.conversion : null,
  };
}
