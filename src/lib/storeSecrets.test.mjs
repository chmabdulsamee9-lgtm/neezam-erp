// Security tests for browser code: the stores table holds integration secrets, so the browser must never select
// everything from it, and must never mention the secret columns at all (secret actions go through the worker).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SAFE_STORE_COLUMNS, SECRET_STORE_COLUMNS } from "./storeColumns.js";

const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) files.push(p);
  }
})(SRC);
const rel = (p) => relative(SRC, p).split(sep).join("/");

test("browser code never selects all columns (or no columns) from the stores table", () => {
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const re = /from\(\s*["'`]stores["'`]\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
      const rest = text.slice(m.index + m[0].length, m.index + 700);
      const end = rest.search(/;|from\(\s*["'`]/);
      const stmt = end >= 0 ? rest.slice(0, end) : rest;
      if (/\.select\(\s*(["'`]\*["'`])?\s*\)/.test(stmt)) bad.push(`${rel(f)}: ${stmt.replace(/\s+/g, " ").slice(0, 120)}`);
    }
    if (/stores!?\w*\(\s*\*\s*\)/.test(text)) bad.push(`${rel(f)}: embedded stores(*)`);
  }
  assert.deepEqual(bad, []);
});

test("browser code never names a secret column of the stores table", () => {
  const bad = [];
  for (const f of files) {
    if (rel(f) === "lib/storeColumns.js") continue;
    const text = readFileSync(f, "utf8");
    for (const c of SECRET_STORE_COLUMNS) {
      // `api_token` etc. as an identifier or key; ignore the word inside prose strings such as i18n labels
      if (new RegExp(`\\b${c}\\b`).test(text) && rel(f) !== "i18n.js") bad.push(`${rel(f)} mentions ${c}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("SAFE_STORE_COLUMNS contains no secret column, no wildcard, and no duplicates", () => {
  const cols = SAFE_STORE_COLUMNS.split(",").map((c) => c.trim());
  for (const c of SECRET_STORE_COLUMNS) assert.equal(cols.includes(c), false, c);
  assert.equal(cols.includes("*"), false);
  assert.equal(new Set(cols).size, cols.length);
  assert.ok(cols.includes("meta_pixel_id") && cols.includes("meta_pixel_name") && cols.includes("id"));
});

test("the sign-up and add-brand inserts set the owner and do not write secret columns", () => {
  for (const f of ["pages/Login.jsx", "pages/Settings.jsx"]) {
    const text = readFileSync(join(SRC, f), "utf8");
    const m = /from\(\s*["']stores["']\s*\)\s*\.insert\(\{([^}]*)\}\)/.exec(text);
    assert.ok(m, f);
    assert.match(m[1], /user_id:/, `${f}: owner id on insert`);
  }
});
