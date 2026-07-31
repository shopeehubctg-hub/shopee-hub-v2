import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // D1 and R2 are provided by the Cloudflare runtime. Keep the module external
  // so Vercel can build the rest of the dashboard without trying to bundle it.
  serverExternalPackages: ["cloudflare:workers"],
};

export default nextConfig;
