// Global "is something loading" counter for the top loading bar (Shopify-style).
// Counts in-flight requests to our backends (Supabase REST/RPC, the worker) plus explicit start()/done()
// pairs (page chunk loads). Realtime websockets and the dev-monitoring logger are ignored.

let active = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(active));

export function subscribeLoading(fn) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}

export function startLoading() {
  active += 1;
  emit();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    active = Math.max(0, active - 1);
    emit();
  };
}

/** true for the requests the bar should follow */
export function isTrackedUrl(url) {
  const u = String(url || "");
  if (u.includes("dev_monitoring_log")) return false;
  if (u.includes("/realtime/")) return false;
  return u.includes(".supabase.co/rest/") || u.includes(".supabase.co/functions/") || u.includes(".workers.dev/");
}

let installed = false;
/** wraps window.fetch once; safe to call more than once */
export function installFetchTracking() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (!isTrackedUrl(url)) return original(input, init);
    const done = startLoading();
    return original(input, init).finally(done);
  };
}
