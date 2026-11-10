// Small input helpers shared by the editor's controls.

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

/** per-product merchandising limits (same numbers the storefront and the worker enforce) */
export const META_LIMITS = { card_tag: 30, title_tag: 30, key_point: 60, key_points_max: 3, info_title: 40, info_body: 600, info_sections_max: 4 };
