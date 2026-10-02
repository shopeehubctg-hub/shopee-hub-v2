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
    { market: 'MY', priceType: 'campaign', originalPrice: 500, sellingPrice: 460, promotionType: 'custom', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-10' },
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
      assert.equal(request.expectedVersion, 2);
      saved = true;
      return { ok: true, status: 200, json: async () => ({ packageId: 'kata-package', version: 3 }) };
    }
    const item = { ...base, version: saved ? 3 : 2, history: saved ? [{
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
    await act(async () => click('Save Changes'));
    assert.equal(posts, 1);
    assert.equal(dom.window.document.querySelector('.package-modal'), null);
    assert.ok(dom.window.document.querySelector('.version-history'), 'history should auto-open');
    assert.match(dom.window.document.body.textContent, /Changes saved · Version 3/);
    assert.match(dom.window.document.body.textContent, /Kata Combo C PWP/);
    assert.equal(dom.window.document.querySelector('.calculator-history'), null);
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
