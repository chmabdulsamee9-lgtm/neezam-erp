import test from "node:test";
import assert from "node:assert/strict";
import { TOKENS, cleanTheme, cssValue, themeToCss, defaultValue } from "./themeTokens.js";

const tok = (k) => TOKENS.find((t) => t.key === k);

test("values become CSS: px clamp, fully round, select option, bad colour refused", () => {
  assert.equal(cssValue(tok("radiusCard"), 40), "28px");
  assert.equal(cssValue(tok("radiusButton"), 30), "999px");
  assert.equal(cssValue(tok("radiusButton"), 8), "8px");
  assert.equal(cssValue(tok("shadow"), "none"), "none");
  assert.equal(cssValue(tok("text"), "red; }"), null);
  assert.equal(cssValue(tok("text"), "#123abc"), "#123abc");
});

test("cleanTheme keeps only real changes to known keys", () => {
  const out = cleanTheme({ light: { text: "#1A1A1A", accent: "#ff0000", hack: "#000", radiusCard: "x" }, dark: { radiusCard: 10 } });
  assert.deepEqual(out, { light: { accent: "#ff0000" }, dark: { radiusCard: 10 } });
});

test("css per mode, the gradient follows the brand colours, a scope targets the preview only", () => {
  const css = themeToCss({ light: { accent: "#ff0000" } });
  assert.match(css, /:root\[data-theme="light"\]\{--ne-accent:#ff0000;--ne-grad:linear-gradient\(120deg, #ff0000 0%, var\(--ne-accent2\) 100%\);\}/);
  assert.equal(themeToCss({}), "");
  assert.match(themeToCss({ dark: { radiusCard: 4 } }, ".pv"), /^\.pv\[data-preview-theme="dark"\]\{--ne-radius-card:4px;\}$/);
  assert.equal(defaultValue("radiusCard", "light"), 14);
});
