const CONFIG = Object.freeze({
  tenantId: 'j-packaging',
  sheetName: 'WhatsApp Group',
  logSheet: '_LinkDirectorySyncLog',
  sourceSheetId: '1iMNKdNs5tqgXgWUQhtg-UhWcb0mP3SlGYbTOyx4avkc',
  timezone: 'Asia/Kuala_Lumpur',
  batchSize: 200,
});

const REQUIRED_HEADERS = Object.freeze([
  'Store Name',
  'Project',
  'Project Group Link',
  'Store Group Link',
  'Google Drive Link',
  'Ads Top Up List',
]);

const FIXED_STORE_IDS = Object.freeze({
  'Kata Skincare Malaysia': 'shopee-kata-marine-malaysia',
  'Kata Skincare Singapore': 'shopee-kata-singapore',
  'Supu': 'shopee-supu',
});

const HIDDEN_STORE_IDS = Object.freeze(['shopee-kata-care-malaysia']);
const VALID_MARKETS = Object.freeze(['MY', 'SG']);
const VALID_TOP_UP_OWNERS = Object.freeze(['Client', 'Client Approval', 'Shopee Hub']);

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Dashboard Sync')
    .addItem('Sync now', 'syncLinkDirectoryToSupabase')
    .addItem('Prepare Store ID + Market columns', 'prepareLinkDirectoryColumns')
    .addItem('Install edit + 5-minute triggers', 'installLinkDirectoryTriggers')
    .addItem('Test Supabase connection', 'testSupabaseConnection')
    .addToUi();
}

function testSupabaseConnection() {
  const stores = fetchStores_();
  SpreadsheetApp.getUi().alert(`Supabase connected. ${stores.length} stores found.`);
}

function prepareLinkDirectoryColumns() {
  const sheet = getDirectorySheet_();
  const table = readTable_(sheet);
  const storeIdColumn = ensureHeader_(sheet, table.headers, 'Store ID');
  const marketColumn = ensureHeader_(sheet, table.headers, 'Market');
  const refreshed = readTable_(sheet);
  const stores = fetchStores_();
  const links = fetchLinkDirectoryStores_();
  const indexes = buildIndexes_(stores, links);
  const outputIds = [];
  const outputMarkets = [];

  refreshed.rows.forEach(row => {
    const storeName = clean_(row.values['Store Name']);
    const currentId = clean_(row.values['Store ID']);
    const currentMarket = normalizeMarket_(row.values.Market);
    const resolved = resolveExistingStore_(storeName, currentId, indexes);
    const fixedId = FIXED_STORE_IDS[storeName] || '';
    const storeId = currentId || fixedId || (resolved && resolved.id) || '';
    const market = currentMarket || marketFromPlatform_(resolved && resolved.platform) || (storeName === 'Supu' ? 'MY' : '');
    outputIds.push([storeId]);
    outputMarkets.push([market]);
  });

  if (refreshed.rows.length) {
    sheet.getRange(2, storeIdColumn, refreshed.rows.length, 1).setValues(outputIds);
    sheet.getRange(2, marketColumn, refreshed.rows.length, 1).setValues(outputMarkets);
    const validation = SpreadsheetApp.newDataValidation()
      .requireValueInList(VALID_MARKETS, true)
      .setAllowInvalid(false)
      .setHelpText('Choose MY or SG. New stores are not synced until Market is set.')
      .build();
    sheet.getRange(2, marketColumn, Math.max(refreshed.rows.length, 1), 1).setDataValidation(validation);
  }
  sheet.autoResizeColumn(storeIdColumn);
  sheet.autoResizeColumn(marketColumn);
  writeLog_('prepare', 'success', refreshed.rows.length, 'Store ID and Market columns prepared');
}

function installLinkDirectoryTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => ['onLinkDirectoryEdit_', 'syncLinkDirectoryToSupabase'].includes(trigger.getHandlerFunction()))
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('onLinkDirectoryEdit_')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  ScriptApp.newTrigger('syncLinkDirectoryToSupabase')
    .timeBased()
    .everyMinutes(5)
    .create();
  writeLog_('trigger', 'success', 2, 'Installed edit and 5-minute recovery triggers');
}

function onLinkDirectoryEdit_(event) {
  if (!event || !event.range || event.range.getSheet().getName() !== CONFIG.sheetName) return;
  if (event.range.getRow() === 1) return;
  syncLinkDirectoryToSupabase();
}

function syncLinkDirectoryToSupabase() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const started = Date.now();
  try {
    prepareLinkDirectoryColumns();
    const sheet = getDirectorySheet_();
    const table = readTable_(sheet);
    const stores = fetchStores_();
    const links = fetchLinkDirectoryStores_();
    const indexes = buildIndexes_(stores, links);
    const usedIds = new Set(stores.map(store => store.id));
    const storeById = Object.fromEntries(stores.map(store => [store.id, store]));
    const grouped = {};
    const warnings = [];
    const helperIds = [];
    const helperMarkets = [];

    table.rows.forEach(row => {
      const storeName = clean_(row.values['Store Name']);
      if (!storeName) {
        helperIds.push([clean_(row.values['Store ID'])]);
        helperMarkets.push([normalizeMarket_(row.values.Market)]);
        return;
      }

      const currentId = clean_(row.values['Store ID']);
      const existing = resolveExistingStore_(storeName, currentId, indexes);
      let storeId = currentId || FIXED_STORE_IDS[storeName] || (existing && existing.id) || '';
      let market = normalizeMarket_(row.values.Market) || marketFromPlatform_(existing && existing.platform);
      if (storeName === 'Supu') market = 'MY';
      if (!market) {
        warnings.push(`Row ${row.rowNumber}: ${storeName} needs Market (MY/SG)`);
        helperIds.push([storeId]);
        helperMarkets.push(['']);
        return;
      }
      if (!storeId) storeId = createStoreId_(storeName, market, usedIds);
      usedIds.add(storeId);
      helperIds.push([storeId]);
      helperMarkets.push([market]);
      if (HIDDEN_STORE_IDS.includes(storeId)) return;

      if (!grouped[storeId]) {
        grouped[storeId] = {
          storeId,
          storeName,
          market,
          adsTopUpOwner: normalizeTopUpOwner_(row.values['Ads Top Up List'], row.rowNumber, warnings),
          storeGroupLink: clean_(row.values['Store Group Link']),
          googleDriveLink: clean_(row.values['Google Drive Link']),
          projects: {},
        };
      } else {
        mergeStoreFields_(grouped[storeId], row.values, row.rowNumber, warnings);
      }
      const projectName = clean_(row.values.Project);
      const projectLink = clean_(row.values['Project Group Link']);
      if (projectName && projectLink) grouped[storeId].projects[projectName] = projectLink;
      else if (projectName || projectLink) warnings.push(`Row ${row.rowNumber}: project name/link is incomplete for ${storeName}`);
    });

    const storeIdColumn = table.headers.indexOf('Store ID') + 1;
    const marketColumn = table.headers.indexOf('Market') + 1;
    if (table.rows.length) {
      sheet.getRange(2, storeIdColumn, table.rows.length, 1).setValues(helperIds);
      sheet.getRange(2, marketColumn, table.rows.length, 1).setValues(helperMarkets);
    }

    const now = new Date().toISOString();
    const directoryStores = Object.values(grouped);
    const storesPayload = directoryStores.map(entry => {
      const prior = storeById[entry.storeId];
      return {
        id: entry.storeId,
        tenant_id: CONFIG.tenantId,
        // Preserve an admin-edited display name; Sheet names remain source identifiers.
        name: prior && prior.name ? prior.name : entry.storeName,
        platform: `Shopee ${entry.market}`,
        bigseller_name: prior && prior.bigseller_name ? prior.bigseller_name : entry.storeName,
      };
    });
    upsert_('stores', 'id', storesPayload);

    const linksPayload = directoryStores.map(entry => ({
      store_id: entry.storeId,
      tenant_id: CONFIG.tenantId,
      store_name: entry.storeName,
      ads_top_up_owner: entry.adsTopUpOwner || null,
      store_group_link: entry.storeGroupLink || null,
      google_drive_link: entry.googleDriveLink || null,
      source_sheet_id: CONFIG.sourceSheetId,
      source_tab: CONFIG.sheetName,
      synced_at: now,
    }));
    upsert_('link_directory_stores', 'store_id', linksPayload);

    directoryStores.forEach(entry => {
      request_('/rest/v1/link_directory_projects?store_id=eq.' + encodeURIComponent(entry.storeId), 'delete');
      const projects = Object.entries(entry.projects).map(([name, link]) => ({
        store_id: entry.storeId,
        project_name: name,
        project_group_link: link,
      }));
      upsert_('link_directory_projects', 'store_id,project_name', projects);
    });

    const activeIds = new Set(directoryStores.map(entry => entry.storeId));
    links.filter(link => link.source_sheet_id === CONFIG.sourceSheetId && !activeIds.has(link.store_id))
      .forEach(link => request_(
        '/rest/v1/link_directory_stores?store_id=eq.' + encodeURIComponent(link.store_id) +
        '&source_sheet_id=eq.' + encodeURIComponent(CONFIG.sourceSheetId),
        'delete'
      ));

    writeLog_('sync', warnings.length ? 'warning' : 'success', directoryStores.length,
      JSON.stringify({ stores: directoryStores.length, warnings }), started);
  } catch (error) {
    writeLog_('sync', 'failed', 0, error && error.stack ? error.stack : String(error), started);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getDirectorySheet_() {
  const book = SpreadsheetApp.getActive();
  if (book.getId() !== CONFIG.sourceSheetId) throw new Error('This script must be bound to the Link Directory spreadsheet');
  const sheet = book.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error(`Missing sheet: ${CONFIG.sheetName}`);
  return sheet;
}

function readTable_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error(`${CONFIG.sheetName} is empty`);
  const headers = values[0].map(clean_);
  REQUIRED_HEADERS.forEach(header => {
    if (!headers.includes(header)) throw new Error(`${CONFIG.sheetName} missing header: ${header}`);
  });
  const rows = values.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, cells[column]])),
  }));
  return { headers, rows };
}

function ensureHeader_(sheet, headers, header) {
  const existing = headers.indexOf(header);
  if (existing >= 0) return existing + 1;
  const column = headers.length + 1;
  const sourceHeader = sheet.getRange(1, Math.max(1, column - 1));
  sourceHeader.copyTo(sheet.getRange(1, column), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(1, column).setValue(header);
  headers.push(header);
  return column;
}

function fetchStores_() {
  return request_('/rest/v1/stores?select=id,name,bigseller_name,platform&tenant_id=eq.' + encodeURIComponent(CONFIG.tenantId), 'get');
}

function fetchLinkDirectoryStores_() {
  return request_('/rest/v1/link_directory_stores?select=store_id,store_name,source_sheet_id&tenant_id=eq.' + encodeURIComponent(CONFIG.tenantId), 'get');
}

function buildIndexes_(stores, links) {
  const byId = {};
  const byName = {};
  stores.forEach(store => {
    byId[store.id] = store;
    [store.name, store.bigseller_name].filter(Boolean).forEach(name => { byName[clean_(name).toLowerCase()] = store; });
  });
  links.forEach(link => {
    const store = byId[link.store_id];
    if (store) byName[clean_(link.store_name).toLowerCase()] = store;
  });
  return { byId, byName };
}

function resolveExistingStore_(storeName, storeId, indexes) {
  const fixedId = FIXED_STORE_IDS[storeName];
  return indexes.byId[storeId] || indexes.byId[fixedId] || indexes.byName[clean_(storeName).toLowerCase()] || null;
}

function createStoreId_(storeName, market, usedIds) {
  const ascii = clean_(storeName).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store';
  let candidate = `shopee-${slug}`;
  if (!usedIds.has(candidate)) return candidate;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${storeName}|${market}`);
  const suffix = bytes.slice(0, 4).map(value => (value + 256).toString(16).slice(-2)).join('');
  return `${candidate}-${suffix}`;
}

function mergeStoreFields_(target, values, rowNumber, warnings) {
  const owner = normalizeTopUpOwner_(values['Ads Top Up List'], rowNumber, warnings);
  const group = clean_(values['Store Group Link']);
  const drive = clean_(values['Google Drive Link']);
  if (!target.adsTopUpOwner && owner) target.adsTopUpOwner = owner;
  if (!target.storeGroupLink && group) target.storeGroupLink = group;
  if (!target.googleDriveLink && drive) target.googleDriveLink = drive;
}

function normalizeTopUpOwner_(value, rowNumber, warnings) {
  const cleaned = clean_(value);
  if (!cleaned) return '';
  if (VALID_TOP_UP_OWNERS.includes(cleaned)) return cleaned;
  warnings.push(`Row ${rowNumber}: invalid Ads Top Up List value "${cleaned}"`);
  return '';
}

function normalizeMarket_(value) {
  const market = clean_(value).toUpperCase();
  return VALID_MARKETS.includes(market) ? market : '';
}

function marketFromPlatform_(platform) {
  const value = clean_(platform).toUpperCase();
  if (/\bSG\b|SINGAPORE/.test(value)) return 'SG';
  if (/\bMY\b|MALAYSIA/.test(value)) return 'MY';
  return '';
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
  const response = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + path, {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: Object.assign({
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    }, extraHeaders || {}),
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
  if (sheet.getLastRow() === 0) sheet.appendRow(['Timestamp', 'Scope', 'Status', 'Rows', 'Duration ms', 'Detail']);
  sheet.appendRow([new Date(), scope, status, rows, started ? Date.now() - started : 0, detail || '']);
}

function clean_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}
