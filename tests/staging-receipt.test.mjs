import assert from 'node:assert/strict';
import test from 'node:test';
import { syncHistoryToGoogleSheet } from '../app/api/packages/history-sync.ts';

const names = ['GOOGLE_SHEETS_HISTORY_WEBHOOK_URL', 'GOOGLE_SHEETS_HISTORY_SECRET', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'SUPABASE_URL'];

test('synthetic Staging receipt confirms saves only in the isolated Preview', async () => {
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      GOOGLE_SHEETS_HISTORY_WEBHOOK_URL: 'staging://package-history-receipt',
      GOOGLE_SHEETS_HISTORY_SECRET: 'test-only-secret',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'codex/package-batch-history-staging-candidate',
      SUPABASE_URL: 'https://ubjfuveoqbvouryldqfu.supabase.co',
    });
    globalThis.fetch = () => { throw new Error('No external Sheet request is allowed'); };
    assert.deepEqual(await syncHistoryToGoogleSheet({ changeId: 'TEST-PKG-001-v2' }), { status: 'synced' });
    process.env.VERCEL_ENV = 'production';
    assert.equal((await syncHistoryToGoogleSheet({})).status, 'failed');
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = 'https://production-project.supabase.co';
    assert.equal((await syncHistoryToGoogleSheet({})).status, 'failed');
  } finally {
    for (const name of names) original[name] === undefined ? delete process.env[name] : process.env[name] = original[name];
    globalThis.fetch = originalFetch;
  }
});
