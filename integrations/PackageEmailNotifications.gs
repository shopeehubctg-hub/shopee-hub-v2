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

// Pair each start/end entry before grouping; preserve every Campaign range.
function packageEmailPeriods_(startValue, endValue) {
  const parse = value => String(value || '').split('|').map(part => {
    const match = part.trim().match(/^(?:(Non-Campaign|Campaign)\s+)?(\d{4}-\d{2}-\d{2})$/i);
    return match ? {label: match[1] ? (/^non/i.test(match[1]) ? 'Non-Campaign' : 'Campaign') : '', date: match[2]} : null;
  });
  const starts = parse(startValue), ends = parse(endValue);
  const fallback = () => ['开始日期：' + String(startValue || '未填写'), '结束日期：' + String(endValue || '未填写')];
  if (starts.some(x => !x) || ends.some(x => !x)) return fallback();
  const commonEnd = ends.length === 1 && !ends[0].label;
  if (!commonEnd && starts.length !== ends.length) return fallback();
  const ranges = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i], end = commonEnd ? ends[0] : ends[i];
    if ((start.label && end.label && start.label !== end.label) || start.date > end.date) return fallback();
    const range = {label: start.label || end.label || 'Package', start: start.date, end: end.date};
    if (!ranges.some(x => x.label === range.label && x.start === range.start && x.end === range.end)) ranges.push(range);
  }
  const format = x => x.start === x.end ? x.start : x.start + ' ~ ' + x.end;
  if (ranges.every(x => x.start === ranges[0].start && x.end === ranges[0].end)) {
    const shared = ranges.some(x => x.label === 'Non-Campaign') && ranges.some(x => x.label === 'Campaign');
    return ['Package Period: ' + format(ranges[0]) + (shared ? '（Campaign & Non-Campaign 相同）' : '')];
  }
  return ['Non-Campaign', 'Campaign', 'Package'].flatMap(label => {
    const group = ranges.filter(x => x.label === label).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    return group.map((x, i) => label + (group.length > 1 ? ' ' + (i + 1) : '') + ' Period: ' + format(x));
  });
}

function packageEmailTime_(value) {
  const raw = String(value || '未填写');
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return raw;
  const date = new Date(raw);
  return isNaN(date.getTime()) ? raw : Utilities.formatDate(date, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd HH:mm') + '（马来西亚时间）';
}

function packageEmailMessage_(row, rowNumber, suppliedSummary) {
  const clean = value => String(value || '未填写').replace(/\s+/g, ' ').trim().slice(0, 200);
  const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const store = clean(row[3]);
  const packageName = clean(row[4]);
  const periods = packageEmailPeriods_(row[8], row[9]);
  const timestamp = packageEmailTime_(row[0]);
  const summary = suppliedSummary || String(row[18] || '').trim() || (Number(row[5]) === 1 ? '新开配套' :
    packageSyncRequest_({action: 'changes', changeId: String(row[1])}).summary);
  if (!summary || typeof summary !== 'string') throw new Error('Package change summary is missing.');
  const link = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID +
    '/edit#gid=' + packageEmailSheet_().getSheetId() + '&range=A' + rowNumber;
  return {
    subject: '【Shopee Package 调整通知】' + store + '｜' + packageName,
    body: 'Hiii Esther，Shopee Package 有需要调整哦\n\n' +
      '店铺：' + store + '\n' +
      'Package：' + packageName + '\n' +
      '修改内容：' + summary + '\n\n' +
      '修改记录时间：' + timestamp + '\n' +
      periods.join('\n') + '\n\n' +
      '点击查看 Package History：' + link + '\n',
    htmlBody: '<p>Hiii Esther，Shopee Package 有需要调整哦</p>' +
      '<p>店铺：' + escapeHtml(store) + '<br>' +
      'Package：' + escapeHtml(packageName) + '<br>' +
      '修改内容：' + escapeHtml(summary) + '</p>' +
      '<p>修改记录时间：' + escapeHtml(timestamp) + '<br>' +
      periods.map(escapeHtml).join('<br>') + '</p>' +
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
    const rows = sheet.getRange(cursor + 1, 1, count, 19).getDisplayValues();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = cursor + i + 1;
      if (!row[1] || !row[3] || !row[4]) {
        throw new Error('Incomplete Package History row ' + rowNumber + '.');
      }
      if (!row[18]) {
        const result = packageSyncRequest_({action: 'changes', changeId: String(row[1])});
        if (Number(result.version) !== Number(row[5])) throw new Error('Package summary version differs.');
        packageHistorySetSummary_(sheet, rowNumber, row[1], result.summary);
        row[18] = result.summary;
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
    const recent = historySheet.getRange(Math.max(2, last - 99), 1, Math.min(last - 1, 100), 19).getDisplayValues();
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

// Read-only rendering test from the user's real Package History entry.
function sendPackagePeriodEmailTest() {
  const sheet = packageEmailSheet_();
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getDisplayValues();
  let selected = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][3] === 'Scale Gem Collagen by CTG4u' && rows[i][4] === 'October Package C') { selected = i; break; }
  }
  if (selected < 0) throw new Error('October Package C history not found.');
  const message = packageEmailMessage_(rows[selected], selected + 2);
  console.log(message.body);
  MailApp.sendEmail({to: packageEmailConfig_(), subject: '[测试：日期排版] ' + message.subject, body: message.body, htmlBody: message.htmlBody});
}
