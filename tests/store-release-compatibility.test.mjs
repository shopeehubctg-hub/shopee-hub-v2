import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })));
const bundled = await build({
  entryPoints: ['app/api/admin/stores/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'store-release-stubs', setup(build) {
    build.onResolve({ filter: /^(server-only|.*\/chatgpt-auth|.*\/supabase-rest|.*\/store-directory)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
      contents: args.path === 'server-only' ? '' : args.path === 'chatgpt-auth'
        ? 'export async function getChatGPTUser(){return globalThis.__compatActor;}'
        : args.path === 'supabase-rest'
          ? 'export async function supabaseRest(path,init){return globalThis.__compatRest(path,init);}'
          : `export function parseStoreDetails(body){return {value:{storeGroupLink:body.storeGroupLink??'',googleDriveLink:body.googleDriveLink??'',projectLinks:body.projectLinks??[],adsTopUpOwner:body.adsTopUpOwner??null}};}
             export async function saveStoreDetails(tenant,id,name,details){globalThis.__compatDetails.push({tenant,id,name,details});}
             export async function storeDirectory(){return [];}
             export function storeDetails(){return {};}`,
      loader: 'js',
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const req = (method, body) => new Request('https://portal.test/api/admin/stores', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const uuid = '11111111-1111-4111-8111-111111111111';
let state;
beforeEach(() => {
  globalThis.__compatActor = { email: 'admin@example.test' };
  globalThis.__compatDetails = [];
  state = { role: 'superadmin', tenant: 'tenant-a', stores: [], calls: [] };
  globalThis.__compatRest = async (path, init = {}) => {
    const url = new URL(path, 'https://rest.test/');
    const table = url.pathname.slice(1);
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ table, method: init.method ?? 'GET', body });
    if (table === 'customer_users') return [{ tenant_id: state.tenant, role: state.role, active: true }];
    if (table.startsWith('rpc/')) throw new Error('Account RPC must not be called for legacy Store actions');
    if (table !== 'stores') throw new Error(`Unexpected table ${table}`);
    if (init.method === 'POST') { state.stores.push(body); return [{ ...body, display_name: null }]; }
    if (init.method === 'PATCH') {
      const target = state.stores.find(row => row.id === url.searchParams.get('id')?.slice(3) && row.tenant_id === url.searchParams.get('tenant_id')?.slice(3));
      if (!target) return [];
      Object.assign(target, body);
      return [target];
    }
    return state.stores.filter(row => row.tenant_id === (url.searchParams.get('tenant_id')?.slice(3) ?? state.tenant));
  };
});

test('legacy Add and Edit succeed without Account RPC and stay tenant-scoped', async () => {
  state.stores.push({ id: 'other', tenant_id: 'tenant-b', name: 'Other', display_name: null, bigseller_name: 'Other', platform: 'Shopee MY' });
  const created = await api.POST(req('POST', { name: 'Release Store', market: 'MY', sourceName: 'Source Store', requestId: uuid }));
  assert.equal(created.status, 201);
  const added = (await created.json()).store;
  assert.equal(added.name, 'Release Store');
  assert.equal(state.stores.at(-1).tenant_id, 'tenant-a');
  assert.equal(state.stores.at(-1).bigseller_name, 'Source Store');
  assert.equal(globalThis.__compatDetails[0].tenant, 'tenant-a');
  assert.ok(state.calls.every(call => !call.table.startsWith('rpc/')));

  const edited = await api.PATCH(req('PATCH', { id: added.id, name: 'Renamed Store', requestId: uuid }));
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).store.name, 'Renamed Store');
  assert.equal(state.stores.at(-1).display_name, 'Renamed Store');
  assert.equal(state.stores[0].display_name, null);
  assert.ok(state.calls.every(call => !call.table.startsWith('rpc/')));
});

test('legacy Store writes keep Super Admin and tenant ownership guards', async () => {
  state.role = 'customer';
  assert.equal((await api.POST(req('POST', { name: 'Blocked', market: 'MY' }))).status, 403);
  assert.equal((await api.PATCH(req('PATCH', { id: 'other', name: 'Blocked' }))).status, 403);
  assert.equal(state.stores.length, 0);
  state.role = 'superadmin';
  state.stores.push({ id: 'other', tenant_id: 'tenant-b', name: 'Other', display_name: null, bigseller_name: 'Other', platform: 'Shopee MY' });
  assert.equal((await api.PATCH(req('PATCH', { id: 'other', name: 'Hijack' }))).status, 404);
  assert.equal(state.stores[0].display_name, null);
});

test('v2 Account payloads fail closed with no Store or directory writes', async () => {
  for (const method of ['POST', 'PATCH']) {
    const body = method === 'POST'
      ? { name: 'New', market: 'MY', accountSetup: { version: 2, rateCard: { id: 'plan' } } }
      : { id: 'store', name: 'Changed', accountSetup: { version: 2 } };
    const response = await api[method](req(method, body));
    assert.equal(response.status, 503);
  }
  assert.equal(state.stores.length, 0);
  assert.equal(globalThis.__compatDetails.length, 0);
  assert.ok(state.calls.every(call => call.table !== 'stores' && !call.table.startsWith('rpc/')));
});

test('Production Store UI omits Account setup and sends store-only Add/Edit payloads', async () => {
  const { JSDOM } = await import(process.env.BD_DOM_TEST_JSDOM ?? 'jsdom');
  const compiled = execFileSync('node_modules/.bin/esbuild', ['--bundle', '--format=esm', '--platform=node', '--target=node20', '--loader=tsx', '--jsx=automatic'], {
    maxBuffer: 10 * 1024 * 1024,
    input: `import React,{act} from 'react';import {createRoot} from 'react-dom/client';
      import {FeePlansProvider} from './app/fee-plan-context';import {PermissionSettings} from './app/permission-settings';
      export {act,createRoot};export const App=()=> <FeePlansProvider><PermissionSettings initialEnabledModules={[]} accountSetupPreview={false}/></FeePlansProvider>;`,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://portal.test/' });
  const saved = new Map();
  const channels = [];
  const NativeChannel = globalThis.MessageChannel;
  for (const key of ['window','document','navigator','HTMLElement','Event','MouseEvent','FormData','MessageChannel','requestAnimationFrame']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'requestAnimationFrame' ? callback => callback() : dom.window[key] });
  }
  globalThis.MessageChannel = class extends NativeChannel { constructor() { super(); channels.push(this); } };
  const nativeFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url === '/api/admin/users') return Response.json({
      stores: [{ id: 'shopee-existing', name: 'Existing', platform: 'Shopee MY' }],
      users: [], clientDefaults: [], accountSettingsAvailable: false,
    });
    if (url === '/api/admin/stores') {
      const body = JSON.parse(init.body);
      payloads.push({ method: init.method, body });
      return Response.json({ store: { id: body.id ?? 'shopee-release', name: body.name, platform: 'Shopee MY' } }, { status: init.method === 'POST' ? 201 : 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { act, createRoot, App } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const root = createRoot(document.querySelector('#root'));
  const click = async element => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const namedButton = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
  try {
    await act(() => root.render(App()));
    await act(async () => {});
    await click(namedButton('Stores'));
    await click(namedButton('+ Add store'));
    assert.equal(document.querySelector('[aria-label="Add store"] fieldset')?.textContent.includes('Account setup') ?? false, false);
    const addDialog = document.querySelector('[aria-label="Add store"]');
    const addName = [...addDialog.querySelectorAll('label')].find(label => label.textContent.includes('Store name')).querySelector('input');
    await act(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(addName, 'Release UI'); addName.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(namedButton('Add store').disabled, false);
    await click(namedButton('Add store'));
    await act(async () => {});
    assert.equal(payloads[0]?.method, 'POST');
    for (const field of ['accountSetup','legalEntity','feeRule','effectiveMonth','accountRosterKey','expectedAccountVersion']) assert.equal(field in payloads[0].body, false);
    await click(namedButton('Edit store'));
    assert.equal(document.querySelector('[aria-label="Edit store"] fieldset')?.textContent.includes('Account company') ?? false, false);
    await click(namedButton('Save store'));
    await act(async () => {});
    assert.equal(payloads[1]?.method, 'PATCH');
    for (const field of ['accountSetup','legalEntity','feeRule','effectiveMonth','accountRosterKey','expectedAccountVersion']) assert.equal(field in payloads[1].body, false);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    globalThis.fetch = nativeFetch;
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
