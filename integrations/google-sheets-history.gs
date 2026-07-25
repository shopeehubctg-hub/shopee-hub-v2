const SPREADSHEET_ID = "1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA";
const HISTORY_SHEET = "Package History";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("HISTORY_SECRET");
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
    if (!sheet) return jsonResponse({ ok: false, error: "Package History sheet not found" });

    const existing = sheet.getRange(1, 2, Math.max(sheet.getLastRow(), 1), 1)
      .getDisplayValues().flat();
    if (existing.includes(String(payload.changeId))) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    sheet.appendRow([
      payload.timestamp,
      payload.changeId,
      payload.projectOwner,
      payload.store,
      payload.packageName,
      payload.version,
      payload.action,
      payload.promotionType,
      payload.startDate,
      payload.endDate,
      payload.shopeeSku,
      payload.lazadaSku,
      payload.tiktokSku,
      payload.addedComponents,
      payload.removedComponents,
      payload.currentComponents,
      payload.changedBy,
      "Synced",
    ]);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
