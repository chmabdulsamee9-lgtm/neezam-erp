import { test } from "node:test";
import assert from "node:assert/strict";
import { readSidebarOpen, writeSidebarOpen, clearSidebarOpen, resetSidebarStorage, createIdleCollapse, SIDEBAR_IDLE_MS } from "./sidebarState.js";

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

test("default timers work when setTimeout is strict about its receiver (the browser white-screen bug: window.setTimeout called as a method of another object throws)", () => {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const strict = (name, fn) => function (...a) { if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation: " + name); return fn(...a); };
  globalThis.setTimeout = strict("setTimeout", realSet);
  globalThis.clearTimeout = strict("clearTimeout", realClear);
  try {
    const c = createIdleCollapse({ onIdle: () => {} }); // default timers
    c.touch(); c.touch(); c.stop();
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});

test("corrupt or unexpected stored values start collapsed; resetSidebarStorage clears everything", () => {
  const w = memory();
  for (const bad of ["true", "yes", "2", "{}", "null", "undefined", ""]) {
    w.sessionStorage.setItem("neezam_sidebar_open", bad);
    assert.equal(readSidebarOpen(w), false, JSON.stringify(bad));
  }
  const broken = { localStorage: { removeItem() { throw new Error("blocked"); } }, sessionStorage: { getItem() { throw new Error("blocked"); } } };
  assert.equal(readSidebarOpen(broken), false);
  writeSidebarOpen(true, w);
  w.localStorage.setItem("neezam_sidebar", "1");
  resetSidebarStorage(w);
  assert.equal(readSidebarOpen(w), false);
  assert.equal(w.localStorage.getItem("neezam_sidebar"), null);
});
