// Some networks in Pakistan drop connections to Cloudflare now and then (ERR_QUIC_PROTOCOL_ERROR, ERR_CONNECTION_RESET,
// "Failed to fetch") although the internet itself works, and often only for ONE hostname. So a request that fails with a
// network error is tried again, and a call to our worker alternates between its two addresses
// (the workers.dev address first, api.eneezam.com as the backup), which are different hostnames and IPs.
//
// Only requests that are safe to repeat are retried: GET / HEAD, and POSTs of the read/save kind (get-, list-, check-,
// save-, update-, preview-, quote-: repeating them changes nothing twice). Anything else (booking a courier, sending a
// WhatsApp message, placing an order...) is never repeated automatically. Aborted requests are not retried.
// If every try fails, the error says in plain words that the connection dropped, instead of "Failed to fetch".
const API = "https://api.eneezam.com";
const WORKER = "https://neezam-erp.chmabdulsamee9.workers.dev";
// POSTs that only read (or save the same thing again): safe to repeat after a dropped connection
// (billing/bank-submit: the server keeps one transfer waiting per store, a repeat is refused)
const SAFE_POST = /^\/(?:(?:save|update|get|list|check|preview|quote|home)-[a-z0-9-]+|dashboard-stats|booked-page|orders-page|orders-filter-options|finance-statement(?:-orders)?|returns-list|supplier-ledger-entries|meta-(?:insights|ads-tree|status|campaigns|ad-accounts|businesses|pixels|catalogs|catalog-status|account-balance)|order-tracking-history|rate-card|dex-track-shipment|dex-finance-transactions|store-extras|copy-candidates|nex\/(?:state|admin\/(?:overview|kyc-file))|partners\/(?:me|agreement|admin\/(?:overview|agreement-view|settings))|billing\/(?:state|quote|payment-status|bank-submit|guest\/(?:info|status)|admin\/(?:overview|settings|proof)))$/;
const WAITS = [0, 300, 900, 1800];
// A request that must not be repeated (sign-up, booking...) often failed because the browser sent it on a connection that had
// died while the page was idle. So after a quiet time a tiny GET first finds a live address; that one is safe to repeat.
const IDLE_MS = 15000;
const PING_MS = 5000;

/** the same call on the worker's other address, or null for any other host */
export function otherAddress(url) {
  if (typeof url !== "string") return null;
  if (url.startsWith(API + "/") || url === API) return WORKER + url.slice(API.length);
  if (url.startsWith(WORKER + "/") || url === WORKER) return API + url.slice(WORKER.length);
  return null;
}

/** is this request safe to repeat after a network error? */
export function isRepeatable(method, url) {
  if (method === "GET" || method === "HEAD") return true;
  if (method !== "POST") return false;
  try {
    const u = new URL(url);
    return (u.origin === API || u.origin === WORKER) && SAFE_POST.test(u.pathname);
  } catch {
    return false;
  }
}

export const FRIENDLY_NETWORK_ERROR = "Connection problem: could not reach the server. Please try again.";

/** the same call on an address that answers right now; throws when neither does */
async function liveAddress(original, url, signal) {
  const other = otherAddress(url);
  let last = null;
  for (let attempt = 0; attempt < WAITS.length; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, WAITS[attempt]));
    if (signal?.aborted) return url;
    const target = attempt % 2 === 1 ? other : url;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PING_MS);
    try {
      await original(`${new URL(target).origin}/ping`, { cache: "no-store", signal: ctl.signal });
      return target;
    } catch (err) {
      last = err;
    } finally {
      clearTimeout(timer);
    }
  }
  const e = new TypeError(FRIENDLY_NETWORK_ERROR);
  e.cause = last;
  throw e;
}

export function installFetchRetry() {
  if (typeof window === "undefined" || typeof window.fetch !== "function" || window.__neFetchRetry) return;
  window.__neFetchRetry = true;
  const original = window.fetch.bind(window);
  let lastAnswer = 0; // when our worker last answered this page
  window.fetch = async (input, init) => {
    const isReq = typeof Request !== "undefined" && input instanceof Request;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : isReq ? input.url : "";
    const method = String(init?.method || (isReq && input.method) || "GET").toUpperCase();
    const signal = init?.signal || (isReq ? input.signal : undefined);
    const repeatable = isRepeatable(method, url);
    const alt = repeatable && !isReq ? otherAddress(url) : null;
    const ours = !isReq && otherAddress(url) !== null;
    if (ours && !repeatable && Date.now() - lastAnswer > IDLE_MS) input = await liveAddress(original, url, signal);
    let lastErr = null;
    for (let attempt = 0; attempt < (repeatable ? WAITS.length : 1); attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, WAITS[attempt]));
      // 1st try as asked, 2nd on the other address, then both again
      const target = alt && attempt % 2 === 1 ? alt : input;
      try {
        const res = await original(isReq ? input.clone() : target, init);
        if (ours) lastAnswer = Date.now();
        return res;
      } catch (err) {
        lastErr = err;
        if (!(err instanceof TypeError) || signal?.aborted) throw err;
      }
    }
    if (lastErr instanceof TypeError) {
      const e = new TypeError(FRIENDLY_NETWORK_ERROR);
      e.cause = lastErr;
      throw e;
    }
    throw lastErr;
  };
}
