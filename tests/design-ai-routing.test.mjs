import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../app/api/design-reviews/route.ts",import.meta.url),"utf8");
const checker=await readFile(new URL("../app/design-checker.tsx",import.meta.url),"utf8");

test("design review accepts exactly one image",()=>{
  assert.match(route,/files\.length!==1/);
  assert.doesNotMatch(checker,/\bmultiple\b/);
});

test("Gemini is primary and only the requested failures switch to Groq",()=>{
  assert.match(route,/models\/gemini-2\.5-flash:generateContent/);
  assert.match(route,/qwen\/qwen3\.6-27b/);
  assert.match(route,/\["rate_limit","timeout","invalid_json"\]/);
  assert.match(route,/return \{result:await callGroq/);
});

test("output and daily quota controls stay bounded",()=>{
  assert.match(route,/Math\.min\(1800,Math\.max\(1200/);
  assert.match(route,/AI_DAILY_REVIEW_QUOTA/);
  assert.match(route,/Math\.ceil\(dailyLimit\*\.8\)/);
  assert.match(checker,/DAILY QUOTA WARNING/);
});
