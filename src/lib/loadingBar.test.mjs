import test from "node:test";
import assert from "node:assert/strict";
import { isTrackedUrl, startLoading, subscribeLoading, armLoading, isArmed } from "./loadingBar.js";

test("only armed (user-started) loading counts; a running bar keeps chained calls in it", async () => {
  assert.equal(isArmed(), false); // nothing armed yet: a background refresh would not move the bar
  armLoading(30);
  assert.equal(isArmed(), true);
  const done = startLoading();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(isArmed(), true); // window over, but the bar is still running, so the next call in the chain joins it
  done();
  assert.equal(isArmed(), false);
});

test("tracks our backends, ignores logs, realtime and other hosts", () => {
  assert.equal(isTrackedUrl("https://x.supabase.co/rest/v1/orders"), true);
  assert.equal(isTrackedUrl("https://neezam-erp.chmabdulsamee9.workers.dev/orders-page"), true);
  assert.equal(isTrackedUrl("https://x.supabase.co/rest/v1/dev_monitoring_log"), false);
  assert.equal(isTrackedUrl("wss://x.supabase.co/realtime/v1/websocket"), false);
  assert.equal(isTrackedUrl("https://cdn.shopify.com/a.png"), false);
  assert.equal(isTrackedUrl(undefined), false);
});

test("counter goes up and down, a second done() is ignored", () => {
  const seen = [];
  const off = subscribeLoading((n) => seen.push(n));
  const a = startLoading();
  const b = startLoading();
  a(); a(); b();
  off();
  assert.deepEqual(seen, [0, 1, 2, 1, 0]);
});
