// Unit tests for the theme editor's pure logic (tree operations, defaults, history, settings helpers).
// Run: npm test   (node's built-in runner, no network, no database, fixtures only)
import test from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATES, defaultSections, resolveSections, withResolvedLayout, mutateSections, groupSections, canAddType, addableTypes,
  addSection, removeSection, duplicateSection, toggleSection, setSectionSetting, moveSection, canMove, reorderSection, isLocked, laneOf,
} from "./layout.js";
import { createHistory, pushState, undo, redo, canUndo, canRedo, HISTORY_LIMIT } from "./history.js";
import { getIn, setIn, isHex, toSixHex, linkProblem, paletteDefault } from "./settingsModel.js";
import { SECTION_REGISTRY } from "./registry.js";

let n = 0;
const ids = () => { n = 0; return (p) => `${p}-${++n}`; };
const types = (arr) => arr.map((s) => s.type);
const idsOf = (arr) => arr.map((s) => s.id);

test("registry has the storefront's section types and every addable one has a schema/defaults", () => {
  assert.ok(SECTION_REGISTRY.length >= 50);
  for (const m of SECTION_REGISTRY) {
    assert.equal(typeof m.type, "string");
    assert.ok(m.defaults && typeof m.defaults === "object", m.type);
    assert.ok(Array.isArray(m.schema), m.type);
    for (const f of m.schema) assert.ok(["text", "textarea", "number", "toggle", "select", "range"].includes(f.kind), `${m.type}.${f.key}`);
  }
});

test("default layouts mirror the storefront for every template and design theme", () => {
  const g = ids();
  assert.deepEqual(types(defaultSections("home", 1, g)), ["announcement-bar", "hero", "featured-collection", "promo-banner", "collection-list", "testimonials", "brand-story", "stats-row", "newsletter"]);
  assert.equal(defaultSections("home", 5, g)[0].type, "jp-announce");
  assert.equal(defaultSections("home", 6, g).length, 8);
  assert.equal(defaultSections("home", 7, g).at(-1).type, "newsletter");
  assert.equal(defaultSections("home", 8, g)[1].type, "vince-hero");
  assert.deepEqual(types(defaultSections("collection", 1, g)), ["collection-main"]);
  assert.deepEqual(types(defaultSections("product", 1, g)), ["product-main", "product-reviews", "related-products"]);
  assert.deepEqual(types(defaultSections("cart", 1, g)), ["cart-main"]);
  assert.deepEqual(types(defaultSections("checkout", 1, g)), ["checkout-main"]);
  assert.equal(TEMPLATES.length, 5);
});

test("empty saved layout falls back to the defaults (why the Sections list used to be empty) and ids stay stable", () => {
  const cache = new Map();
  const draft = { settings: { active_theme_id: 1 }, layouts: {} };
  const a = resolveSections(draft, "home", cache);
  const b = resolveSections(draft, "home", cache);
  assert.equal(a.length, 9);
  assert.equal(a, b, "same array reference from the cache");
  assert.deepEqual(idsOf(a), idsOf(b));
  const emptyArr = resolveSections({ settings: {}, layouts: { home: { sections: [] } } }, "home", cache);
  assert.equal(emptyArr.length, 9);
  const t5 = resolveSections({ settings: { active_theme_id: 5 }, layouts: {} }, "home", cache);
  assert.equal(t5[0].type, "jp-announce");
});

test("saved layouts are used as they are (old configs load identically)", () => {
  const saved = [{ id: "x1", type: "hero", enabled: true, settings: { title: "Hi" } }, { id: "x2", type: "newsletter", enabled: false, settings: {} }];
  const draft = { settings: { active_theme_id: 3 }, layouts: { home: { sections: saved } } };
  assert.equal(resolveSections(draft, "home", new Map()), saved);
  assert.equal(withResolvedLayout(draft, "home", new Map()), draft, "nothing materialized when a layout exists");
});

test("withResolvedLayout fills the effective sections without touching other keys", () => {
  const draft = { settings: { active_theme_id: 1 }, layouts: {}, product_meta: { p: { card_tag: "x" } } };
  const out = withResolvedLayout(draft, "cart", new Map(), ids());
  assert.deepEqual(types(out.layouts.cart.sections), ["cart-main"]);
  assert.equal(out.product_meta, draft.product_meta);
  assert.deepEqual(draft.layouts, {}, "input not mutated");
});

test("grouping: home has Header (announcement bars) + Template, other pages only Template; home-main is hidden", () => {
  const g = ids();
  const home = [makeS("announcement-bar", g), makeS("hero", g), makeS("home-main", g), makeS("announcement-bar", g), makeS("newsletter", g)];
  const groups = groupSections(home, "home");
  assert.deepEqual(groups.map((x) => x.key), ["header", "template"]);
  assert.deepEqual(types(groups[0].items), ["announcement-bar", "announcement-bar"]);
  assert.deepEqual(types(groups[1].items), ["hero", "newsletter"]);
  const prod = groupSections(defaultSections("product", 1, g), "product");
  assert.deepEqual(prod.map((x) => x.key), ["template"]);
  assert.equal(prod[0].items.length, 3);
  assert.equal(laneOf({ type: "announcement-bar" }, "cart"), "main");
});
function makeS(type, g) { return { id: g("sec"), type, enabled: true, settings: {} }; }

test("add section: only supported types for that page, defaults copied, appended or placed after a section", () => {
  const g = ids();
  const base = defaultSections("home", 1, g);
  assert.equal(canAddType("hero", "home"), true);
  assert.equal(canAddType("related-products", "home"), false, "product-only section not offered on home");
  assert.equal(canAddType("related-products", "product"), true);
  assert.equal(canAddType("home-main", "home"), false, "locked mains are never addable");
  assert.equal(canAddType("jp-hero", "cart"), false);
  assert.equal(canAddType("does-not-exist", "home"), false);
  assert.ok(addableTypes("home").every((m) => !m.locked));
  const added = addSection(base, "stats-row", "home", null, g);
  assert.equal(added.length, base.length + 1);
  assert.equal(added.at(-1).type, "stats-row");
  assert.deepEqual(added.at(-1).settings, SECTION_REGISTRY.find((m) => m.type === "stats-row").defaults);
  const mid = addSection(base, "ugc-strip", "home", base[1].id, g);
  assert.equal(mid[2].type, "ugc-strip");
  assert.equal(addSection(base, "nope", "home", null, g), base, "unknown type: unchanged reference");
  assert.equal(base.length, 9, "input not mutated");
});

test("delete section: removes it, but never a locked main section", () => {
  const g = ids();
  const prod = defaultSections("product", 1, g);
  assert.equal(removeSection(prod, prod[0].id), prod, "product-main is locked");
  const out = removeSection(prod, prod[1].id);
  assert.deepEqual(types(out), ["product-main", "related-products"]);
  assert.equal(removeSection(prod, "missing"), prod);
});

test("hide / show: flips enabled, locked sections cannot be hidden", () => {
  const g = ids();
  const home = defaultSections("home", 1, g);
  const hidden = toggleSection(home, home[1].id);
  assert.equal(hidden[1].enabled, false);
  assert.equal(home[1].enabled, true, "input not mutated");
  assert.equal(toggleSection(hidden, home[1].id)[1].enabled, true);
  const cart = defaultSections("cart", 1, g);
  assert.equal(toggleSection(cart, cart[0].id), cart);
});

test("duplicate: new id right after the original, deep-copied settings, locked cannot be duplicated", () => {
  const g = ids();
  const home = defaultSections("home", 1, g);
  const withEdit = setSectionSetting(home, home[1].id, "title", "Original");
  const dup = duplicateSection(withEdit, withEdit[1].id, g);
  assert.equal(dup.length, withEdit.length + 1);
  assert.equal(dup[2].type, "hero");
  assert.notEqual(dup[2].id, dup[1].id);
  const edited = setSectionSetting(dup, dup[2].id, "title", "Copy");
  assert.equal(edited[1].settings.title, "Original", "copy does not share settings with the original");
  const col = defaultSections("collection", 1, g);
  assert.equal(duplicateSection(col, col[0].id, g), col);
});

test("move up / down: swaps with the neighbour in the same lane, stops at the ends, locked cannot move", () => {
  const g = ids();
  const home = defaultSections("home", 1, g);
  const [bar, hero, feat] = home;
  assert.equal(canMove(home, bar.id, -1, "home"), false);
  assert.equal(canMove(home, hero.id, -1, "home"), false, "header lane neighbour is in another lane, so hero cannot go above the bar");
  const down = moveSection(home, hero.id, 1, "home");
  assert.deepEqual(idsOf(down).slice(0, 3), [bar.id, feat.id, hero.id]);
  const up = moveSection(down, hero.id, -1, "home");
  assert.deepEqual(idsOf(up), idsOf(home));
  assert.equal(moveSection(home, home.at(-1).id, 1, "home"), home);
  const prod = defaultSections("product", 1, g);
  assert.equal(moveSection(prod, prod[0].id, 1, "product"), prod, "locked main section cannot move");
  const two = [home[0], { ...home[0], id: "bar2" }, ...home.slice(1)];
  assert.deepEqual(idsOf(moveSection(two, "bar2", -1, "home")).slice(0, 2), ["bar2", home[0].id]);
});

test("drag reorder: before/after a target inside one lane; cross-lane and locked drops are refused", () => {
  const g = ids();
  const home = defaultSections("home", 1, g);
  const hero = home[1], news = home.at(-1);
  const moved = reorderSection(home, news.id, hero.id, "before", "home");
  assert.equal(moved[1].id, news.id);
  assert.equal(moved.length, home.length);
  const after = reorderSection(home, hero.id, news.id, "after", "home");
  assert.equal(after.at(-1).id, hero.id);
  assert.equal(reorderSection(home, hero.id, home[0].id, "before", "home"), home, "cannot cross from template lane into the header lane");
  assert.equal(reorderSection(home, hero.id, hero.id, "before", "home"), home);
  const prod = defaultSections("product", 1, g);
  assert.equal(reorderSection(prod, prod[0].id, prod[2].id, "after", "product"), prod, "locked main section is not draggable");
  const dropOnLocked = reorderSection(prod, prod[2].id, prod[0].id, "after", "product");
  assert.deepEqual(types(dropOnLocked), ["product-main", "related-products", "product-reviews"]);
  assert.equal(reorderSection(home, hero.id, home[2].id, "before", "home"), home, "dropping right where it already is changes nothing");
});

test("setSectionSetting changes only that key; unknown id is a no-op", () => {
  const g = ids();
  const home = defaultSections("home", 1, g);
  const out = setSectionSetting(home, home[0].id, "text", "Free delivery");
  assert.equal(out[0].settings.text, "Free delivery");
  assert.equal(out[0].settings.link_href, "/collection");
  assert.equal(out[1], home[1], "other sections keep their reference");
  assert.equal(setSectionSetting(home, "zzz", "a", 1), home);
});

test("mutateSections materializes the defaults on the first edit only, and never mutates the old draft", () => {
  const cache = new Map(), g = ids();
  const draft = { settings: { active_theme_id: 1 }, layouts: {}, product_meta: {} };
  const d2 = mutateSections(draft, "home", (arr) => toggleSection(arr, arr[1].id), cache, g);
  assert.equal(d2.layouts.home.sections.length, 9);
  assert.equal(d2.layouts.home.sections[1].enabled, false);
  assert.deepEqual(draft.layouts, {});
  assert.equal(mutateSections(d2, "home", (arr) => arr, cache, g), d2, "no-op keeps the same draft reference");
  const d3 = mutateSections(d2, "cart", (arr) => arr.slice(), cache, g);
  assert.deepEqual(Object.keys(d3.layouts).sort(), ["cart", "home"]);
});

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

test("undo/redo of real section edits round-trips the draft", () => {
  const cache = new Map(), g = ids();
  const d0 = { settings: { active_theme_id: 1 }, layouts: {} };
  let h = createHistory(d0);
  const edit = (fn, key) => { h = pushState(h, mutateSections(h.present, "home", fn, cache, g), { key, now: Date.now() + h.past.length * 5000 }); };
  edit((a) => toggleSection(a, a[1].id));
  edit((a) => addSection(a, "ugc-strip", "home", null, g));
  edit((a) => removeSection(a, a[2].id));
  const finalLen = h.present.layouts.home.sections.length;
  assert.equal(finalLen, 9);
  h = undo(h); assert.equal(h.present.layouts.home.sections.length, 10);
  h = undo(h); assert.equal(h.present.layouts.home.sections.length, 9);
  assert.equal(h.present.layouts.home.sections[1].enabled, false);
  h = undo(h); assert.equal(h.present, d0, "back to the untouched loaded draft");
  h = redo(redo(redo(h))); assert.equal(h.present.layouts.home.sections.length, finalLen);
});

test("settings helpers: getIn / setIn are immutable and tolerate missing parents", () => {
  const o = { palette: { bg: "#fff" } };
  const o2 = setIn(o, ["palette", "text"], "#000");
  assert.deepEqual(o2.palette, { bg: "#fff", text: "#000" });
  assert.deepEqual(o.palette, { bg: "#fff" });
  assert.deepEqual(setIn({}, ["sales_pop", "enabled"], false), { sales_pop: { enabled: false } });
  assert.equal(getIn(o, ["palette", "bg"]), "#fff");
  assert.equal(getIn(o, ["a", "b", "c"], "d"), "d");
  assert.equal(getIn(null, ["a"], 1), 1);
});

test("hex / link validation", () => {
  assert.equal(isHex("#fff"), true); assert.equal(isHex("#A1B2C3"), true);
  assert.equal(isHex("fff"), false); assert.equal(isHex("#ggg"), false); assert.equal(isHex("#12345"), false); assert.equal(isHex(null), false);
  assert.equal(toSixHex("#abc"), "#aabbcc"); assert.equal(toSixHex("nope", "#111111"), "#111111");
  assert.equal(linkProblem(""), null); assert.equal(linkProblem("/collection"), null); assert.equal(linkProblem("https://x.com/a"), null);
  assert.equal(linkProblem("javascript:alert(1)"), "invalid"); assert.equal(linkProblem("shop"), "invalid");
  assert.equal(paletteDefault("accent", 2), "#c6a15b");
  assert.equal(paletteDefault("accentContrast", 1), "#ffffff");
});

test("locked helpers match the storefront's main sections", () => {
  for (const t of ["collection-main", "product-main", "cart-main", "checkout-main", "home-main"]) assert.equal(isLocked(t), true, t);
  for (const t of ["hero", "product-reviews", "related-products", "announcement-bar"]) assert.equal(isLocked(t), false, t);
});

import { designThemeOf, categoryOf, pickerTypes, SECTION_CATEGORIES } from "./layout.js";

test("add-section picker: universal types plus only the active design's own sections; every offered type is supported", () => {
  const t1 = pickerTypes("home", 1).map((m) => m.type);
  assert.ok(t1.includes("hero") && t1.includes("newsletter"));
  assert.ok(!t1.some((t) => designThemeOf(t) !== null), "no theme-specific section while design 1 is active");
  const t5 = pickerTypes("home", 5).map((m) => m.type);
  assert.ok(t5.includes("jp-hero") && !t5.includes("zero-hero") && !t5.includes("vince-hero"));
  assert.ok(pickerTypes("cart", 5).every((m) => !m.type.startsWith("jp-")), "theme sections are home-only");
  assert.ok(pickerTypes("product", 1).some((m) => m.type === "related-products"));
  assert.ok(pickerTypes("home", 1).every((m) => !m.locked && SECTION_CATEGORIES.concat([{ key: "theme", types: [] }]).some((c) => c.key === categoryOf(m.type))));
  assert.equal(designThemeOf("vince-grid"), 8); assert.equal(designThemeOf("hero"), null);
  assert.equal(categoryOf("jp-hero"), "theme"); assert.equal(categoryOf("hero"), "banners"); assert.equal(categoryOf("newsletter"), "other");
});
