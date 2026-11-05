// ERP side of the v2 theme engine: the synced copy must match its single source (drift check), and the editor's
// tree/history logic must hold on a real Nova config.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as V2 from "./engine.generated.js";
import { createHistory, pushState, undo, redo, canUndo } from "../themeEditor/history.js";

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
