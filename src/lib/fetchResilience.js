// Some networks in Pakistan drop Chrome's HTTP/3 (QUIC) connections to Cloudflare now and then
// (ERR_QUIC_PROTOCOL_ERROR / "Failed to fetch"), although the internet itself works. Chrome then retries over a normal
// connection, so a read request that fails with a network error is simply tried again (twice, after 0.4s and 1.2s).
// Only GET/HEAD: they never change data, so repeating them is always safe. Aborted or timed-out requests are not retried.
let installed = false;

export function installFetchRetry() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return original(input, init);
    const signal = init?.signal || (typeof input === "object" ? input?.signal : undefined);
    const waits = [400, 1200];
    for (let attempt = 0; ; attempt++) {
      try {
        return await original(typeof input === "object" && input instanceof Request ? input.clone() : input, init);
      } catch (err) {
        const network = err instanceof TypeError && !signal?.aborted;
        if (!network || attempt >= waits.length) throw err;
        await new Promise((r) => setTimeout(r, waits[attempt]));
      }
    }
  };
}
