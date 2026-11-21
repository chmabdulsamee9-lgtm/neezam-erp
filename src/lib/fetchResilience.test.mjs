import test from "node:test";
import assert from "node:assert/strict";
import { otherAddress, isRepeatable, FRIENDLY_NETWORK_ERROR, installFetchRetry } from "./fetchResilience.js";

const API = "https://api.eneezam.com";
const WORKER = "https://neezam-erp.chmabdulsamee9.workers.dev";

test("the worker's two addresses map to each other, other hosts to nothing", () => {
  assert.equal(otherAddress(`${API}/get-x?a=1`), `${WORKER}/get-x?a=1`);
  assert.equal(otherAddress(`${WORKER}/get-x`), `${API}/get-x`);
  assert.equal(otherAddress("https://x.supabase.co/rest/v1/orders"), null);
});

test("only repeat-safe requests are repeated", () => {
  assert.equal(isRepeatable("GET", "https://x.supabase.co/rest/v1/orders"), true);
  assert.equal(isRepeatable("POST", `${API}/save-checkout-settings`), true);
  assert.equal(isRepeatable("POST", `${API}/get-store-extras`), true);
  assert.equal(isRepeatable("POST", `${API}/dex-book-order`), false);
  assert.equal(isRepeatable("POST", `${API}/whatsapp/send`), false);
  assert.equal(isRepeatable("DELETE", `${API}/remove-custom-domain`), false);
  assert.equal(isRepeatable("POST", "https://example.com/save-x"), false);
});

function install(handler) {
  const calls = [];
  globalThis.window = { fetch: async (input, init) => { calls.push(String(input)); return handler(String(input), calls.length); } };
  delete globalThis.window.__neFetchRetry;
  installFetchRetry();
  return { calls, fetch: (u, i) => globalThis.window.fetch(u, i) };
}
const down = () => Promise.reject(new TypeError("Failed to fetch"));

test("a GET that fails on api.eneezam.com succeeds on the other address", async () => {
  const { calls, fetch } = install((u) => (u.startsWith(API) ? down() : Promise.resolve({ ok: true })));
  const res = await fetch(`${API}/get-performance-stats?x=1`);
  assert.equal(res.ok, true);
  assert.equal(calls[0].startsWith(API), true);
  assert.equal(calls[1].startsWith(WORKER), true);
});

test("a risky POST is tried once, and the error is readable", async () => {
  const { calls, fetch } = install(() => down());
  await assert.rejects(() => fetch(`${API}/dex-book-order`, { method: "POST", body: "{}" }), (e) => e instanceof TypeError && e.message === FRIENDLY_NETWORK_ERROR);
  assert.equal(calls.length, 1);
});

test("a save POST is retried; an aborted request is not", async () => {
  const a = install((u, n) => (n < 3 ? down() : Promise.resolve({ ok: true })));
  const res = await a.fetch(`${API}/save-checkout-settings`, { method: "POST", body: "{}" });
  assert.equal(res.ok, true);
  assert.equal(a.calls.length, 3);
  const ctl = new AbortController();
  const b = install(() => { ctl.abort(); return down(); });
  await assert.rejects(() => b.fetch(`${API}/get-x`, { signal: ctl.signal }));
  assert.equal(b.calls.length, 1);
});
