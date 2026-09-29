// Add alongside Code.gs in the bound Fulfilment Sheet Apps Script project.
// Uses the SPREADSHEET_ID and HISTORY_SHEET constants already in Code.gs.
// Set EMAIL_RECIPIENT in Script Properties before installing.
function packageEmailConfig_() {
  const recipient = PropertiesService.getScriptProperties().getProperty('EMAIL_RECIPIENT');
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Set a valid EMAIL_RECIPIENT in Script Properties first.');
  }
  return recipient;
}

function packageEmailSheet_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(HISTORY_SHEET);
  if (!sheet) throw new Error('Package History sheet not found.');
  return sheet;
}

// The first installation starts after the last existing history row.
// Reinstalling keeps the cursor and any pending rows.
function installPackageEmailNotifications() {
  packageEmailConfig_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty('EMAIL_LAST_ROW') === null) {
      const sheet = packageEmailSheet_();
      const last = Math.max(sheet.getLastRow(), 1);
      p.setProperties({
        EMAIL_LAST_ROW: String(last),
        EMAIL_LAST_ID: last > 1 ? sheet.getRange(last, 2).getDisplayValue() : '',
      });
    }
    if (!ScriptApp.getProjectTriggers().some(t =>
      t.getHandlerFunction() === 'checkPackageEmailNotifications')) {
      ScriptApp.newTrigger('checkPackageEmailNotifications').timeBased().everyMinutes(5).create();
    }
    p.setProperty('EMAIL_ENABLED', 'true');
    p.setProperty('WA_ENABLED', 'false');
  } finally {
    lock.releaseLock();
  }
}

function pausePackageEmailNotifications() {
  PropertiesService.getScriptProperties().setProperty('EMAIL_ENABLED', 'false');
}

function packageEmailMessage_(row, rowNumber, suppliedSummary) {
  const clean = value => String(value || '未填写').replace(/\s+/g, ' ').trim().slice(0, 200);
  const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const store = clean(row[3]);
  const packageName = clean(row[4]);
  const periodDate = value => {
    const dates = Array.from(new Set(String(value || '').match(/\b\d{4}-\d{2}-\d{2}\b/g) || []));
    return dates.length === 1 ? dates[0] : clean(value);
  };
  const startDate = periodDate(row[8]);
  const endDate = periodDate(row[9]);
  const timestamp = clean(row[0]);
  const summary = suppliedSummary || (Number(row[5]) === 1 ? '新开配套' :
    packageSyncRequest_({action: 'changes', changeId: String(row[1])}).summary);
  if (!summary || typeof summary !== 'string') throw new Error('Package change summary is missing.');
  const link = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID +
    '/edit#gid=' + packageEmailSheet_().getSheetId() + '&range=A' + rowNumber;
  return {
    subject: '【Shopee Package 调整通知】' + store + '｜' + packageName,
    body: 'Hiii Esther，Shopee Package 有需要调整哦\n\n' +
      '店铺：' + store + '\n' +
      'Package：' + packageName + '\n' +
      'Package Period: ' + startDate + ' ~ ' + endDate + '\n' +
      '修改记录时间：' + timestamp + '\n' +
      '修改内容：' + summary + '\n' +
      '点击查看 Package History：' + link + '\n',
    htmlBody: '<p>Hiii Esther，Shopee Package 有需要调整哦</p>' +
      '<p>店铺：' + escapeHtml(store) + '<br>' +
      'Package：' + escapeHtml(packageName) + '<br>' +
      'Package Period: ' + escapeHtml(startDate) + ' ~ ' + escapeHtml(endDate) + '<br>' +
      '修改记录时间：' + escapeHtml(timestamp) + '<br>' +
      '修改内容：' + escapeHtml(summary) + '</p>' +
      '<p><a href="' + escapeHtml(link) + '">点击查看 Package History</a></p>',
  };
}

function checkPackageEmailNotifications() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('EMAIL_ENABLED') !== 'true') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    if (p.getProperty('EMAIL_UNCERTAIN_ROW')) {
      throw new Error('Previous email outcome is uncertain. Check Sent mail before resuming to avoid duplicates.');
    }
    const recipient = packageEmailConfig_();
    const sheet = packageEmailSheet_();
    const cursor = Number(p.getProperty('EMAIL_LAST_ROW'));
    if (!Number.isInteger(cursor) || cursor < 1) {
      throw new Error('Email notification cursor missing. Run installer first.');
    }
    const last = sheet.getLastRow();
    if (last < cursor || (cursor > 1 &&
        sheet.getRange(cursor, 2).getDisplayValue() !== p.getProperty('EMAIL_LAST_ID'))) {
      throw new Error('History rows were removed or reordered. Restore append order before continuing.');
    }
    if (last === cursor) return;
    const count = Math.min(last - cursor, 10);
    if (MailApp.getRemainingDailyQuota() < count) {
      throw new Error('Email quota is too low for the next batch. Retry after quota resets.');
    }
    const rows = sheet.getRange(cursor + 1, 1, count, 18).getDisplayValues();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = cursor + i + 1;
      if (!row[1] || !row[3] || !row[4]) {
        throw new Error('Incomplete Package History row ' + rowNumber + '.');
      }
      const message = packageEmailMessage_(row, rowNumber);
      p.setProperty('EMAIL_UNCERTAIN_ROW', String(rowNumber));
      try {
        MailApp.sendEmail({to: recipient, subject: message.subject, body: message.body,
          htmlBody: message.htmlBody});
      } catch (error) {
        throw new Error('Email outcome uncertain for row ' + rowNumber + ': ' + error.message);
      }
      p.setProperties({
        EMAIL_LAST_ROW: String(rowNumber),
        EMAIL_LAST_ID: row[1],
        EMAIL_LAST_SENT_AT: new Date().toISOString(),
      });
      p.deleteProperty('EMAIL_UNCERTAIN_ROW');
    }
  } finally {
    lock.releaseLock();
  }
}

// Sends two labelled template examples without adding Package History rows.
function sendPackageEmailTest() {
  const recipient = packageEmailConfig_();
  if (MailApp.getRemainingDailyQuota() < 2) throw new Error('Email quota is exhausted.');
  const historySheet = packageEmailSheet_();
  const last = historySheet.getLastRow();
  if (last > 1) {
    const recent = historySheet.getRange(Math.max(2, last - 99), 1, Math.min(last - 1, 100), 18).getDisplayValues();
    const savedEdit = recent.reverse().find(row => Number(row[5]) > 1 && row[1]);
    if (savedEdit) console.log('Latest saved edit summary: ' + packageSyncRequest_({action: 'changes', changeId: String(savedEdit[1])}).summary);
  }
  const sample = ['2026-09-29 13:12', 'test', '', '示例店铺', 'Package A', '1', 'Created', '',
    '2026-10-01', '2026-10-31'];
  const message = packageEmailMessage_(sample, 2);
  MailApp.sendEmail({
    to: recipient,
    subject: '[测试] ' + message.subject,
    body: message.body,
    htmlBody: message.htmlBody,
  });
  const editSample = sample.slice();
  editSample[5] = '2';
  editSample[6] = 'Version Updated';
  const edited = packageEmailMessage_(editSample, 2, 'Disc Price 修改 ｜Package SKU 修改 ｜OXM Inventory SKU 修改');
  MailApp.sendEmail({to: recipient, subject: '[测试：Edit existing] ' + edited.subject,
    body: edited.body, htmlBody: edited.htmlBody});
}
