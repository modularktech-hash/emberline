import { DATASET_FILES, dataPreloads, dataUrl } from "@/lib/queries";

/**
 * Starts a page's first data requests from the HTML itself, in parallel with
 * the JS bundle, instead of after hydration; the loaders (lib/queries.ts,
 * lib/data.ts) pick the responses up from window.__emberlinePrefetch by URL.
 *
 * `countries`: country views to warm (the calendar index, the fit and one
 * small calendar slice per country: a few KB each plus ~58 KB for the fit).
 * `files`: further JSON files under /data, by name. Each page lists only what
 * its first view reads.
 *
 * Deliberately an inline script, not <link rel=preload> or ReactDOM.preload():
 * React turns those into hints carried in the RSC payload, and they fired
 * whenever a <Link> merely prefetched the route. Inline scripts only run on a
 * real page load (React does not execute scripts it inserts on client
 * navigation, where the loaders simply fetch as usual).
 */
export function DataPreload({ countries, files = [] }: { countries?: string[]; files?: string[] }) {
  const urls = [...new Set([...DATASET_FILES.map(dataUrl), ...(countries ? dataPreloads(countries) : []), ...files.map(dataUrl)])];
  const js = `(function(){try{var p=window.__emberlinePrefetch=window.__emberlinePrefetch||{};
${JSON.stringify(urls)}.forEach(function(u){if(!p[u]){var v=p[u]=fetch(u).then(function(r){if(!r.ok)throw new Error(u+": HTTP "+r.status);return r.json()});v.catch(function(){delete p[u]})}});
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
