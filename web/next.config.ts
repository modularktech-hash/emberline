import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * One version tag for everything under public/data: a hash of every file's
 * path and content, taken when the config loads (each build, each `next dev`).
 * lib/queries.ts appends it to data URLs as `?v=`, and those responses are
 * served as immutable below. A data file that changes gets a new tag with the
 * next build, so a long cache lifetime can never serve stale numbers; a URL
 * without the tag (a download link, an old client) keeps the default
 * revalidate-every-time behaviour.
 */
function dataVersion(): string {
  const root = join(process.cwd(), "public", "data");
  const h = createHash("sha256");
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`);
      else { h.update(`${rel}${e.name}\n`); h.update(readFileSync(join(dir, e.name))); }
    }
  };
  try { walk(root, ""); } catch { return ""; }
  return h.digest("hex").slice(0, 12);
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_DATA_V: dataVersion() },
  async redirects() {
    return [{ source: "/anomaly", destination: "/seasons", permanent: true }];
  },
  async headers() {
    return [{
      source: "/data/:path*",
      has: [{ type: "query", key: "v" }],
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
