// Pure logic of the v2 theme editor shell (no React): keyboard shortcuts, the inspector preference, the dual
// mobile view scroll maths with its loop guard, the custom scrollbar geometry and the "Save as draft" requests.
// Unit-tested in themeV2.test.mjs.

/** the five editable pages (labels are i18n keys; the product page previews a real product of the store) */
export const TEMPLATES = [
  { key: "home", labelKey: "themeEditor.page.home", url: "/" },
  { key: "collection", labelKey: "themeEditor.page.collection", url: "/collection" },
  { key: "product", labelKey: "themeEditor.page.product", url: "/collection" },
  { key: "cart", labelKey: "themeEditor.page.cart", url: "/cart" },
  { key: "checkout", labelKey: "themeEditor.page.checkout", url: "/checkout" },
];

/* ------------------------------------------------------------------ shortcuts */
export const SHORTCUTS = {
  sections: ["CTRL", "1"],
  theme: ["CTRL", "2"],
  products: ["CTRL", "3"],
  inspector: ["SHIFT", "I"],
  undo: ["CTRL", "Z"],
  redo: ["CTRL", "SHIFT", "Z"],
  save: ["CTRL", "S"],
};

export function isTypingTarget(el) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true);
}

/** keyboard event -> action name or null. While typing only save/undo/redo fire. */
export function matchShortcut(e, typing) {
  const mod = e.ctrlKey || e.metaKey;
  const k = String(e.key || "").toLowerCase();
  if (mod && !e.altKey) {
    if (k === "s") return "save";
    if (k === "z") return e.shiftKey ? "redo" : "undo";
    if (k === "y") return "redo";
    if (typing) return null;
    if (k === "1") return "sections";
    if (k === "2") return "theme";
    if (k === "3") return "products";
    return null;
  }
  if (typing) return null;
  if (e.shiftKey && !e.altKey && !mod && k === "i") return "inspector";
  return null;
}

/* ------------------------------------------------------------------ inspector preference (per browser user, no store data) */
export const INSPECTOR_KEY = "ne-theme-editor-inspector";
export function readInspector(storage) {
  try { return storage?.getItem(INSPECTOR_KEY) !== "off"; } catch { return true; }
}
export function writeInspector(storage, on) {
  try { storage?.setItem(INSPECTOR_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
}

/* ------------------------------------------------------------------ dual mobile view: frame 2 continues below frame 1 */
/** frame 1 may scroll only so far that frame 2 still reaches the real bottom */
export const maxTop1 = (height, client) => Math.max(0, height - 2 * client);
export const clampTop1 = (top1, height, client) => Math.min(Math.max(0, top1), maxTop1(height, client));
/** frame 2 shows what is directly below frame 1 (clamped to its own max when the page is short) */
export const frame2Top = (top1, height, client) => Math.min(top1 + client, Math.max(0, height - client));
export const top1FromFrame2 = (top2, height, client) => clampTop1(top2 - client, height, client);

export function createScrollSync() {
  return { dual: false, metrics: { 1: null, 2: null }, expect: { 1: null, 2: null } };
}

/**
 * A frame reported its scroll position. Returns the scroll-to commands needed to keep the pair aligned.
 * Reports caused by our own scroll-to (programmatic, or matching what we asked for) never trigger more
 * commands, so the two frames cannot fight each other.
 */
export function onScrollReport(state, frame, r) {
  state.metrics[frame] = r;
  const echo = r.programmatic || (state.expect[frame] !== null && Math.abs(state.expect[frame] - r.top) <= 1);
  if (echo) { state.expect[frame] = null; return []; }
  if (!state.dual) return [];
  const { height, client } = r;
  const cmds = [];
  let t1;
  if (frame === 1) {
    t1 = clampTop1(r.top, height, client);
    if (Math.abs(t1 - r.top) > 1) cmds.push({ frame: 1, top: t1 });
  } else {
    t1 = top1FromFrame2(r.top, height, client);
    cmds.push({ frame: 1, top: t1 });
  }
  const t2 = frame2Top(t1, height, client);
  if (frame === 1 || Math.abs(t2 - r.top) > 1) cmds.push({ frame: 2, top: t2 });
  for (const c of cmds) state.expect[c.frame] = c.top;
  return cmds;
}

/** commands to put the pair (or the single frame) at a frame-1 position, e.g. from the custom scrollbar */
export function scrollPairTo(state, top1) {
  const m = state.metrics[1];
  if (!m) return [];
  const t1 = state.dual ? clampTop1(top1, m.height, m.client) : Math.min(Math.max(0, top1), Math.max(0, m.height - m.client));
  const cmds = [{ frame: 1, top: t1 }];
  if (state.dual) cmds.push({ frame: 2, top: frame2Top(t1, m.height, m.client) });
  for (const c of cmds) state.expect[c.frame] = c.top;
  return cmds;
}

/** custom scrollbar thumb: { size, offset } in px of a track `trackPx` long; null when nothing scrolls */
export function thumbGeometry({ top, height, client }, trackPx, dual = false) {
  const visible = dual ? Math.min(height, 2 * client) : client;
  if (!height || height <= visible + 1 || !trackPx) return null;
  const size = Math.max(28, Math.round((visible / height) * trackPx));
  const range = dual ? maxTop1(height, client) : height - client;
  const offset = range > 0 ? Math.round((Math.min(top, range) / range) * (trackPx - size)) : 0;
  return { size, offset };
}

/** scroll position for a thumb offset (inverse of thumbGeometry) */
export function topFromThumb(offsetPx, { height, client }, trackPx, dual = false) {
  const g = thumbGeometry({ top: 0, height, client }, trackPx, dual);
  if (!g) return 0;
  const range = dual ? maxTop1(height, client) : height - client;
  return Math.round((Math.max(0, Math.min(trackPx - g.size, offsetPx)) / (trackPx - g.size)) * range);
}

/* ------------------------------------------------------------------ Save as draft (published theme -> new draft) */
/**
 * Creates a new draft from the published theme row, then writes the edited config into the draft. The
 * published theme itself is never written. `request(path, init)` returns parsed JSON (injected for tests).
 */
export async function saveAsDraft({ request, storeId, themeId, name, config }) {
  const created = await request("/create-store-theme", { method: "POST", body: { store_id: storeId, name, source_theme_id: themeId } });
  if (!created?.theme?.id) return { ok: false, error: created?.error || null };
  const draftId = created.theme.id;
  const put = await request("/update-store-theme", { method: "PUT", body: { theme_id: draftId, theme_config: config } });
  if (!put?.success) return { ok: false, draftId, error: put?.error || null };
  return { ok: true, draftId };
}
