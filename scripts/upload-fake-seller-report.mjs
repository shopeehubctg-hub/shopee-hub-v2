#!/usr/bin/env node
// Run once after the existing Wednesday/Saturday task uploads a new Drive file.
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const [filePath]=process.argv.slice(2);
const endpoint=process.env.FAKE_SELLER_IMPORT_URL;
const secret=process.env.FAKE_SELLER_IMPORT_SECRET;
if (!filePath || !endpoint || !secret) {
  console.error("Usage: FAKE_SELLER_IMPORT_URL=... FAKE_SELLER_IMPORT_SECRET=... node scripts/upload-fake-seller-report.mjs batch.json");
  process.exit(2);
}
const body=await readFile(filePath,"utf8");
const timestamp=String(Date.now());
const signature=createHmac("sha256",secret).update(`fake-seller-report\n${timestamp}\n${body}`).digest("hex");
const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-report-timestamp":timestamp,"x-report-signature":signature},body});
const result=await response.text();
if (!response.ok) {console.error(`Import failed (${response.status}): ${result}`);process.exit(1)}
console.log(result);
