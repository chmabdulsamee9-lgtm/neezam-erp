import { test } from "node:test";
import assert from "node:assert/strict";
import { readSidebarOpen, writeSidebarOpen, clearSidebarOpen, createIdleCollapse, SIDEBAR_IDLE_MS } from "./sidebarState.js";

const memory = () => {
  const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  return { localStorage: mk(), sessionStorage: mk() };
};

test("sidebar starts collapsed, keeps a manual toggle for the session only, and drops old localStorage values", () => {
  const w = memory();
  assert.equal(readSidebarOpen(w), false);
  w.localStorage.setItem("neezam_sidebar_open", "1");
  assert.equal(readSidebarOpen(w), false, "an old persisted value is ignored");
  assert.equal(w.localStorage.getItem("neezam_sidebar_open"), null, "and removed");
  writeSidebarOpen(true, w);
  assert.equal(readSidebarOpen(w), true, "refresh keeps the manual choice");
  clearSidebarOpen(w);
  assert.equal(readSidebarOpen(w), false, "login clears it");
  assert.equal(readSidebarOpen(null), false);
});

// a tiny fake clock
function fakeTimers() {
  let now = 0, seq = 0; const q = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => { q.delete(id); },
    advance(ms) { const end = now + ms; for (;;) { const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; now = next[1].at; q.delete(next[0]); next[1].fn(); } now = end; },
    pending: () => q.size,
  };
}

test("idle collapse: fires after 120 s, pointer activity resets it, stop cancels it", () => {
  const timers = fakeTimers(); let n = 0;
  const c = createIdleCollapse({ onIdle: () => { n++; }, timers });
  c.touch();
  timers.advance(SIDEBAR_IDLE_MS - 1000); assert.equal(n, 0);
  c.touch(); // pointer moved
  timers.advance(SIDEBAR_IDLE_MS - 1000); assert.equal(n, 0, "the countdown restarted");
  timers.advance(1000); assert.equal(n, 1);
  c.touch(); c.stop(); timers.advance(SIDEBAR_IDLE_MS * 2); assert.equal(n, 1);
  assert.equal(timers.pending(), 0, "nothing left running after stop (unmount)");
});

test("idle collapse: does not collapse while a popup is open or an input is focused, and counts another full delay", () => {
  const timers = fakeTimers(); let n = 0; let blocked = true;
  const c = createIdleCollapse({ onIdle: () => { n++; }, canCollapse: () => !blocked, timers });
  c.touch();
  timers.advance(SIDEBAR_IDLE_MS); assert.equal(n, 0);
  blocked = false;
  timers.advance(SIDEBAR_IDLE_MS - 1); assert.equal(n, 0);
  timers.advance(1); assert.equal(n, 1);
});
