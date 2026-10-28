import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import { loadHistorySync } from './support/load-history-sync.mjs';
const { syncHistoryToGoogleSheet } = await loadHistorySync();

const names = ['GOOGLE_SHEETS_HISTORY_WEBHOOK_URL', 'GOOGLE_SHEETS_HISTORY_SECRET', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'STAGING_SUPABASE_SECRET_SHA256', 'DATABASE_URL', 'DASHBOARD_ENVIRONMENT'];

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
      SUPABASE_SECRET_KEY: 'test-only-staging-secret',
      STAGING_SUPABASE_SECRET_SHA256: createHash('sha256').update('test-only-staging-secret').digest('hex'),
      DATABASE_URL: 'postgresql://postgres.ubjfuveoqbvouryldqfu:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
      DASHBOARD_ENVIRONMENT: 'staging',
    });
    globalThis.fetch = () => { throw new Error('No external Sheet request is allowed'); };
    assert.deepEqual(await syncHistoryToGoogleSheet({ changeId: 'TEST-PKG-001-v2' }), { status: 'synced' });
    process.env.VERCEL_ENV = 'production';
    await assert.rejects(syncHistoryToGoogleSheet({}), /Production environment/);
    process.env.VERCEL_ENV = 'preview';
    process.env.SUPABASE_URL = 'https://production-project.supabase.co';
    await assert.rejects(syncHistoryToGoogleSheet({}), /wrong project/);
  } finally {
    for (const name of names) original[name] === undefined ? delete process.env[name] : process.env[name] = original[name];
    globalThis.fetch = originalFetch;
  }
});
