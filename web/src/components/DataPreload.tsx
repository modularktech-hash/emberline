import { dataPreloads } from "@/lib/queries";

/**
 * Starts the first calendar requests from the HTML itself, in parallel with
 * the JS bundle, instead of after hydration; queries.ts picks the responses up
 * from window.__emberlinePrefetch.
 *
 * - The world calendars get one ranged request for their last bytes (size +
 *   footer), parsed exactly like queries.ts's fetchTail, stored as `url#tail`.
 *   queries.ts then reads only the country row groups (~0.8 MB) by range.
 * - params_global.json is fetched whole (~150 KB compressed).
 *
 * Deliberately an inline script, not <link rel=preload> or ReactDOM.preload():
 * React turns those into hints carried in the RSC payload, and they fired
 * whenever a <Link> merely prefetched the route. Inline scripts only run on a
 * real page load (React does not execute scripts it inserts on client
 * navigation, where queries.ts simply fetches as usual).
 */
export function DataPreload() {
  const { tail, json, tailBytes } = dataPreloads();
  const js = `(function(){try{var p=window.__emberlinePrefetch=window.__emberlinePrefetch||{};
function keep(k,v){p[k]=v;v.catch(function(){delete p[k]})}
${JSON.stringify(json)}.forEach(function(u){if(!p[u])keep(u,fetch(u).then(function(r){if(!r.ok)throw new Error(u+": HTTP "+r.status);return r.json()}))});
${JSON.stringify(tail)}.forEach(function(u){var k=u+"#tail";if(!p[k])keep(k,fetch(u,{headers:{Range:"bytes=-${tailBytes}"}}).then(function(r){if(!r.ok)throw new Error(u+": HTTP "+r.status);return r.arrayBuffer().then(function(b){var m=/\\/(\\d+)\\s*$/.exec(r.headers.get("content-range")||"");if(r.status===206&&m){var t=+m[1];return{total:t,start:t-b.byteLength,bytes:b}}if(r.status===200)return{total:b.byteLength,start:0,bytes:b};throw new Error(u+": unexpected range response")})}))});
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
