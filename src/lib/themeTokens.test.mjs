import test from "node:test";
import assert from "node:assert/strict";
import { TOKENS, cleanTheme, cssValue, themeToCss, defaultValue, pageValue, isSafeSelector, pageRulesCss } from "./themeTokens.js";

test("page rules: safe selectors and values only, palette becomes variables, rules are scoped to their page", () => {
  assert.equal(isSafeSelector("> div:nth-child(2) > span"), true);
  assert.equal(isSafeSelector("div{} body{color:red"), false);
  assert.equal(isSafeSelector("a[style*=url(x)]"), false);
  assert.equal(pageValue("font-size", 100), "40px");
  assert.equal(pageValue("color", "var(--ne-c-brand-blue)"), "var(--ne-c-brand-blue)");
  assert.equal(pageValue("color", "red;x:1"), null);
  assert.equal(pageValue("position", "fixed"), null);
  const css = pageRulesCss({
    palette: [{ name: "Brand Blue", value: "#1e40af" }, { name: "bad", value: "nope" }],
    pages: { orders: [{ selector: "> div > h1", styles: { color: "var(--ne-c-brand-blue)", "font-size": 22, evil: "x" } }], "bad page!": [{ selector: "div", styles: { color: "#000" } }] },
  });
  assert.equal(css, ':root{--ne-c-brand-blue:#1e40af;}\n.ne-content[data-ne-page="orders"] > div > h1{color:var(--ne-c-brand-blue) !important;font-size:22px !important;}');
  const t = cleanTheme({ pages: { orders: [{ selector: "> div", styles: { display: "none" } }] } });
  assert.deepEqual(t.pages, { orders: [{ selector: "> div", label: "", styles: { display: "none" } }] });
});

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
