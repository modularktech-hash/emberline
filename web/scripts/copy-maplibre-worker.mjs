// Copies MapLibre GL's worker (and the shared chunk it imports) to
// public/vendor/maplibre-gl-<version>/. MapLibre 6 starts its web worker from
// a URL next to its own module file, which does not exist once the library is
// bundled, so the app points setWorkerUrl() at this copy instead
// (src/components/AoiMap.tsx). Runs before `next build` / `next dev`; the
// copy is also committed so a bare `npx next build` works.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(web, "node_modules", "maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const out = join(web, "public", "vendor", `maplibre-gl-${version}`);
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(pkgDir, "dist", f), join(out, f));
}
console.log(`maplibre-gl ${version} worker -> ${out}`);
