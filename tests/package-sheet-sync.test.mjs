import test from 'node:test';
import assert from 'node:assert/strict';
import { syncHistoryToGoogleSheet } from '../app/api/packages/history-sync.ts';

async function withWebhook(fetcher, run) {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
  const previousSecret = process.env.GOOGLE_SHEETS_HISTORY_SECRET;
  globalThis.fetch = fetcher;
  process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL = 'https://example.test/history';
  process.env.GOOGLE_SHEETS_HISTORY_SECRET = 'test-secret';
  try { await run(); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL;
    else process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.GOOGLE_SHEETS_HISTORY_SECRET;
    else process.env.GOOGLE_SHEETS_HISTORY_SECRET = previousSecret;
  }
}

test('lost first response is confirmed by idempotent duplicate POST', async () => {
  const calls = [];
  await withWebhook(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) throw new Error('response lost');
    return Response.json({ok:true,duplicate:true});
  }, async () => {
    assert.deepEqual(await syncHistoryToGoogleSheet({changeId:'package-v2'}), {status:'synced'});
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].changeId,calls[1].changeId);
});

test('transient 503 is retried but explicit rejection is not', async () => {
  let calls = 0;
  await withWebhook(async () => {
    calls++;
    return calls === 1 ? new Response('',{status:503}) : Response.json({ok:true});
  }, async () => {
    assert.deepEqual(await syncHistoryToGoogleSheet({changeId:'package-v3'}), {status:'synced'});
  });
  assert.equal(calls,2);
  calls = 0;
  await withWebhook(async () => { calls++; return Response.json({ok:false,error:'Unauthorized'}); }, async () => {
    assert.deepEqual(await syncHistoryToGoogleSheet({changeId:'package-v4'}), {status:'failed',reason:'Unauthorized'});
  });
  assert.equal(calls,1);
});
