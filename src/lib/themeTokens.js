// UI editor tokens: what the Master Dashboard > UI Editor can change, their defaults (= the shipped look in
// theme.css + look.css) and how a saved theme becomes CSS. A saved theme is { light: {key: value}, dark: {key: value} };
// only changed keys are stored, everything else keeps the shipped value.

export const TOKEN_GROUPS = [
  { id: "colors", label: "Colors" },
  { id: "shape", label: "Shape" },
  { id: "density", label: "Size and spacing" },
  { id: "effects", label: "Shadows and motion" },
];

// type: color | px | number | select. cssVar: the custom property it writes.
export const TOKENS = [
  { key: "bg", group: "colors", label: "Page background", type: "color", cssVar: "--ne-bg", light: "#ffffff", dark: "#070A1A" },
  { key: "surface", group: "colors", label: "Subdued strip (card headers, table heads)", type: "color", cssVar: "--ne-surface", light: "#f7f7f7", dark: "#11163A" },
  { key: "card", group: "colors", label: "Card", type: "color", cssVar: "--ne-surface-2", light: "#ffffff", dark: "#161B45" },
  { key: "border", group: "colors", label: "Border", type: "color", cssVar: "--ne-border", light: "#e3e3e3", dark: "#232A52" },
  { key: "divider", group: "colors", label: "Divider inside cards", type: "color", cssVar: "--ne-border-inner", light: "#ebebeb", dark: "#232A52" },
  { key: "text", group: "colors", label: "Text", type: "color", cssVar: "--ne-text", light: "#1a1a1a", dark: "#EEF0FF" },
  { key: "muted", group: "colors", label: "Secondary text", type: "color", cssVar: "--ne-muted", light: "#616161", dark: "#8C93C4" },
  { key: "accent", group: "colors", label: "Brand (start)", type: "color", cssVar: "--ne-accent", light: "#5C7CFA", dark: "#5C7CFA" },
  { key: "accent2", group: "colors", label: "Brand (end)", type: "color", cssVar: "--ne-accent2", light: "#A855F7", dark: "#A855F7" },
  { key: "success", group: "colors", label: "Success", type: "color", cssVar: "--ne-success", light: "#16A34A", dark: "#34D88E" },
  { key: "warning", group: "colors", label: "Warning", type: "color", cssVar: "--ne-warning", light: "#D97706", dark: "#F2A83E" },
  { key: "danger", group: "colors", label: "Danger", type: "color", cssVar: "--ne-danger", light: "#DC2626", dark: "#F26D6D" },
  { key: "sidebar", group: "colors", label: "Sidebar", type: "color", cssVar: "--ne-sidebar-bg", light: "#0A0E26", dark: "#0A0E26" },
  { key: "radiusCard", group: "shape", label: "Card corners", type: "px", min: 0, max: 28, cssVar: "--ne-radius-card", light: 14, dark: 14 },
  { key: "radiusButton", group: "shape", label: "Button corners (max = fully round)", type: "px", min: 0, max: 30, full: 30, cssVar: "--ne-radius-button", light: 30, dark: 30 },
  { key: "radiusControl", group: "shape", label: "Input corners", type: "px", min: 0, max: 20, cssVar: "--ne-radius-control", light: 9, dark: 9 },
  { key: "uiScale", group: "density", label: "UI size", type: "number", min: 0.85, max: 1.15, step: 0.01, cssVar: "--ne-ui-scale", light: 1, dark: 1 },
  { key: "navIcon", group: "density", label: "Sidebar icon size", type: "px", min: 14, max: 22, cssVar: "--ne-nav-icon", light: 18, dark: 18 },
  { key: "shadow", group: "effects", label: "Card shadow", type: "select", cssVar: "--ne-shadow-card", light: "shopify", dark: "soft",
    options: { none: "none", soft: "0 1px 2px rgba(0,0,0,.08)", shopify: "0 0 0 1px rgba(0,0,0,.07), 0 1px 0 0 rgba(0,0,0,.07), 0 2px 6px rgba(0,0,0,.03)", strong: "0 0 0 1px rgba(0,0,0,.1), 0 6px 18px rgba(0,0,0,.12)" } },
  { key: "motion", group: "effects", label: "Animation speed", type: "select", cssVar: "--ne-motion", light: "normal", dark: "normal",
    options: { off: "0s", fast: ".15s", normal: ".25s", slow: ".4s" } },
];

const byKey = Object.fromEntries(TOKENS.map((t) => [t.key, t]));
export const MODES = ["light", "dark"];

export function defaultValue(key, mode) {
  return byKey[key]?.[mode];
}

/** a stored value -> the CSS value (px units, select options, "fully round") */
export function cssValue(token, value) {
  if (value === undefined || value === null || value === "") return null;
  if (token.type === "px") {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (token.full !== undefined && n >= token.full) return "999px";
    return `${Math.max(token.min ?? n, Math.min(token.max ?? n, n))}px`;
  }
  if (token.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return String(Math.max(token.min ?? n, Math.min(token.max ?? n, n)));
  }
  if (token.type === "select") return token.options[value] ?? null;
  if (token.type === "color") return /^#[0-9a-f]{3,8}$/i.test(String(value)) ? String(value) : null;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Page editor: per-page element rules + named colours.
// theme.palette = [{ name, slug, value }]  -> :root{--ne-c-<slug>: value}
// theme.pages   = { <pageKey>: [{ selector, label, styles: { <prop>: value } }] }
//   -> .ne-content[data-ne-page="<pageKey>"] <selector> { prop: value !important }
// Everything is validated: unknown properties, odd selectors and unsafe values are dropped.
// ---------------------------------------------------------------------------------------------
export const PAGE_PROPS = [
  { prop: "color", label: "Text colour", kind: "color" },
  { prop: "background-color", label: "Background", kind: "color" },
  { prop: "border-color", label: "Border colour", kind: "color" },
  { prop: "font-size", label: "Text size", kind: "px", min: 8, max: 40 },
  { prop: "font-weight", label: "Text weight", kind: "enum", options: ["400", "500", "600", "700", "800"] },
  { prop: "letter-spacing", label: "Letter spacing", kind: "px", min: -2, max: 6, step: 0.1 },
  { prop: "line-height", label: "Line height", kind: "num", min: 0.8, max: 2.4, step: 0.05 },
  { prop: "padding", label: "Inner space (padding)", kind: "px", min: 0, max: 64 },
  { prop: "margin-bottom", label: "Space below", kind: "px", min: 0, max: 64 },
  { prop: "gap", label: "Space between items (gap)", kind: "px", min: 0, max: 48 },
  { prop: "border-radius", label: "Corners", kind: "px", min: 0, max: 40 },
  { prop: "border-width", label: "Border width", kind: "px", min: 0, max: 6 },
  { prop: "opacity", label: "Opacity", kind: "num", min: 0.1, max: 1, step: 0.05 },
  { prop: "text-transform", label: "Letters", kind: "enum", options: ["none", "uppercase", "capitalize"] },
  { prop: "display", label: "Show / hide", kind: "enum", options: ["", "none"] },
];
const propByName = Object.fromEntries(PAGE_PROPS.map((p) => [p.prop, p]));

export const slugify = (name) => String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
const SAFE_SELECTOR = /^[a-zA-Z0-9_\-\s>:.()[\]="'#*+~]+$/;
const SAFE_PAGE = /^[a-z0-9\-/]{1,60}$/;
export function isSafeSelector(sel) {
  return typeof sel === "string" && sel.length > 0 && sel.length <= 400 && SAFE_SELECTOR.test(sel) && !/url\s*\(|expression|@import|\/\*/i.test(sel);
}

/** a page-rule value -> CSS (colours may be hex or a palette/var reference) */
export function pageValue(prop, value) {
  const p = propByName[prop];
  if (!p || value === undefined || value === null || value === "") return null;
  const v = String(value).trim();
  if (p.kind === "color") {
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    if (/^var\(--ne-[a-z0-9-]{1,40}\)$/i.test(v)) return v;
    return null;
  }
  if (p.kind === "px" || p.kind === "num") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const c = Math.max(p.min, Math.min(p.max, n));
    return p.kind === "px" ? `${c}px` : String(c);
  }
  if (p.kind === "enum") return p.options.includes(v) && v !== "" ? v : null;
  return null;
}

function cleanPalette(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list.slice(0, 60)) {
    const name = String(c?.name || "").trim().slice(0, 40);
    const slug = slugify(c?.slug || name);
    if (!name || !slug || seen.has(slug) || !/^#[0-9a-f]{3,8}$/i.test(String(c?.value || ""))) continue;
    seen.add(slug);
    out.push({ name, slug, value: String(c.value) });
  }
  return out;
}

function cleanPages(pages) {
  const out = {};
  if (!pages || typeof pages !== "object") return out;
  for (const [page, rules] of Object.entries(pages)) {
    if (!SAFE_PAGE.test(page) || !Array.isArray(rules)) continue;
    const kept = [];
    for (const r of rules.slice(0, 300)) {
      if (!isSafeSelector(r?.selector)) continue;
      const styles = {};
      for (const [prop, value] of Object.entries(r.styles || {})) if (pageValue(prop, value)) styles[prop] = String(value);
      if (Object.keys(styles).length) kept.push({ selector: r.selector, label: String(r.label || "").slice(0, 60), styles });
    }
    if (kept.length) out[page] = kept;
  }
  return out;
}

export function pageRulesCss(theme) {
  const lines = [];
  const palette = cleanPalette(theme?.palette);
  if (palette.length) lines.push(`:root{${palette.map((c) => `--ne-c-${c.slug}:${c.value};`).join("")}}`);
  for (const [page, rules] of Object.entries(cleanPages(theme?.pages))) {
    for (const r of rules) {
      const decl = Object.entries(r.styles).map(([prop, v]) => `${prop}:${pageValue(prop, v)} !important;`).join("");
      lines.push(`.ne-content[data-ne-page="${page}"] ${r.selector}{${decl}}`);
    }
  }
  return lines.join("\n");
}

/** keep only known keys whose value differs from the default and is valid */
export function cleanTheme(theme) {
  const out = { light: {}, dark: {} };
  const palette = cleanPalette(theme?.palette);
  const pages = cleanPages(theme?.pages);
  if (palette.length) out.palette = palette;
  if (Object.keys(pages).length) out.pages = pages;
  for (const mode of MODES) {
    const src = (theme && theme[mode]) || {};
    for (const [key, value] of Object.entries(src)) {
      const tok = byKey[key];
      if (!tok || cssValue(tok, value) === null) continue;
      if (String(value).toLowerCase() === String(tok[mode]).toLowerCase()) continue;
      out[mode][key] = value;
    }
  }
  return out;
}

function declarations(values) {
  const lines = [];
  for (const [key, value] of Object.entries(values)) {
    const tok = byKey[key];
    const v = tok && cssValue(tok, value);
    if (v) lines.push(`${tok.cssVar}:${v};`);
  }
  if (values.accent || values.accent2) {
    const a = cssValue(byKey.accent, values.accent) || "var(--ne-accent)";
    const b = cssValue(byKey.accent2, values.accent2) || "var(--ne-accent2)";
    lines.push(`--ne-grad:linear-gradient(120deg, ${a} 0%, ${b} 100%);`);
  }
  return lines.join("");
}

/** CSS text for a theme; `scope` limits it to a container (the editor preview), otherwise it targets the whole app */
export function themeToCss(theme, scope = "") {
  const t = cleanTheme(theme);
  const light = declarations(t.light);
  const dark = declarations(t.dark);
  const css = [];
  if (scope) {
    if (light) css.push(`${scope}[data-preview-theme="light"]{${light}}`);
    if (dark) css.push(`${scope}[data-preview-theme="dark"]{${dark}}`);
  } else {
    if (light) css.push(`:root[data-theme="light"]{${light}}`);
    if (dark) css.push(`:root:not([data-theme="light"]){${dark}}`);
    const pageCss = pageRulesCss(t);
    if (pageCss) css.push(pageCss);
  }
  return css.join("\n");
}

const STYLE_ID = "ne-theme-overrides";
/** writes (or clears) the live theme on the page */
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID);
  const css = themeToCss(theme);
  if (!css) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("style"); el.id = STYLE_ID; document.head.appendChild(el); }
  el.textContent = css;
}
