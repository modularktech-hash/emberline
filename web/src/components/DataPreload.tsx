import { dataPreloads } from "@/lib/queries";

/**
 * Starts the calendar downloads from the HTML itself, in parallel with the JS
 * bundle, instead of after hydration; queries.ts picks the responses up from
 * window.__emberlinePrefetch.
 *
 * Deliberately an inline script, not <link rel=preload> or ReactDOM.preload():
 * React turns those into hints carried in the RSC payload, and they fired
 * whenever a <Link> merely prefetched the route, so every page downloaded
 * ~700 KB of parquet it never used. Inline scripts only run on a real page
 * load (React does not execute scripts it inserts on client navigation, where
 * queries.ts simply fetches as usual).
 */
export function DataPreload() {
  const urls = JSON.stringify(dataPreloads());
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var p=window.__emberlinePrefetch=window.__emberlinePrefetch||{};${urls}.forEach(function(u){if(!p[u])p[u]=fetch(u).then(function(r){if(!r.ok)throw new Error(u+": HTTP "+r.status);return u.slice(-5)===".json"?r.json():r.arrayBuffer()});p[u].catch(function(){delete p[u]})})}catch(e){}})();`,
      }}
    />
  );
}
