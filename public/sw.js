/* eNeezam portal service worker.
 *
 * Why: on some networks the browser's connection to Cloudflare drops now and then (ERR_QUIC_PROTOCOL_ERROR,
 * ERR_CONNECTION_RESET, "Failed to fetch dynamically imported module"), so the portal would not open or a page's code
 * would not load until a hard refresh. This worker keeps the app itself in the browser:
 *   - page code, styles, fonts and images under /assets (file names change on every deploy, so a saved copy is never
 *     stale): served from the saved copy, downloaded (with retries) only the first time;
 *   - opening a page (navigation): the latest index.html from the network, with a short time limit; if the network
 *     fails, the saved index.html, so the portal still opens.
 * Data (api.eneezam.com, Supabase, other hosts) and anything that is not a GET is never touched.
 * Kill switch: serving a sw.js that only unregisters itself removes this worker from every browser.
 */
const SHELL = "ne-shell-v1";
const ASSETS = "ne-assets-v1";
const KEEP = [SHELL, ASSETS];
const MAX_ASSETS = 600;
const NAV_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.add(new Request("/index.html", { cache: "reload" }))).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
async function fetchRetry(req, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await wait(i === 1 ? 400 : 1200);
    try { return await fetch(req.clone ? req.clone() : req); } catch (e) { last = e; }
  }
  throw last;
}

async function fromNetworkThenShell(req) {
  const shell = await caches.open(SHELL);
  try {
    const res = await withTimeout(fetchRetry(req, 2), NAV_TIMEOUT_MS);
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.includes("text/html")) shell.put("/index.html", res.clone());
    return res;
  } catch (e) {
    const saved = await shell.match("/index.html");
    if (saved) return saved;
    return fetchRetry(req, 2); // nothing saved yet: one more honest try
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetchRetry(req, 3);
  if (res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    if (Math.random() < 0.05) trim(cache);
  }
  return res;
}

// files whose names don't change between deploys (logos, icons): the saved copy at once, refreshed in the background
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const refresh = fetchRetry(req, 2).then((res) => { if (res.ok && res.type === "basic") cache.put(req, res.clone()); return res; });
  if (hit) { event.waitUntil(refresh.catch(() => {})); return hit; }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/cdn-cgi/") || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") { event.respondWith(fromNetworkThenShell(req)); return; }
  if (url.pathname.startsWith("/assets/")) { event.respondWith(cacheFirst(req)); return; }
  if (url.pathname.startsWith("/brand/") || /\.(woff2?|png|svg|webp|jpe?g|ico)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(event, req));
});
