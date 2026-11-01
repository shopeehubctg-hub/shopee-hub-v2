const SPREADSHEET_ID = "1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA";
const HISTORY_SHEET = "Package History";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("HISTORY_SECRET");
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }
    if (!payload.changeId || !payload.packageName || !payload.store) {
      return jsonResponse({ ok: false, error: "Incomplete package history entry" });
    }

    const added = packageSyncWrite_(payload);
    return jsonResponse({ok: true, duplicate: !added});
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
