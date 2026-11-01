import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const esbuildCli = require.resolve('esbuild/bin/esbuild', { paths: [dirname(require.resolve('vite'))] });
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })));
const bundled = await build({
  entryPoints: ['app/api/admin/stores/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'store-release-stubs', setup(build) {
    build.onResolve({ filter: /^(server-only|.*\/chatgpt-auth|.*\/supabase-rest|.*\/store-directory)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
      contents: args.path === 'server-only' ? '' : args.path === 'chatgpt-auth'
        ? 'export const PORTAL_SESSION_COOKIE="portal_session";export function readPortalSessionWithId(){return null;}export async function getChatGPTUser(){return globalThis.__compatActor;}'
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
const req = (method, body) => new Request('https://portal.test/api/admin/stores', { method, headers: { 'content-type': 'application/json', origin: 'https://portal.test' }, body: JSON.stringify(body) });
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
    if (table === 'customer_users') return [{ id:1,email:'admin@example.test',tenant_id: state.tenant, role: state.role, active: true,module_access_mode:'role_default',store_access_mode:'all',can_manage_permissions:false }];
    if (table === 'tenants') return [{ active: true }];
    if (['user_module_permissions','tenant_module_permissions','user_store_access'].includes(table)) return [];
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

test('malformed v2 Account payloads fail closed with no Store or directory writes', async () => {
  for (const method of ['POST', 'PATCH']) {
    const body = method === 'POST'
      ? { name: 'New', market: 'MY', accountSetup: { version: 2, rateCard: { id: 'plan' } } }
      : { id: 'store', name: 'Changed', accountSetup: { version: 2 } };
    const response = await api[method](req(method, body));
    assert.equal(response.status, 400);
  }
  assert.equal(state.stores.length, 0);
  assert.equal(globalThis.__compatDetails.length, 0);
  assert.ok(state.calls.every(call => call.method === 'GET')); // authorization may read Store scope; malformed setup must never write.
});

for(const scenario of [{market:'MY',preview:false},{market:'TH',preview:false},{market:'PH',preview:false},{market:'MY',preview:true,available:false},{market:'TH',preview:true,available:false},{market:'PH',preview:true,available:false},{market:'TH',preview:true,available:true},{market:'PH',preview:true,available:true}])test(`Store UI ${scenario.market} ${scenario.preview?(scenario.available?'Account available':'Account locked'):'store-only'} preserves the persistence boundary`, async () => {
  const {market,preview:accountPreview,available:accountAvailable=false}=scenario;
  const { JSDOM } = await import(process.env.BD_DOM_TEST_JSDOM ?? 'jsdom');
  const compiled = execFileSync(esbuildCli, [ '--bundle', '--format=esm', '--platform=node', '--target=node20', '--loader=tsx', '--loader:.css=empty', '--jsx=automatic'], {
    maxBuffer: 10 * 1024 * 1024,
    input: `import React,{act} from 'react';import {createRoot} from 'react-dom/client';
      import {FeePlansProvider} from './app/fee-plan-context';import {PermissionSettings} from './app/permission-settings';import {AccountSecurityProvider} from './app/account-security-context';
      export {act,createRoot};export const App=()=> <AccountSecurityProvider enabled={false}><FeePlansProvider persistent><PermissionSettings initialEnabledModules={[]} accountSetupPreview={${accountPreview}}/></FeePlansProvider></AccountSecurityProvider>;`,
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
    if (url === '/api/admin/account/rate-cards') return Response.json({available:true,plans:[{id:'internal-new',name:'Internal NEW',clientType:'Internal',currency:'MYR',version:1,effectiveMonth:'2026-10',rule:{type:'tiers',currency:'MYR',basis:'custom',basisLabel:'Shopee Sales',tiers:[{from:'0',percent:'4'},{from:'10000',percent:'3.5'},{from:'100000',percent:'3'},{from:'150000',percent:'2.5'},{from:'200000',percent:'2',cap:'4000'}]}}],previewRateSource:{records:[]}});
    if (url === '/api/admin/users') return Response.json({
      stores: [{ id: 'shopee-existing', name: 'Existing', platform: `Shopee ${market}` }],
      users: [], clientDefaults: [], accountSettingsAvailable: accountAvailable,
      access: { isSuperAdmin: true, canManageStores: true, canManageDefaults: true, grantableModules: [] },
    });
    if (url.startsWith('/api/admin/store-exchange-rate?')) {const params=new URL(url,'https://portal.test').searchParams;return Response.json({status:'available',market:params.get('market'),currency:params.get('market')==='TH'?'THB':'PHP',invoiceMonth:params.get('invoiceMonth'),serviceMonth:(()=>{const [year,month]=params.get('invoiceMonth').split('-').map(Number);return `${month===1?year-1:year}-${String(month===1?12:month-1).padStart(2,'0')}`;})(),policy:'bnm-service-average',rate:params.get('market')==='TH'?'0.1225':'0.065',quotationUnit:1,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv'});}
    if (url === '/api/admin/stores') {
      const body = JSON.parse(init.body);
      payloads.push({ method: init.method, body });
      return Response.json({ store: { id: body.id ?? 'shopee-release', name: body.name, platform: `Shopee ${market}` } }, { status: init.method === 'POST' ? 201 : 200 });
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
    assert.equal([...document.querySelectorAll('label')].some(label=>label.textContent.includes('Source name')),false);
    if(market!=='MY')await act(()=>{const select=document.querySelector('[aria-label="Add store"] select');select.value=market;select.dispatchEvent(new Event('change',{bubbles:true}));});
    if(accountPreview && accountAvailable){
      const dialog=document.querySelector('[aria-label="Add store"]');
      assert.match(dialog.textContent,/Account setup/);assert.ok(dialog.querySelector('[aria-label="Account rate card"]'));
      const company=[...dialog.querySelectorAll('label')].find(label=>label.textContent.startsWith('Company name')).querySelector('input');
      await act(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(company,'New Overseas Company');company.dispatchEvent(new Event('input',{bubbles:true}));});
      await act(()=>{const select=dialog.querySelector('[aria-label="Account client type"]');select.value='Internal';select.dispatchEvent(new Event('change',{bubbles:true}));});
      await act(()=>{const select=dialog.querySelector('[aria-label="Account rate card"]');select.value='internal-new';select.dispatchEvent(new Event('change',{bubbles:true}));});
      assert.equal(dialog.querySelector('[aria-label="Account rate card"]').value,'internal-new');
      assert.match(dialog.textContent,new RegExp(`Sales currency: ${market==='TH'?'THB':'PHP'} · Fee currency: MYR`));
      assert.match(dialog.textContent,/cap MYR 4000/);assert.doesNotMatch(dialog.textContent,/3.2/);
      assert.equal(dialog.querySelectorAll('input[type="month"]').length,1);
      assert.match(dialog.querySelector('output').textContent,market==='TH'?/1 THB = MYR 0.1225/:/1 PHP = MYR 0.065/);
      assert.equal(payloads.length,0);
      return;
    }
    assert.equal(document.querySelector('[aria-label="Add store"] fieldset')?.textContent.includes('Account setup') ?? false, false);
    const addDialog = document.querySelector('[aria-label="Add store"]');
    if(accountPreview) assert.match(addDialog.textContent,/Unlock Account to add a Store with its billing setup/);
    if(market!=='MY'){assert.match(addDialog.textContent,/Currency Exchange Rate/);assert.match(addDialog.textContent,/Bank Negara monthly average/);assert.match(addDialog.querySelector('output').textContent,market==='TH'?/1 THB = MYR 0.1225/:/1 PHP = MYR 0.065/);}
    const addName = [...addDialog.querySelectorAll('label')].find(label => label.textContent.includes('Store name')).querySelector('input');
    await act(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(addName, 'Release UI'); addName.dispatchEvent(new Event('input', { bubbles: true })); });
    if(accountPreview){
      assert.equal(namedButton('Add store').disabled,true);
      assert.equal(payloads.length,0);
      await click(addDialog.querySelector('button[aria-label="Close"]'));
      await click(namedButton('Edit store'));
      assert.equal(document.querySelector('[aria-label="Edit store"] fieldset')?.textContent.includes('Account company') ?? false, false);
      assert.match(document.querySelector('[aria-label="Edit store"]').textContent,/Store details can still be saved/);
      await click(namedButton('Save store'));
      await act(async () => {});
      assert.equal(payloads[0]?.method,'PATCH');
      for(const field of ['accountSetup','legalEntity','feeRule','effectiveMonth','accountRosterKey','expectedAccountVersion'])assert.equal(field in payloads[0].body,false);
      return;
    }
    assert.equal(namedButton('Add store').disabled, false);
    await click(namedButton('Add store'));
    await act(async () => {});
    assert.equal(payloads[0]?.method, 'POST');
    assert.equal(payloads[0].body.market,market);
    for (const field of ['accountSetup','legalEntity','feeRule','effectiveMonth','accountRosterKey','expectedAccountVersion']) assert.equal(field in payloads[0].body, false);
    await click(namedButton('Edit store'));
    assert.equal(document.querySelector('[aria-label="Edit store"] fieldset')?.textContent.includes('Account company') ?? false, false);
    if(accountPreview) assert.match(document.querySelector('[aria-label="Edit store"]').textContent,/Store details can still be saved/);
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

test('TH and PH Store registration preserves markets and rejects unsupported countries',async()=>{
  for(const market of ['TH','PH']){
    const response=await api.POST(req('POST',{name:`Test ${market} Store`,market}));
    assert.equal(response.status,201);
    const store=(await response.json()).store;
    assert.equal(store.platform,`Shopee ${market}`);
    assert.equal(state.stores.at(-1).platform,`Shopee ${market}`);
    assert.equal((await api.POST(req('POST',{name:`Test ${market} Store`,market}))).status,409);
    const edit=await api.PATCH(req('PATCH',{id:store.id,name:`Renamed ${market}`}));
    assert.equal(edit.status,200);assert.equal((await edit.json()).store.platform,`Shopee ${market}`);
  }
  assert.equal((await api.POST(req('POST',{name:'Unknown',market:'XX'}))).status,400);
  assert.ok(state.calls.every(call=>!call.table.startsWith('rpc/')));
});
