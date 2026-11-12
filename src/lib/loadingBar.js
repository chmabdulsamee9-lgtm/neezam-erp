// Global "is something loading" counter for the top loading bar (Shopify-style).
// The bar is for loading the person asked for: it is "armed" for a short window after start-up, a page change,
// a click or Enter, and only requests that start while armed (or while the bar is already running, so a chain of
// calls stays one bar) are counted. Background refreshes (live updates, polling) never move the bar.

let active = 0;
let armedUntil = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(active));
const now = () => Date.now();

export function subscribeLoading(fn) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}

/** the next requests within `ms` belong to something the user just did */
export function armLoading(ms = 1500) {
  armedUntil = Math.max(armedUntil, now() + ms);
}

export function isArmed() {
  return active > 0 || now() < armedUntil;
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

/** true for the requests the bar may follow */
export function isTrackedUrl(url) {
  const u = String(url || "");
  if (u.includes("dev_monitoring_log")) return false;
  if (u.includes("/realtime/")) return false;
  return u.includes(".supabase.co/rest/") || u.includes(".supabase.co/functions/") || u.includes(".workers.dev/");
}

let installed = false;
/** wraps window.fetch once and arms the bar on start-up and on user input; safe to call more than once */
export function installFetchTracking() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  armLoading(4000); // start-up
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (!isTrackedUrl(url) || !isArmed()) return original(input, init);
    const done = startLoading();
    return original(input, init).finally(done);
  };
  const onInput = (e) => { if (e.type === "pointerdown" || e.key === "Enter") armLoading(1500); };
  window.addEventListener("pointerdown", onInput, true);
  window.addEventListener("keydown", onInput, true);
  window.addEventListener("popstate", () => armLoading(2000));
}
