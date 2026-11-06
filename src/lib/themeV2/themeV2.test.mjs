// ERP side of the v2 theme engine: the synced copy must match its single source (drift check), and the editor's
// tree/history logic must hold on a real Nova config.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as V2 from "./engine.generated.js";
import { createHistory, pushState, undo, redo, canUndo, canRedo, HISTORY_LIMIT } from "./history.js";
import * as L from "./editorLogic.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("synced engine copy matches neezam-erp-worker/shared/theme-v2 (fails on drift)", () => {
  // exits 1 with a message when the copy is stale; skips cleanly when the worker repo is not checked out next to this one
  const out = execFileSync(process.execPath, [join(root, "scripts", "sync-theme-v2.mjs"), "--check"], { encoding: "utf8" });
  assert.match(out, /matches the source|skipped/);
});

test("Nova default config is valid and isV2; legacy configs are not v2", () => {
  const cfg = V2.createDefaultConfig(V2.NOVA_ID);
  assert.equal(V2.isV2(cfg), true);
  assert.equal(V2.validateThemeConfig(cfg).ok, true);
  assert.equal(V2.isV2({ settings: { active_theme_id: 5 }, layouts: {} }), false);
  assert.equal(V2.NOVA_NAME.length > 0, true);
});

test("editor flow: add a section and a block, edit, undo/redo with typing coalesced", () => {
  let h = createHistory(V2.createDefaultConfig(V2.NOVA_ID));
  const add = V2.addSection(h.present, "home", "multicolumn");
  h = pushState(h, add.config);
  const b = V2.addBlock(h.present, "home", add.id, "column");
  h = pushState(h, b.config);
  for (const v of ["W", "Wh", "Why"]) h = pushState(h, V2.setBlockSetting(h.present, "home", add.id, b.id, "title", v), { key: `${add.id}.${b.id}.title` });
  assert.equal(V2.containerOf(h.present, "home").sections[add.id].blocks[b.id].settings.title, "Why");
  h = undo(h); // one step undoes the whole typing burst
  assert.equal(V2.containerOf(h.present, "home").sections[add.id].blocks[b.id].settings.title, "Column");
  h = undo(h);
  assert.equal(V2.containerOf(h.present, "home").sections[add.id].blocks[b.id], undefined);
  h = redo(redo(h));
  assert.equal(V2.containerOf(h.present, "home").sections[add.id].blocks[b.id].settings.title, "Why");
  assert.ok(canUndo(h));
  assert.equal(V2.validateThemeConfig(h.present).ok, true);
});

test("findSection locates sections in groups and templates (preview click to tree)", () => {
  const cfg = V2.createDefaultConfig(V2.NOVA_ID);
  assert.deepEqual(V2.findSection(cfg, "header-1"), { scope: "header" });
  assert.deepEqual(V2.findSection(cfg, "footer-1"), { scope: "footer" });
  assert.deepEqual(V2.findSection(cfg, "main-product-1"), { scope: "product" });
  assert.equal(V2.findSection(cfg, "nope"), null);
});

test("every schema label resolves in both languages", () => {
  const theme = V2.getTheme(V2.NOVA_ID);
  for (const s of theme.sections) {
    assert.notEqual(V2.label(`s.${s.type}`, "en"), `s.${s.type}`);
    assert.notEqual(V2.label(`s.${s.type}`, "ur"), V2.label(`s.${s.type}`, "en"));
  }
});

/* ------------------------------------------------------------------ editor shell logic (editorLogic.js) */
const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("shortcuts: tabs, inspector, undo/redo, save; only save/undo/redo while typing", () => {
  assert.equal(L.matchShortcut(key("1", { ctrlKey: true }), false), "sections");
  assert.equal(L.matchShortcut(key("2", { ctrlKey: true }), false), "theme");
  assert.equal(L.matchShortcut(key("3", { metaKey: true }), false), "products");
  assert.equal(L.matchShortcut(key("I", { shiftKey: true }), false), "inspector");
  assert.equal(L.matchShortcut(key("z", { ctrlKey: true }), false), "undo");
  assert.equal(L.matchShortcut(key("Z", { ctrlKey: true, shiftKey: true }), false), "redo");
  assert.equal(L.matchShortcut(key("s", { ctrlKey: true }), false), "save");
  assert.equal(L.matchShortcut(key("I", { shiftKey: true }), true), null, "capital I typed into a field");
  assert.equal(L.matchShortcut(key("2", { ctrlKey: true }), true), null);
  assert.equal(L.matchShortcut(key("s", { ctrlKey: true }), true), "save");
  assert.equal(L.matchShortcut(key("z", { ctrlKey: true }), true), "undo");
  assert.equal(L.matchShortcut(key("a"), false), null);
  assert.equal(L.matchShortcut(key("1", { ctrlKey: true, altKey: true }), false), null);
  assert.equal(L.isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(L.isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(L.isTypingTarget({ tagName: "BUTTON" }), false);
});

test("inspector preference: defaults on, remembers off/on, survives blocked storage", () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(L.readInspector(storage), true);
  L.writeInspector(storage, false);
  assert.equal(L.readInspector(storage), false);
  L.writeInspector(storage, true);
  assert.equal(L.readInspector(storage), true);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(L.readInspector(blocked), true);
  assert.doesNotThrow(() => L.writeInspector(blocked, false));
  assert.equal(L.readInspector(null), true);
});

test("dual view maths: frame 2 continues below frame 1, frame 1 clamped, short pages", () => {
  const H = 3000, C = 800;
  assert.equal(L.maxTop1(H, C), 1400);
  assert.equal(L.frame2Top(0, H, C), 800);
  assert.equal(L.frame2Top(1400, H, C), 2200, "frame 2 reaches the real bottom");
  assert.equal(L.clampTop1(1900, H, C), 1400);
  assert.equal(L.clampTop1(-20, H, C), 0);
  assert.equal(L.top1FromFrame2(1000, H, C), 200);
  assert.equal(L.top1FromFrame2(100, H, C), 0);
  assert.equal(L.maxTop1(1200, C), 0, "shorter than two frames: frame 1 stays at the top");
  assert.equal(L.frame2Top(0, 1200, C), 400, "and frame 2 sits at its own max (overlap allowed)");
});

test("dual view sync: commands follow the other frame and never loop", () => {
  const s = L.createScrollSync();
  s.dual = true;
  const m = { height: 3000, client: 800 };
  let cmds = L.onScrollReport(s, 1, { ...m, top: 300, programmatic: false });
  assert.deepEqual(cmds, [{ frame: 2, top: 1100 }]);
  assert.deepEqual(L.onScrollReport(s, 2, { ...m, top: 1100, programmatic: true }), [], "our own scroll echo produces nothing");
  cmds = L.onScrollReport(s, 2, { ...m, top: 1500, programmatic: false });
  assert.deepEqual(cmds, [{ frame: 1, top: 700 }], "user scrolls frame 2: frame 1 follows");
  assert.deepEqual(L.onScrollReport(s, 1, { ...m, top: 700, programmatic: false }), [], "matching the expected value is an echo too");
  cmds = L.onScrollReport(s, 1, { ...m, top: 2000, programmatic: false });
  assert.deepEqual(cmds, [{ frame: 1, top: 1400 }, { frame: 2, top: 2200 }], "frame 1 past its range is pulled back");
  s.expect = { 1: null, 2: null };
  cmds = L.onScrollReport(s, 2, { ...m, top: 200, programmatic: false });
  assert.deepEqual(cmds, [{ frame: 1, top: 0 }, { frame: 2, top: 800 }], "frame 2 above the continuation point is corrected");
  assert.deepEqual(L.onScrollReport(L.createScrollSync(), 1, { ...m, top: 500 }), [], "single view: never a command");
});

test("custom scrollbar geometry and its inverse; scroll-to from the bar moves the pair", () => {
  assert.deepEqual(L.thumbGeometry({ top: 0, height: 4000, client: 1000 }, 1000), { size: 250, offset: 0 });
  assert.equal(L.thumbGeometry({ top: 3000, height: 4000, client: 1000 }, 1000).offset, 750);
  assert.equal(L.thumbGeometry({ top: 0, height: 900, client: 1000 }, 1000), null, "nothing to scroll");
  assert.equal(L.topFromThumb(375, { height: 4000, client: 1000 }, 1000), 1500);
  assert.equal(L.thumbGeometry({ top: 0, height: 4000, client: 1000 }, 1000, true).size, 500, "dual shows two frames of content");
  const s = L.createScrollSync();
  assert.deepEqual(L.scrollPairTo(s, 100), [], "no metrics yet");
  s.metrics[1] = { top: 0, height: 4000, client: 1000 };
  assert.deepEqual(L.scrollPairTo(s, 5000), [{ frame: 1, top: 3000 }]);
  s.dual = true;
  assert.deepEqual(L.scrollPairTo(s, 5000), [{ frame: 1, top: 2000 }, { frame: 2, top: 3000 }]);
});

test("save as draft: creates a draft from the published theme, then writes the edited config to the draft only", async () => {
  const calls = [];
  const request = async (path, init) => { calls.push({ path, ...init }); return path === "/create-store-theme" ? { theme: { id: "d9" } } : { success: true }; };
  const cfg = V2.createDefaultConfig(V2.NOVA_ID);
  const r = await L.saveAsDraft({ request, storeId: "s1", themeId: "pub1", name: "Nova (draft)", config: cfg });
  assert.deepEqual(r, { ok: true, draftId: "d9" });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [["POST", "/create-store-theme"], ["PUT", "/update-store-theme"]]);
  assert.equal(calls[0].body.source_theme_id, "pub1");
  assert.equal(calls[1].body.theme_id, "d9", "the published theme is never written");
  assert.equal(calls[1].body.confirm_published, undefined);
  assert.deepEqual(await L.saveAsDraft({ request: async () => ({ error: "nope" }), storeId: "s1", themeId: "pub1", name: "x", config: cfg }), { ok: false, error: "nope" });
  const failPut = await L.saveAsDraft({ request: async (p) => (p === "/create-store-theme" ? { theme: { id: "d2" } } : { error: "bad" }), storeId: "s1", themeId: "pub1", name: "x", config: cfg });
  assert.deepEqual(failPut, { ok: false, draftId: "d2", error: "bad" });
});

test("discard: the history resets to the last saved config", () => {
  const savedJson = JSON.stringify(V2.createDefaultConfig(V2.NOVA_ID));
  let h = createHistory(JSON.parse(savedJson));
  h = pushState(h, V2.setThemeSetting(h.present, "radius", 2));
  assert.notEqual(JSON.stringify(h.present), savedJson);
  const reverted = createHistory(JSON.parse(savedJson)); // what Discard does
  assert.equal(JSON.stringify(reverted.present), savedJson);
  assert.equal(canUndo(reverted), false);
});

test("insert at index: preview + before/after a section and the tree + between rows", () => {
  const cfg = V2.createDefaultConfig(V2.NOVA_ID);
  const before = V2.insertPointFor(cfg, "faq-1", "before");
  const r = V2.addSection(cfg, before.scope, "rich-text", { index: before.index });
  const order = r.config.templates.home.order;
  assert.equal(order[order.indexOf("faq-1") - 1], r.id);
  const after = V2.insertPointFor(cfg, "hero-1", "after");
  const r2 = V2.addSection(cfg, after.scope, "spacer", { index: after.index });
  assert.equal(r2.config.templates.home.order[1], r2.id);
  const tree = V2.addSection(cfg, "footer", "newsletter", { index: 0 });
  assert.equal(tree.config.groups.footer.order[0], tree.id, "header/footer groups too");
  assert.equal(V2.addSection(cfg, "home", "main-product", { index: 0 }).id, null, "page rules still apply");
});

/* ------------------------------------------------------------------ undo/redo history (history.js) */
test("history: push, undo, redo, new edit clears redo", () => {
  let h = createHistory({ v: 0 });
  assert.equal(canUndo(h), false);
  const s1 = { v: 1 }, s2 = { v: 2 }, s3 = { v: 3 };
  h = pushState(h, s1, { now: 1000 });
  h = pushState(h, s2, { now: 5000 });
  assert.equal(h.present, s2);
  assert.equal(canUndo(h), true);
  h = undo(h);
  assert.equal(h.present, s1);
  assert.equal(canRedo(h), true);
  h = undo(h);
  assert.deepEqual(h.present, { v: 0 });
  assert.equal(undo(h), h, "nothing to undo");
  h = redo(h);
  assert.equal(h.present, s1);
  h = pushState(h, s3, { now: 9000 });
  assert.equal(canRedo(h), false, "a new edit drops the redo branch");
  h = undo(h);
  assert.equal(h.present, s1);
  assert.equal(redo(redo(h)).present, s3, "redo past the end stays put");
});

test("history: same-key edits within the window coalesce into one undo step; a different key or a pause starts a new one", () => {
  let h = createHistory({ t: "" });
  h = pushState(h, { t: "a" }, { key: "title", now: 1000 });
  h = pushState(h, { t: "ab" }, { key: "title", now: 1300 });
  h = pushState(h, { t: "abc" }, { key: "title", now: 1600 });
  assert.equal(h.past.length, 1);
  assert.deepEqual(undo(h).present, { t: "" }, "one undo reverts the whole typing burst");
  h = pushState(h, { t: "abcd" }, { key: "other", now: 1700 });
  assert.equal(h.past.length, 2);
  h = pushState(h, { t: "abcde" }, { key: "other", now: 9000 });
  assert.equal(h.past.length, 3, "a pause longer than the window starts a new step");
  const same = h.present;
  assert.equal(pushState(h, same), h, "pushing the identical state is ignored");
});

test("history is capped", () => {
  let h = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = pushState(h, i, { now: i * 5000 });
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(h.present, HISTORY_LIMIT + 20);
});

