import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getPageStaticInfo } from "next/dist/build/analysis/get-page-static-info.js";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher.js";
import { loadBindings } from "next/dist/build/swc/index.js";

// Use Next's build parser: a misnamed export otherwise silently matches all URLs.
await loadBindings();
const info = await getPageStaticInfo({
  pageFilePath: fileURLToPath(new URL("../proxy.ts", import.meta.url)),
  nextConfig: {},
  page: "/proxy",
  pageType: "pages",
  isDev: false,
});

test("Next recognizes the proxy matcher and leaves login assets public", () => {
  assert.ok(info.middleware?.matchers?.length, "Next must recognize the config export");
  const matches = getMiddlewareRouteMatcher(info.middleware.matchers);
  for (const path of [
    "/_next/static/chunks/login.js",
    "/_next/static/chunks/login.css",
    "/_next/static/media/noto-sans.woff2",
    "/_next/image",
    "/favicon.ico",
    "/shopee-hub-logo-transparent.png",
  ]) {
    assert.equal(matches(path, {}, {}), false, path);
  }
  for (const path of ["/", "/api/dashboard", "/api/admin/users", "/login", "/api/auth/login"]) {
    assert.equal(matches(path, {}, {}), true, path);
  }
});
