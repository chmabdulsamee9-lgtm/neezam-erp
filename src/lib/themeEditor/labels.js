// Display helpers for sections: translated names with the storefront's own label as fallback, and a one-line summary.
import { sectionMeta } from "./layout.js";

/** t(`themeEditor.sec.<type>`) when a translation exists, otherwise the storefront registry's label */
export function sectionLabel(t, type) {
  const key = `themeEditor.sec.${type}`;
  const v = t(key);
  if (v && v !== key) return v;
  return sectionMeta(type)?.label || type;
}

const SUMMARY_KEYS = ["text", "title", "heading", "s1_title", "quote", "kicker", "i1", "names", "html"];

/** first merchant-entered text of a section, shortened, shown after the name in the tree */
export function sectionSummary(section, max = 38) {
  const s = section?.settings || {};
  for (const k of SUMMARY_KEYS) {
    const v = typeof s[k] === "string" ? s[k].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
    if (v) return v.length > max ? `${v.slice(0, max - 1)}...` : v;
  }
  return "";
}
