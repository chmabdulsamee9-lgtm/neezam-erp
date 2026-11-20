// Brand kit helpers for Neezi's setup (browser only): load a picture, find the logo's main colour, make a white
// logo background transparent, make a square favicon from the logo, and turn the brand colour into the theme's
// three colour schemes (light or contrast).

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the picture"));
    img.src = src;
  });
}

const canvasOf = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const toBlob = (c, type = "image/png") => new Promise((r) => c.toBlob(r, type));

/* ------------------------------------------------------------------ colour maths */
const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export function rgbOf(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
  if (!m) return [20, 20, 20];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export function luminance(h) {
  const [r, g, b] = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (h) => (luminance(h) > 0.45 ? "#141414" : "#ffffff");
const saturation = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

/** the logo's main colour: the most common clearly coloured pixel group (white, black and grey are skipped) */
export async function brandColorFrom(src) {
  const img = await loadImage(src);
  const s = 80, c = canvasOf(s, s), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  const buckets = new Map();
  let dark = 0, counted = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
    if (a < 128) continue;
    counted++;
    if (r + g + b < 120) dark++;
    if (saturation(r, g, b) < 0.25 || r + g + b > 700 || r + g + b < 60) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (top && top.n > counted * 0.01) return hex(top.r / top.n, top.g / top.n, top.b / top.n);
  return dark > counted * 0.05 ? "#141414" : "#6d4aff";
}

/** white (or near-white) background touching the edges becomes transparent; returns a PNG blob */
export async function removeWhiteBackground(src) {
  const img = await loadImage(src);
  const w = img.naturalWidth, h = img.naturalHeight, c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const near = (i) => d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!near(i)) continue;
    d[i + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  ctx.putImageData(data, 0, 0);
  // crop to the logo itself (plus a small margin) so it sits nicely in the header
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  if (maxX <= minX || maxY <= minY) return toBlob(c);
  const m = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  const cx = Math.max(0, minX - m), cy = Math.max(0, minY - m), cw = Math.min(w, maxX + m) - cx, chh = Math.min(h, maxY + m) - cy;
  const out = canvasOf(cw, chh);
  out.getContext("2d").drawImage(c, cx, cy, cw, chh, 0, 0, cw, chh);
  return toBlob(out);
}

/**
 * The icon part of a wide logo ("[icon] BRAND NAME"): the logo's ink (not transparent, not white) is split into
 * parts by empty columns; the first or last part is the icon when it is roughly square and clearly narrower than the
 * whole logo. Returns { x, y, w, h } in image pixels, or null.
 */
function iconBox(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const k = Math.min(1, 400 / W), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = canvasOf(w, h), ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const ink = (x, y) => { const i = (y * w + x) * 4; return d[i + 3] > 30 && !(d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235); };
  const col = Array.from({ length: w }, (_, x) => { for (let y = 0; y < h; y++) if (ink(x, y)) return true; return false; });
  const minGap = Math.max(3, Math.round(w * 0.02));
  const parts = [];
  let s0 = -1, gap = 0;
  for (let x = 0; x <= w; x++) {
    const on = x < w && col[x];
    if (on) { if (s0 < 0) s0 = x; gap = 0; }
    else if (s0 >= 0) { gap++; if (gap >= minGap || x === w) { parts.push([s0, x - gap]); s0 = -1; gap = 0; } }
  }
  if (parts.length < 2) return null;
  const total = parts[parts.length - 1][1] - parts[0][0] + 1;
  for (const [a, b] of [parts[0], parts[parts.length - 1]]) {
    let top = h, bottom = 0;
    for (let x = a; x <= b; x++) for (let y = 0; y < h; y++) if (ink(x, y)) { if (y < top) top = y; if (y > bottom) bottom = y; }
    const pw = b - a + 1, ph = bottom - top + 1;
    const ratio = pw / ph;
    if (pw < total * 0.45 && ratio > 0.45 && ratio < 2.2 && ph > h * 0.35) return { x: a / k, y: top / k, w: pw / k, h: ph / k };
  }
  return null;
}

/**
 * A 256x256 favicon from the logo; returns a PNG blob. A square-ish logo is fitted into the square. A wide logo uses
 * its icon part; a wide logo without a separate icon (just the name) gets the brand's first letter on the brand colour.
 */
export async function faviconFromLogo(src, { name = "", color = "" } = {}) {
  const img = await loadImage(src);
  const S = 256, pad = 18, c = canvasOf(S, S), ctx = c.getContext("2d");
  const fit = (sx, sy, sw, sh) => {
    const scale = Math.min((S - pad * 2) / sw, (S - pad * 2) / sh);
    const w = sw * scale, h = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, (S - w) / 2, (S - h) / 2, w, h);
  };
  if (img.naturalWidth / img.naturalHeight > 1.6) {
    const box = iconBox(img);
    if (box) { fit(box.x, box.y, box.w, box.h); return toBlob(c); }
    if (name.trim()) {
      const bg = /^#[0-9a-f]{6}$/i.test(color) ? color : "#141414";
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(0, 0, S, S, 56) : ctx.rect(0, 0, S, S);
      ctx.fill();
      ctx.fillStyle = onColor(bg);
      ctx.font = "800 170px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.trim()[0].toUpperCase(), S / 2, S / 2 + 10);
      return toBlob(c);
    }
  }
  fit(0, 0, img.naturalWidth, img.naturalHeight);
  return toBlob(c);
}

/* ------------------------------------------------------------------ colour schemes for the theme */
const scheme = (n, v) => Object.fromEntries(Object.entries(v).map(([k, val]) => [`scheme_${n}_${k}`, val]));

/**
 * The theme's three colour schemes from one brand colour.
 * light: white page, brand-coloured buttons; contrast: deep dark page with the brand colour as the highlight.
 */
export function schemesFor(brand, mode = "light") {
  const b = rgbOf(brand) && /^#[0-9a-f]{6}$/i.test(brand) ? brand : "#6d4aff";
  const dark = mix(b, "#000000", 0.82);
  const deep = mix(b, "#000000", 0.6);
  const bright = luminance(b) < 0.08 ? mix(b, "#ffffff", 0.45) : b; // a very dark brand colour is lifted so it shows on dark pages
  const light = {
    ...scheme(1, { bg: "#ffffff", text: "#151418", muted: "#5f5d66", button: b, button_text: onColor(b), secondary: deep, border: mix(b, "#ffffff", 0.85), accent: b, surface: mix(b, "#ffffff", 0.94) }),
    ...scheme(2, { bg: mix(b, "#ffffff", 0.9), text: "#151418", muted: "#5f5d66", button: b, button_text: onColor(b), secondary: deep, border: mix(b, "#ffffff", 0.75), accent: deep, surface: "#ffffff" }),
    ...scheme(3, { bg: dark, text: "#f6f5f8", muted: mix(b, "#ffffff", 0.65), button: bright, button_text: onColor(bright), secondary: "#f6f5f8", border: mix(b, "#000000", 0.65), accent: bright, surface: mix(b, "#000000", 0.72) }),
    sale_color: b,
  };
  if (mode !== "contrast") return light;
  return {
    ...scheme(1, { bg: dark, text: "#f6f5f8", muted: mix(b, "#ffffff", 0.6), button: bright, button_text: onColor(bright), secondary: "#f6f5f8", border: mix(b, "#000000", 0.6), accent: bright, surface: mix(b, "#000000", 0.7) }),
    ...scheme(2, { bg: deep, text: "#ffffff", muted: mix(b, "#ffffff", 0.7), button: "#ffffff", button_text: deep, secondary: "#ffffff", border: mix(b, "#000000", 0.4), accent: mix(b, "#ffffff", 0.4), surface: mix(b, "#000000", 0.5) }),
    ...scheme(3, { bg: "#ffffff", text: "#151418", muted: "#5f5d66", button: b, button_text: onColor(b), secondary: deep, border: mix(b, "#ffffff", 0.85), accent: b, surface: mix(b, "#ffffff", 0.94) }),
    sale_color: bright,
  };
}

/** small swatches for the colour cards */
export function swatchesFor(brand, mode) {
  const s = schemesFor(brand, mode);
  return [s.scheme_1_bg, s.scheme_1_button, s.scheme_2_bg, s.scheme_1_text];
}
