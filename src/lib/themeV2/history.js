// Undo / redo stack for the theme_config draft. Pure: every function returns a new history object.
// `key` coalesces rapid edits of the same control (typing, dragging a slider) into one undo step.

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 900;

export const createHistory = (initial) => ({ past: [], present: initial, future: [], lastKey: null, lastAt: 0 });

export function pushState(h, next, { key = null, now = Date.now() } = {}) {
  if (next === h.present) return h;
  if (key && key === h.lastKey && now - h.lastAt < COALESCE_MS && h.past.length) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

export function undo(h) {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}

export function redo(h) {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
}

/** replace the current state without creating an undo step (initial load, re-sync) */
export const resetHistory = (initial) => createHistory(initial);
