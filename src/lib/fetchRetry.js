// fetch + JSON with patience for slow or flaky connections: each try waits up to `timeoutMs`, and a network error,
// a timeout, a 5xx or a reply that isn't JSON is tried again (after 1.5s, then 3s). A 4xx answer is returned as is.
export async function fetchJsonRetry(url, init = {}, { tries = 3, timeoutMs = 25000 } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * i));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500) { lastErr = new TypeError(`server ${res.status}`); continue; }
      const data = await res.json().catch(() => null);
      if (data === null) { lastErr = new TypeError("bad response"); continue; }
      return data;
    } catch (err) {
      lastErr = err instanceof TypeError ? err : new TypeError(err?.message || "network");
    }
  }
  throw lastErr || new TypeError("network");
}
