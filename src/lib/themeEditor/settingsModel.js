// Helpers for the theme-settings panel (theme_config.settings): immutable path updates, hex checks, the grouped
// structure, and the default swatch values. Pure — no React.
import { getStorefrontTheme } from "../storefrontThemes.js";

export function getIn(obj, path, fallback) {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return fallback;
    cur = cur[k];
  }
  return cur === undefined ? fallback : cur;
}

export function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = obj && typeof obj === "object" ? obj : {};
  return { ...base, [k]: setIn(base[k], rest, value) };
}

export const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (v) => typeof v === "string" && HEX_RE.test(v.trim());
/** <input type=color> only accepts #rrggbb */
export function toSixHex(v, fallback = "#000000") {
  if (!isHex(v)) return fallback;
  const s = v.trim().toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
}

/** link fields accept a site path or an absolute http(s) URL; empty is fine */
export function linkProblem(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") || /^https?:\/\//i.test(s) || s.startsWith("#") || /^(mailto|tel):/i.test(s)) return null;
  return "invalid";
}

export const PALETTE_SLOTS = [
  { key: "bg", labelKey: "themeEditor.pal.bg", hintKey: "themeEditor.pal.bgHint" },
  { key: "surface", labelKey: "themeEditor.pal.surface", hintKey: "themeEditor.pal.surfaceHint" },
  { key: "text", labelKey: "themeEditor.pal.text", hintKey: "themeEditor.pal.textHint" },
  { key: "textMuted", labelKey: "themeEditor.pal.textMuted", hintKey: "themeEditor.pal.textMutedHint" },
  { key: "accent", labelKey: "themeEditor.pal.accent", hintKey: "themeEditor.pal.accentHint" },
  { key: "accentContrast", labelKey: "themeEditor.pal.accentContrast", hintKey: "themeEditor.pal.accentContrastHint" },
  { key: "border", labelKey: "themeEditor.pal.border", hintKey: "themeEditor.pal.borderHint" },
];

export const ELEMENT_TARGETS = [
  { key: "headings", labelKey: "themeEditor.el.headings", defaultSlot: "text" },
  { key: "bodyText", labelKey: "themeEditor.el.bodyText", defaultSlot: "text" },
  { key: "buttons", labelKey: "themeEditor.el.buttons", defaultSlot: "accent" },
  { key: "buttonText", labelKey: "themeEditor.el.buttonText", defaultSlot: "accentContrast" },
  { key: "links", labelKey: "themeEditor.el.links", defaultSlot: "accent" },
  { key: "badges", labelKey: "themeEditor.el.badges", defaultSlot: "accent" },
  { key: "badgeText", labelKey: "themeEditor.el.badgeText", defaultSlot: "accentContrast" },
  { key: "announceBar", labelKey: "themeEditor.el.announceBar", defaultSlot: "accent" },
  { key: "announceText", labelKey: "themeEditor.el.announceText", defaultSlot: "accentContrast" },
  { key: "outlines", labelKey: "themeEditor.el.outlines", defaultSlot: "border" },
  { key: "saleBadge", labelKey: "themeEditor.el.saleBadge", defaultSlot: "accent" },
  { key: "saleText", labelKey: "themeEditor.el.saleText", defaultSlot: "accentContrast" },
  { key: "stars", labelKey: "themeEditor.el.stars", defaultSlot: "accent" },
  { key: "popupCard", labelKey: "themeEditor.el.popupCard", defaultSlot: "surface" },
];

export const FONT_OPTIONS = [
  { key: "archivo", label: "Archivo" }, { key: "archivo-black", label: "Archivo Black" },
  { key: "inter", label: "Inter" }, { key: "space-grotesk", label: "Space Grotesk" },
  { key: "playfair", label: "Playfair Display" }, { key: "jost", label: "Jost" },
  { key: "fraunces", label: "Fraunces" }, { key: "nunito", label: "Nunito" },
  { key: "caveat", label: "Caveat (handwritten)" }, { key: "sora", label: "Sora" },
  { key: "poppins", label: "Poppins" }, { key: "lora", label: "Lora" },
  { key: "plus-jakarta", label: "Plus Jakarta Sans" }, { key: "quicksand", label: "Quicksand" },
  { key: "nunito-sans", label: "Nunito Sans" }, { key: "barlow", label: "Barlow" },
  { key: "montserrat", label: "Montserrat" },
];

/** the colour shown in a swatch before the merchant has set that slot: the active design theme's own colour */
export function paletteDefault(slotKey, themeId) {
  const th = getStorefrontTheme(themeId);
  return th.colors[slotKey] || (slotKey === "accentContrast" ? "#ffffff" : "#000000");
}

export const META_LIMITS = { card_tag: 30, title_tag: 30, key_point: 60, key_points_max: 3, info_title: 40, info_body: 600, info_sections_max: 4 };
