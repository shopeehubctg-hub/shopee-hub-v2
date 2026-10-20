import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { brandKey, canonicalReportUrl, malaysiaReportDate, validFakeSellerImportSignature } from "../app/fake-seller-import.ts";

test("Malaysia upload date crosses midnight at UTC+8",()=>{
  assert.equal(malaysiaReportDate("2026-10-20T16:30:00Z"),"2026-10-21");
  assert.equal(malaysiaReportDate("2026-10-20T15:59:59Z"),"2026-10-20");
});

test("Shopee tracking parameters do not split the same listing into extra links",()=>{
  assert.equal(canonicalReportUrl("https://shopee.com.my/product/1/2?utm_source=chat"),canonicalReportUrl("https://shopee.com.my/product/1/2"));
  assert.equal(canonicalReportUrl("javascript:alert(1)"),null);
  assert.equal(canonicalReportUrl("https://not-shopee.com.my/product/1/2"),null);
  assert.equal(brandKey("  Dr Smile Whitening  "),"drsmilewhitening");
});

test("import signature binds the exact body and rejects stale requests",()=>{
  const body='{"sourceFileId":"drive-file-id"}',timestamp="1792490400000",secret="test-secret";
  const signature=createHmac("sha256",secret).update(`fake-seller-report\n${timestamp}\n${body}`).digest("hex");
  assert.equal(validFakeSellerImportSignature(body,timestamp,signature,secret,Number(timestamp)),true);
  assert.equal(validFakeSellerImportSignature(body+" ",timestamp,signature,secret,Number(timestamp)),false);
  assert.equal(validFakeSellerImportSignature(body,timestamp,signature,secret,Number(timestamp)+300001),false);
});
