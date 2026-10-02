import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import React, { act } from 'react';

const outputDir = new URL('../node_modules/.package-save-history-test/', import.meta.url);
await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [new URL('../app/package-control.tsx', import.meta.url).pathname],
  outfile: new URL('package-control.mjs', outputDir).pathname,
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  packages: 'external', logLevel: 'silent',
});
const { PackageControl } = await import(pathToFileURL(new URL('package-control.mjs', outputDir).pathname));

test('Save Changes refreshes and auto-opens metadata-only history without crashing', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://local.test/' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const prices = [
    { market: 'MY', priceType: 'non_campaign', originalPrice: 500, sellingPrice: 450, promotionType: 'monthly', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' },
    { market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 450, promotionType: 'custom', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' },
    { market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 450, promotionType: 'custom', effectiveFrom: '2026-10-14', effectiveTo: '2026-10-15' },
  ];
  const metadata = { _packageMetadata: { name: 'Kata Combo C PWP' }, _packageHistorySummary: { schema: 1, summary: '配套资料修改' } };
  const base = {
    id: 'kata-package', storeId: 'kata-store', storeName: 'Kata Skincare Malaysia',
    packageSku: 'KATA-C', name: 'Kata Combo C PWP', market: 'MY', status: 'scheduled',
    version: 2, promotionType: 'custom', originalPrice: 50000, sellingPrice: 46000,
    effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10',
    components: [{ inventorySku: 'KATA-ITEM', name: 'Kata Item', quantity: 1, kind: 'product' }],
    platforms: [{ platform: 'Shopee', packageSku: 'KATA-C' }], priceSchedules: prices,
  };
  let saved = false;
  let posts = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (url, options = {}) => {
    if (options.method === 'POST') {
      posts++;
      const request = JSON.parse(options.body);
      assert.equal(request.packageId, 'kata-package');
      assert.equal(request.expectedVersion, posts === 1 ? 2 : 3);
      assert.ok(request.priceSchedules.every(line => line.sellingPrice === '450'), 'matching prices must remain unchanged across both date types');
      const expectedCampaignPeriods = [
        ['2026-10-01', posts === 1 ? '2026-10-31' : '2026-11-02'],
        ['2026-10-14', '2026-10-15'],
      ];
      if (posts === 2) expectedCampaignPeriods.push(['2026-11-14', '2026-11-15']);
      assert.deepEqual(request.priceSchedules.filter(line => line.priceType === 'campaign').map(line => [line.effectiveFrom, line.effectiveTo]), expectedCampaignPeriods,
        'editing package details must retain existing Campaign periods and accept an added period');
      saved = true;
      return { ok: true, status: 200, json: async () => ({ packageId: 'kata-package', version: 2 + posts }) };
    }
    const item = { ...base, version: saved ? 2 + posts : 2, history: saved ? [{
      version: 3, name: base.name, market: 'MY', platforms: base.platforms,
      components: base.components, priceSchedules: prices, changeNote: 'Changes from Version 2',
      promotionType: 'custom', effectiveFrom: base.effectiveFrom, effectiveTo: base.effectiveTo,
      addedComponents: [], removedComponents: [], sheetSyncStatus: 'synced',
      createdAt: '2026-10-02T05:43:59Z', createdBy: 'editor@example.com',
      calculatorSettings: metadata,
    }] : [] };
    return { ok: true, json: async () => ({ packages: [item], source: 'database', canDelete: false }) };
  }});
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PackageControl, { storeId: 'kata-store', storeName: 'Kata Skincare Malaysia' })));
    const click = label => {
      const button = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === label);
      assert.ok(button, `Missing button: ${label}`);
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    };
    await act(async () => click('Edit / Modify'));
    assert.ok(dom.window.document.querySelector('.package-modal'));
    assert.equal(dom.window.document.querySelector('.same-pricing-toggle input').checked, true);
    assert.equal(dom.window.document.querySelectorAll('.campaign-period-list input[type="date"]').length, 4);
    await act(async () => click('Save Changes'));
    assert.equal(posts, 1);
    assert.equal(dom.window.document.querySelector('.package-modal'), null);
    assert.ok(dom.window.document.querySelector('.version-history'), 'history should auto-open');
    assert.match(dom.window.document.body.textContent, /Changes saved · Version 3/);
    assert.match(dom.window.document.body.textContent, /Kata Combo C PWP/);
    assert.equal(dom.window.document.querySelector('.calculator-history'), null);
    await act(async () => click('Edit / Modify'));
    const firstCampaignEnd = dom.window.document.querySelector('.campaign-period-list .date-fields:nth-child(1) input[type="date"]:nth-of-type(2)')
      ?? dom.window.document.querySelectorAll('.campaign-period-list input[type="date"]')[1];
    assert.ok(firstCampaignEnd, 'existing package should expose Campaign end dates');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(firstCampaignEnd, '2026-11-02');
      firstCampaignEnd.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      firstCampaignEnd.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await act(async () => click('+ Add Campaign Date Range'));
    const addedDates = dom.window.document.querySelectorAll('.campaign-period-list input[type="date"]');
    assert.equal(addedDates.length, 6);
    for (const [input,value] of [[addedDates[4], '2026-11-14'], [addedDates[5], '2026-11-15']]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }
    await act(async () => click('Save Changes'));
    assert.equal(posts, 2, 'extending an existing Campaign period should save a new version');
    assert.match(dom.window.document.body.textContent, /Changes saved · Version 4/);
  } finally {
    await act(async () => root.unmount());
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});

test('View History opens a legacy metadata-only package without editing it', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://local.test/' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const history = {
    version: 2, name: 'Kata Combo C PWP', market: 'MY',
    platforms: [{ platform: 'Shopee', packageSku: 'KATA-C' }],
    components: [{ inventorySku: 'KATA-ITEM', name: 'Kata Item', quantity: 1, kind: 'product' }],
    priceSchedules: [{ market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 460,
      promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10' }],
    changeNote: 'Existing edit', promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10',
    addedComponents: [], removedComponents: [], sheetSyncStatus: 'synced',
    createdAt: '2026-10-02T05:43:59Z', createdBy: 'editor@example.com',
    calculatorSettings: { _packageMetadata: { name: 'Kata Combo C PWP' },
      _packageHistorySummary: { schema: 1, summary: '配套资料修改' } },
  };
  let posts = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (_url, options = {}) => {
    if (options.method === 'POST') posts++;
    return { ok: true, json: async () => ({ packages: [{
      id: 'kata-package', storeId: 'kata-store', storeName: 'Kata Skincare Malaysia',
      packageSku: 'KATA-C', name: 'Kata Combo C PWP', market: 'MY', status: 'scheduled', version: 2,
      promotionType: 'custom', originalPrice: 50000, sellingPrice: 46000,
      effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10',
      components: history.components, platforms: history.platforms, priceSchedules: history.priceSchedules,
      history: [history],
    }], source: 'database', canDelete: false }) };
  }});
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PackageControl, { storeId: 'kata-store', storeName: 'Kata Skincare Malaysia' })));
    assert.equal(dom.window.document.querySelector('.version-history'), null);
    const button = dom.window.document.querySelector('button[aria-label="View history for Kata Combo C PWP"]');
    assert.ok(button, 'existing package should offer View History');
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    assert.ok(dom.window.document.querySelector('.version-history'), 'history should open');
    assert.match(dom.window.document.querySelector('.version-history').textContent, /Existing edit/);
    assert.equal(dom.window.document.querySelector('.calculator-history'), null);
    assert.equal(posts, 0, 'viewing history must not save or modify the package');
  } finally {
    await act(async () => root.unmount());
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});

test('extending one Campaign period preserves different prices on the other period', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://local.test/' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const priceSchedules = [
    { market: 'MY', priceType: 'non_campaign', originalPrice: 500, sellingPrice: 450, promotionType: 'monthly', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' },
    { market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 460, promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10' },
    { market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 440, promotionType: 'custom', effectiveFrom: '2026-10-24', effectiveTo: '2026-10-25' },
    { market: 'SG', priceType: 'non_campaign', originalPrice: 300, sellingPrice: 270, promotionType: 'monthly', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' },
    { market: 'SG', priceType: 'campaign', originalPrice: 300, sellingPrice: 240, promotionType: 'custom', effectiveFrom: '2026-10-24', effectiveTo: '2026-10-25' },
    { market: 'SG', priceType: 'campaign', originalPrice: 300, sellingPrice: 260, promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10' },
  ];
  let savedRequest;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (_url, options = {}) => {
    if (options.method === 'POST') {
      savedRequest = JSON.parse(options.body);
      return { ok: true, json: async () => ({ packageId: 'mixed-package', version: 2 }) };
    }
    return { ok: true, json: async () => ({ packages: [{
      id: 'mixed-package', storeId: 'kata-store', storeName: 'Kata Skincare Malaysia', packageSku: 'MIXED', name: 'Mixed Campaign Prices',
      market: 'MY,SG', status: 'scheduled', version: 1, promotionType: 'custom', originalPrice: 50000, sellingPrice: 46000,
      effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10', priceSchedules,
      components: [{ inventorySku: 'ITEM', name: 'Item', quantity: 1, kind: 'product' }],
      platforms: [{ platform: 'Shopee', packageSku: 'MIXED' }], history: [],
    }], source: 'database', canDelete: false }) };
  }});
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PackageControl, { storeId: 'kata-store', storeName: 'Kata Skincare Malaysia' })));
    const click = label => {
      const button = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === label);
      assert.ok(button, `Missing button: ${label}`);
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    };
    await act(async () => click('Edit / Modify'));
    assert.equal(dom.window.document.querySelector('.same-pricing-toggle input').checked, false);
    const end = dom.window.document.querySelectorAll('.campaign-period-list input[type="date"]')[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(end, '2026-10-12');
      end.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => click('Save Changes'));
    assert.deepEqual(savedRequest.priceSchedules.filter(line => line.market === 'MY' && line.priceType === 'campaign').map(line => [line.effectiveFrom, line.effectiveTo, line.sellingPrice]), [
      ['2026-10-08', '2026-10-12', '460'],
      ['2026-10-24', '2026-10-25', '440'],
    ]);
    assert.deepEqual(savedRequest.priceSchedules.filter(line => line.market === 'SG' && line.priceType === 'campaign').map(line => [line.effectiveFrom, line.effectiveTo, line.sellingPrice]), [
      ['2026-10-08', '2026-10-12', '260'],
      ['2026-10-24', '2026-10-25', '240'],
    ], 'a different SG row order must not swap the existing prices between dates');
  } finally {
    await act(async () => root.unmount());
    for (const key of keys) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
