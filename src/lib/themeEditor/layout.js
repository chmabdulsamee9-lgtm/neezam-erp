// Pure section-tree logic for the theme editor. No React, no network. Every function returns a NEW array (or the same
// reference when nothing changed) so the history stack can compare by reference.
import { SECTION_REGISTRY } from "./registry.js";

export const TEMPLATES = [
  { key: "home", labelKey: "themeEditor.page.home", url: "/" },
  { key: "collection", labelKey: "themeEditor.page.collection", url: "/collection" },
  { key: "product", labelKey: "themeEditor.page.product", url: "/collection" },
  { key: "cart", labelKey: "themeEditor.page.cart", url: "/cart" },
  { key: "checkout", labelKey: "themeEditor.page.checkout", url: "/checkout" },
];

const META = new Map(SECTION_REGISTRY.map((m) => [m.type, m]));
export const sectionMeta = (type) => META.get(type) || null;
/** locked = the storefront's "main" sections: cannot be removed, hidden, duplicated or moved */
export const isLocked = (type) => !!META.get(type)?.locked;
/** the invisible home guard exists only to keep the page non-empty; it is never shown in the tree */
export const isHiddenInTree = (type) => type === "home-main";
export const isCore = (type) => typeof type === "string" && type.endsWith("-main");

let seq = 0;
export function newId(prefix = "sec") {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}${Math.floor(Math.random() * 1e4)}`;
}

export function makeSection(type, idGen = newId) {
  const meta = META.get(type);
  if (!meta) return null;
  return { id: idGen("sec"), type, enabled: true, settings: { ...meta.defaults } };
}

const THEME_HOME = {
  5: ["jp-announce", "jp-hero", "jp-usp", "jp-tiles", "jp-bestsellers", "jp-deals", "jp-bundle", "jp-celeb", "jp-results", "jp-quiz", "quote-strip", "jp-press"],
  6: ["announcement-bar", "zero-hero", "zero-cats", "zero-feature", "zero-drop", "zero-banner", "zero-reviews", "zero-faq"],
  7: ["org-benefits", "org-hero", "org-tiles", "org-bestsellers", "org-show", "org-reviewcards", "org-infosplit", "newsletter"],
  8: ["announcement-bar", "vince-hero", "vince-shop", "vince-love", "vince-grid", "vince-banner", "vince-ugc", "vince-rewards", "vince-quote"],
};
const DEFAULT_HOME = ["announcement-bar", "hero", "featured-collection", "promo-banner", "collection-list", "testimonials", "brand-story", "stats-row", "newsletter"];
const FIXED = {
  collection: ["collection-main"],
  product: ["product-main", "product-reviews", "related-products"],
  cart: ["cart-main"],
  checkout: ["checkout-main"],
};

/** mirrors the storefront's DEFAULT_LAYOUT(template, themeId): what the page shows while no layout has been saved */
export function defaultSections(template, themeId = 1, idGen = newId) {
  const types = template === "home" ? (THEME_HOME[Number(themeId)] || DEFAULT_HOME) : (FIXED[template] || []);
  return types.map((t) => makeSection(t, idGen)).filter(Boolean);
}

/**
 * The sections the storefront actually renders for a template: the saved list when it has entries, otherwise the
 * built-in default. `cache` (a Map owned by the editor) keeps the default ids stable between renders.
 */
export function resolveSections(draft, template, cache, idGen = newId) {
  const saved = draft?.layouts?.[template]?.sections;
  if (Array.isArray(saved) && saved.length) return saved;
  const themeId = Number(draft?.settings?.active_theme_id) || 1;
  const key = `${template}:${themeId}`;
  if (cache && cache.has(key)) return cache.get(key);
  const fresh = defaultSections(template, themeId, idGen);
  if (cache) cache.set(key, fresh);
  return fresh;
}

/** the draft with this template's effective sections filled in — render-identical, used for the preview and for edits */
export function withResolvedLayout(draft, template, cache, idGen) {
  if (!draft) return draft;
  const saved = draft.layouts?.[template]?.sections;
  if (Array.isArray(saved) && saved.length) return draft;
  const sections = resolveSections(draft, template, cache, idGen);
  if (!sections.length) return draft;
  return { ...draft, layouts: { ...(draft.layouts || {}), [template]: { ...(draft.layouts?.[template] || {}), sections } } };
}

/** apply fn to a template's sections and return the new draft (materializes the defaults on the first edit) */
export function mutateSections(draft, template, fn, cache, idGen) {
  const base = resolveSections(draft, template, cache, idGen);
  const next = fn(base);
  if (next === base) return draft;
  return { ...draft, layouts: { ...(draft.layouts || {}), [template]: { ...(draft.layouts?.[template] || {}), sections: next } } };
}

/* ---------------------------- tree operations ---------------------------- */

/** header lane: on the home page the renderer draws announcement bars first, so the tree shows them as the header group */
export const laneOf = (section, template) => (template === "home" && section.type === "announcement-bar" ? "header" : "main");

export function groupSections(sections, template) {
  const header = [], main = [];
  for (const s of sections) {
    if (isHiddenInTree(s.type)) continue;
    (laneOf(s, template) === "header" ? header : main).push(s);
  }
  return template === "home" ? [{ key: "header", items: header }, { key: "template", items: main }] : [{ key: "template", items: main }];
}

export function canAddType(type, template) {
  const m = META.get(type);
  if (!m || m.locked) return false;
  return m.templates === "*" || (Array.isArray(m.templates) && m.templates.includes(template));
}

export function addableTypes(template) {
  return SECTION_REGISTRY.filter((m) => canAddType(m.type, template));
}

/** insert a new section; afterId places it right after that section, otherwise at the end of the list */
export function addSection(sections, type, template, afterId = null, idGen = newId) {
  if (!canAddType(type, template)) return sections;
  const sec = makeSection(type, idGen);
  const next = [...sections];
  const at = afterId ? next.findIndex((s) => s.id === afterId) : -1;
  next.splice(at >= 0 ? at + 1 : next.length, 0, sec);
  return next;
}

export function removeSection(sections, id) {
  const s = sections.find((x) => x.id === id);
  if (!s || isLocked(s.type)) return sections;
  return sections.filter((x) => x.id !== id);
}

export function duplicateSection(sections, id, idGen = newId) {
  const i = sections.findIndex((x) => x.id === id);
  if (i < 0 || isLocked(sections[i].type)) return sections;
  const src = sections[i];
  const copy = { ...src, id: idGen("sec"), settings: JSON.parse(JSON.stringify(src.settings || {})) };
  const next = [...sections];
  next.splice(i + 1, 0, copy);
  return next;
}

export function toggleSection(sections, id) {
  const s = sections.find((x) => x.id === id);
  if (!s || isLocked(s.type)) return sections;
  return sections.map((x) => (x.id === id ? { ...x, enabled: x.enabled === false } : x));
}

export function setSectionSetting(sections, id, key, value) {
  if (!sections.some((x) => x.id === id)) return sections;
  return sections.map((x) => (x.id === id ? { ...x, settings: { ...(x.settings || {}), [key]: value } } : x));
}

/** swap with the neighbour in the same lane (dir -1 up, +1 down) */
export function moveSection(sections, id, dir, template) {
  const i = sections.findIndex((x) => x.id === id);
  if (i < 0 || isLocked(sections[i].type)) return sections;
  const lane = laneOf(sections[i], template);
  let j = i + dir;
  while (j >= 0 && j < sections.length && (laneOf(sections[j], template) !== lane || isHiddenInTree(sections[j].type))) j += dir;
  if (j < 0 || j >= sections.length) return sections;
  const next = [...sections];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function canMove(sections, id, dir, template) {
  return moveSection(sections, id, dir, template) !== sections;
}

/** drag and drop: put `id` before/after `targetId`; only inside one lane, never a locked section */
export function reorderSection(sections, id, targetId, position, template) {
  if (id === targetId) return sections;
  const from = sections.findIndex((x) => x.id === id);
  const to = sections.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || isLocked(sections[from].type)) return sections;
  if (laneOf(sections[from], template) !== laneOf(sections[to], template)) return sections;
  const next = sections.filter((x) => x.id !== id);
  const at = next.findIndex((x) => x.id === targetId);
  next.splice(position === "after" ? at + 1 : at, 0, sections[from]);
  const same = next.length === sections.length && next.every((x, k) => x === sections[k]);
  return same ? sections : next;
}

/* ---------------------------- add-section picker ---------------------------- */

const THEME_PREFIX = [["jp-", 5], ["zero-", 6], ["org-", 7], ["vince-", 8]];
/** design theme a theme-specific section belongs to (5-8), or null for universal sections */
export function designThemeOf(type) {
  const hit = THEME_PREFIX.find(([p]) => typeof type === "string" && type.startsWith(p));
  return hit ? hit[1] : null;
}

export const SECTION_CATEGORIES = [
  { key: "banners", types: ["hero", "promo-banner", "countdown-strip", "announcement-bar", "quote-strip", "brand-story"] },
  { key: "products", types: ["featured-collection", "collection-list", "mini-picks", "deals-grid", "related-products", "product-reviews"] },
  { key: "trust", types: ["testimonials", "stats-row", "trust-marquee", "press-logos", "ugc-strip"] },
  { key: "other", types: ["newsletter", "custom-html"] },
];

export function categoryOf(type) {
  if (designThemeOf(type)) return "theme";
  return SECTION_CATEGORIES.find((c) => c.types.includes(type))?.key || "other";
}

/** what the "Add section" picker offers on a page: supported types only; theme-specific ones only for the active design */
export function pickerTypes(template, themeId) {
  return addableTypes(template).filter((m) => {
    const th = designThemeOf(m.type);
    return th === null || th === Number(themeId);
  });
}
