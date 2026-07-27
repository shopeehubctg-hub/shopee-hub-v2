import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../app/api/design-reviews/route.ts",import.meta.url),"utf8");
const checker=await readFile(new URL("../app/design-checker.tsx",import.meta.url),"utf8");

test("design review accepts exactly one image",()=>{
  assert.match(route,/files\.length!==1/);
  assert.doesNotMatch(checker,/\bmultiple\b/);
});

test("Gemini is primary and recoverable failures switch to Groq",()=>{
  assert.match(route,/gemini-3\.6-flash/);
  assert.match(route,/qwen\/qwen3\.6-27b/);
  assert.match(route,/\["rate_limit","timeout","invalid_json","model_unavailable","server_error"\]/);
  assert.match(route,/return \{result:await callGroq/);
  assert.match(route,/thinkingConfig:\{thinkingLevel:"minimal"\}/);
  assert.match(route,/reasoning_effort:"none"/);
});

test("provider failures explain the problem and next action",()=>{
  assert.match(route,/Groq 无法读取这张图片。请重新导出为标准 RGB PNG 或 JPG 后再上传/);
  assert.match(route,/Groq 目前服务繁忙（503）。请稍后再按「开始审核」重试/);
  assert.match(route,/Groq API Key 无效或没有 Qwen 3\.6 27B 权限/);
});

test("output and daily quota controls stay bounded",()=>{
  assert.match(route,/Math\.min\(1800,Math\.max\(1200/);
  assert.match(route,/AI_DAILY_REVIEW_QUOTA/);
  assert.match(route,/Math\.ceil\(dailyLimit\*\.8\)/);
  assert.match(checker,/DAILY QUOTA WARNING/);
});

test("technical failure banner explains the problem and next action",()=>{
  assert.match(checker,/primaryTechnicalFailure\?\.title/);
  assert.match(checker,/请根据以上建议修改后再上传/);
  assert.match(checker,/修改后再上传/);
});
