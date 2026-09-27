const DAY_MS = 86_400_000;

function previousDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

export function assessAdsFreshness({ now, latestBusinessDate, lastWriteAt, storeCount, coveredStoreCount }) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  // Source rows have arrived after the 09:05 trigger; allow the afternoon run its +/-15 minute window.
  const expectedBusinessDate = previousDate(today, minutes >= 17 * 60 + 20 ? 1 : 2);
  const expectedWriteBy = minutes >= 17 * 60 + 20
    ? `${today}T17:20:00+08:00`
    : minutes >= 9 * 60 + 20
      ? `${today}T09:20:00+08:00`
      : `${previousDate(today, 1)}T17:20:00+08:00`;
  const expectedWriteWindowStart = minutes >= 17 * 60 + 20
    ? `${today}T16:50:00+08:00`
    : minutes >= 9 * 60 + 20
      ? `${today}T08:50:00+08:00`
      : `${previousDate(today, 1)}T16:50:00+08:00`;

  return {
    checkedAt: now.toISOString(),
    expectedBusinessDate,
    latestBusinessDate,
    businessDateStatus: !latestBusinessDate ? "no_data" : latestBusinessDate > today ? "future_date" : latestBusinessDate < expectedBusinessDate ? "delayed" : "current",
    lastWriteAt,
    expectedWriteBy,
    writeStatus: !lastWriteAt ? "no_data" : Date.parse(lastWriteAt) < Date.parse(expectedWriteWindowStart) ? "delayed" : "recent",
    coverage: { storeCount, coveredStoreCount, missingStoreCount: storeCount - coveredStoreCount },
  };
}
