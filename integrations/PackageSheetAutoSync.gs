// Add to the existing Fulfilment Sheet project. Uses its existing
// HISTORY_SECRET property and SPREADSHEET_ID / HISTORY_SHEET constants.
const PACKAGE_SYNC_URL = 'https://shopee-hub-v2-260731.vercel.app/api/packages/sync-pending';

function packageSyncRequest_(body) {
  const secret = PropertiesService.getScriptProperties().getProperty('HISTORY_SECRET');
  if (!secret) throw new Error('HISTORY_SECRET is missing.');
  const payload = JSON.stringify(body);
  const time = String(Date.now());
  const signature = Utilities.computeHmacSha256Signature('package-sheet-sync\n' + time + '\n' + payload, secret)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  const response = UrlFetchApp.fetch(PACKAGE_SYNC_URL, {
    method: 'post', contentType: 'application/json', payload: payload,
    headers: {'x-package-sync-time': time, 'x-package-sync-signature': signature},
    muteHttpExceptions: true, followRedirects: false,
  });
  let result;
  try { result = JSON.parse(response.getContentText()); } catch (_) { throw new Error('Dashboard returned an invalid sync response.'); }
  if (response.getResponseCode() !== 200 || !result.ok) throw new Error('Dashboard sync failed (HTTP ' + response.getResponseCode() + ').');
  return result;
}

function packageSyncWrite_(payload) {
  if (!payload || !payload.changeId || !payload.store || !payload.packageName) throw new Error('Incomplete queued history entry.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
    if (!sheet) throw new Error('Package History sheet not found.');
    const rows = sheet.getRange(1, 2, Math.max(sheet.getLastRow(), 1), 5).getDisplayValues();
    const matches = rows.filter(row => row[0] === String(payload.changeId));
    if (matches.length > 1) throw new Error('Duplicate Change ID in Package History: ' + payload.changeId);
    if (matches.length === 1) {
      const row = matches[0];
      if (row[2] !== String(payload.store) || row[3] !== String(payload.packageName) || row[4] !== String(payload.version)) {
        throw new Error('Package History differs from the saved version: ' + payload.changeId);
      }
      return false;
    }
    sheet.appendRow([
      payload.timestamp, payload.changeId, payload.projectOwner, payload.store,
      payload.packageName, payload.version, payload.action, payload.promotionType,
      payload.startDate, payload.endDate, payload.shopeeSku, payload.lazadaSku,
      payload.tiktokSku, payload.addedComponents, payload.removedComponents,
      payload.currentComponents, payload.changedBy, 'Synced',
    ]);
    SpreadsheetApp.flush();
    return true;
  } finally { lock.releaseLock(); }
}

function packageSyncFailure_(message) {
  const p = PropertiesService.getScriptProperties();
  const recipient = p.getProperty('EMAIL_RECIPIENT');
  const previous = p.getProperty('PACKAGE_SYNC_ERROR');
  const notifiedAt = Number(p.getProperty('PACKAGE_SYNC_ERROR_NOTIFIED_AT') || 0);
  p.setProperty('PACKAGE_SYNC_ERROR', message);
  if (recipient && MailApp.getRemainingDailyQuota() > 0 &&
      (previous !== message || Date.now() - notifiedAt > 24 * 60 * 60 * 1000)) {
    MailApp.sendEmail(recipient, '【ShopeeHub】Package 自动同步需要检查',
      'Package 自动同步暂时未完成。已保留待同步记录，下次会再次检查。\n\n' + message +
      '\n\nDashboard: https://shopee-hub-v2-260731.vercel.app/?section=packages');
    p.setProperty('PACKAGE_SYNC_ERROR_NOTIFIED_AT', String(Date.now()));
  }
}

function checkPackageSheetAutoSync() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('PACKAGE_SYNC_ENABLED') !== 'true') return;
  // A user lock prevents overlapping scheduled runs. Do not hold the script
  // lock during network calls: the normal save webhook uses that lock too.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return;
  try {
    const result = packageSyncRequest_({action: 'pull'});
    if (!Array.isArray(result.entries)) throw new Error('Dashboard sync queue is invalid.');
    const versionIds = [];
    let added = 0;
    result.entries.forEach(entry => {
      if (!entry.versionId) throw new Error('Queued version ID is missing.');
      if (packageSyncWrite_(entry.payload)) added++;
      versionIds.push(entry.versionId);
    });
    const confirmed = versionIds.length ? packageSyncRequest_({action: 'confirm', versionIds: versionIds}).confirmed : [];
    if (!Array.isArray(confirmed)) throw new Error('Dashboard sync confirmation is invalid.');
    p.setProperties({PACKAGE_SYNC_LAST_RUN: new Date().toISOString(), PACKAGE_SYNC_LAST_RESULT:
      JSON.stringify({queued: versionIds.length, added: added, confirmed: confirmed.length})});
    p.deleteProperty('PACKAGE_SYNC_ERROR');
    p.deleteProperty('PACKAGE_SYNC_ERROR_NOTIFIED_AT');
    console.log('Package Sheet sync: ' + p.getProperty('PACKAGE_SYNC_LAST_RESULT'));
  } catch (error) {
    packageSyncFailure_(String(error.message || error));
    throw error;
  } finally { lock.releaseLock(); }
}

function installPackageSheetAutoSync() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('HISTORY_SECRET')) throw new Error('HISTORY_SECRET is missing.');
  // Test the connection before enabling the schedule.
  packageSyncRequest_({action: 'pull'});
  p.setProperty('PACKAGE_SYNC_ENABLED', 'true');
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'checkPackageSheetAutoSync')) {
    ScriptApp.newTrigger('checkPackageSheetAutoSync').timeBased().everyMinutes(5).create();
  }
  checkPackageSheetAutoSync();
}
