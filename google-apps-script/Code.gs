const CONFIG = Object.freeze({
  tenantId: 'j-packaging',
  balanceSheet: 'Sheet1',
  performanceSheet: 'FullAd',
  logSheet: '_SyncLog',
  batchSize: 200,
  timezone: 'Asia/Kuala_Lumpur',
});

const STORE_ALIASES = Object.freeze({
  'Scale Story SG by CTG4u': 'Scale Story SG',
  'Zeero Skincare SG by CTG4u': 'Zeero Skincare SG',
  'LivAct Singapore': 'livact.os.sg',
  'Naturelish GoHerb SG': 'Go Herb Singapore',
  'SkinDae SG by CTG4u': 'SkinDae SG',
  'Kata Skincare Singapore': 'KATA Singapore',
  'Naturelish Recovit SG by CTG4u': 'Naturelish Healthcare Singapore',
  'MCS Skincare SG by CTG4u': 'MCS Singapore',
  'NomoQ by CTG4u': 'NomoQ Malaysia',
  'DrSmile Whitening SG by CTG4u': 'Dr Smile Whitening SG by CTG4u.sg',
  'Bonlife Singapore': 'Bonlife SG',
  'Naturelish Bugucare by CTG4u': 'Bugucare by Naturelish',
  'CTG4u Malaysia': 'CTG4U Malaysia',
  'Naturelish Uro360 by CTG4u': 'Uro360 by CTG4u',
  'NatureLish Recovit by CTG4u': 'NatureLish Healthcare',
  'MCS Skincare by CTG4u': 'MCS Malaysia',
  'Zeero Skincare Official': 'Zeero MY',
  'SkinDae MY by CTG4u': 'SkinDae Official Store',
  'Naturelish Eco Plus by CTG4u': 'Eco Plus by Naturelish',
  'Kata Skincare Malaysia': 'KATA Marine Malaysia',
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Supabase Sync')
    .addItem('Sync now', 'syncAdsToSupabase')
    .addItem('Install daily 9:05 + 17:05 triggers', 'installDailyTrigger')
    .addItem('Test connection', 'testSupabaseConnection')
    .addToUi();
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncAdsToSupabase')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('syncAdsToSupabase').timeBased().atHour(9).nearMinute(5).everyDays(1).inTimezone(CONFIG.timezone).create();
  ScriptApp.newTrigger('syncAdsToSupabase').timeBased().atHour(17).nearMinute(5).everyDays(1).inTimezone(CONFIG.timezone).create();
  writeLog_('trigger', 'success', 0, 'Daily triggers installed for approximately 9:05 am and 5:05 pm');
}

function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  const stores = fetchStores_();
  const message = `Supabase connected. ${stores.length} stores found.`;
  console.log(message);
  SpreadsheetApp.getActive().toast(message, 'Supabase Sync', 8);
  return message;
}

function syncAdsToSupabase() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const started = Date.now();
  try {
    const storeIndex = buildStoreIndex_(fetchStores_());
    const balanceResult = syncBalances_(storeIndex);
    const performanceResult = syncPerformance_(storeIndex);
    const warnings = [...new Set([...balanceResult.unmatched, ...performanceResult.unmatched])];
    const detail = JSON.stringify({ balances: balanceResult.count, daily: performanceResult.count,
      sourceLatestDate: performanceResult.latestDate, unmatched: warnings });
    writeLog_('full', warnings.length ? 'warning' : 'success', balanceResult.count + performanceResult.count, detail, started);
  } catch (error) {
    writeLog_('full', 'failed', 0, error && error.stack ? error.stack : String(error), started);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function syncBalances_(storeIndex) {
  if (!SpreadsheetApp.getActive().getSheetByName(CONFIG.balanceSheet)) {
    console.log(`Skipping Ad Balance: missing sheet ${CONFIG.balanceSheet}`);
    return { count: 0, unmatched: [] };
  }
  const rows = sheetRows_(CONFIG.balanceSheet, ['Date', 'Store Name', 'Ad Balance (RM)']);
  const latestDate = rows.reduce((latest, row) => Math.max(latest, dateValue_(row.Date).getTime()), 0);
  const unmatched = [];
  const payload = rows.filter(row => dateValue_(row.Date).getTime() === latestDate).flatMap(row => {
    const sourceName = clean_(row['Store Name']);
    const store = resolveStore_(sourceName, storeIndex);
    const balance = Number(row['Ad Balance (RM)']);
    if (!store || !Number.isFinite(balance) || balance < 0) { unmatched.push(sourceName); return []; }
    return [{ tenant_id: CONFIG.tenantId, store_id: store.id, source_store_name: sourceName,
      balance_cents: Math.round(balance * 100), balance_date: isoDate_(dateValue_(row.Date)), imported_at: new Date().toISOString() }];
  });
  upsert_('ad_balances', 'store_id,balance_date', payload);
  return { count: payload.length, unmatched };
}

function syncPerformance_(storeIndex) {
  const headers = ['Date','Store Name','Spend','Sales','ROAS','Views','Clicks','CTR','Conversion','Sold','ACOS'];
  const rows = sheetRows_(CONFIG.performanceSheet, headers);
  const latestDate = rows.reduce((latest, row) => {
    const date = isoDate_(dateValue_(row.Date));
    return date > latest ? date : latest;
  }, '');
  const unmatched = [];
  const payload = rows.flatMap(row => {
    const sourceName = clean_(row['Store Name']);
    const store = resolveStore_(sourceName, storeIndex);
    const metrics = headers.slice(2).map(header => Number(row[header]));
    if (!store || metrics.some(value => !Number.isFinite(value))) { unmatched.push(sourceName); return []; }
    return [{ tenant_id: CONFIG.tenantId, store_id: store.id, source_store_name: sourceName,
      performance_date: isoDate_(dateValue_(row.Date)), spend: metrics[0], sales: metrics[1], roas: metrics[2],
      views: Math.round(metrics[3]), clicks: Math.round(metrics[4]), ctr: metrics[5], conversions: Math.round(metrics[6]),
      sold: Math.round(metrics[7]), acos: metrics[8], source: 'Google Sheets FullAd', synced_at: new Date().toISOString() }];
  });
  upsert_('ad_performance_daily', 'store_id,performance_date', payload);
  return { count: payload.length, latestDate: latestDate || null, unmatched };
}

function sheetRows_(sheetName, requiredHeaders) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(clean_);
  requiredHeaders.forEach(header => { if (!headers.includes(header)) throw new Error(`${sheetName} missing header: ${header}`); });
  return values.slice(1).filter(row => row.some(value => value !== '')).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function fetchStores_() {
  return request_('/rest/v1/stores?select=id,name,bigseller_name&tenant_id=eq.' + encodeURIComponent(CONFIG.tenantId), 'get');
}

function buildStoreIndex_(stores) {
  const index = {};
  stores.forEach(store => { [store.name, store.bigseller_name].filter(Boolean).forEach(name => index[storeKey_(name)] = store); });
  return index;
}

function resolveStore_(sourceName, index) {
  const sourceKey = storeKey_(sourceName);
  if (index[sourceKey]) return index[sourceKey];
  const aliasName = Object.keys(STORE_ALIASES).find(name => storeKey_(name) === sourceKey);
  return aliasName ? index[storeKey_(STORE_ALIASES[aliasName])] || null : null;
}

function upsert_(table, conflictColumns, rows) {
  for (let index = 0; index < rows.length; index += CONFIG.batchSize) {
    request_(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, 'post', rows.slice(index, index + CONFIG.batchSize), {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}

function request_(path, method, body, extraHeaders) {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = properties.getProperty('SUPABASE_URL');
  const secret = properties.getProperty('SUPABASE_SECRET_KEY');
  if (!baseUrl || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in Script Properties');
  const headers = Object.assign({ apikey: secret, 'Content-Type': 'application/json' }, extraHeaders || {});
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;
  const response = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + path, {
    method: method || 'get', muteHttpExceptions: true,
    headers,
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`Supabase ${code}: ${response.getContentText().slice(0, 500)}`);
  const text = response.getContentText();
  return text ? JSON.parse(text) : null;
}

function writeLog_(scope, status, rows, detail, started) {
  const book = SpreadsheetApp.getActive();
  const sheet = book.getSheetByName(CONFIG.logSheet) || book.insertSheet(CONFIG.logSheet);
  if (sheet.getLastRow() === 0) sheet.appendRow(['Timestamp','Scope','Status','Rows','Duration ms','Detail']);
  sheet.appendRow([new Date(), scope, status, rows, started ? Date.now() - started : 0, detail || '']);
}

function clean_(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function storeKey_(value) {
  return clean_(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function dateValue_(value) { const date = value instanceof Date ? value : new Date(value); if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`); return date; }
function isoDate_(date) { return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd'); }
