import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp, placeBeside, placeTip } from "./popoverPosition.js";

const vp = { w: 1280, h: 800 };
const edge = { left: 0, right: 64 }; // collapsed sidebar

test("clamp keeps a value inside the range and never inverts", () => {
  assert.equal(clamp(5, 8, 100), 8);
  assert.equal(clamp(500, 8, 100), 100);
  assert.equal(clamp(50, 8, 100), 50);
  assert.equal(clamp(50, 8, 4), 8);
});

test("placeBeside: opens just outside the sidebar edge, bottom aligned with the trigger", () => {
  const p = placeBeside({ edge, anchor: { top: 700, bottom: 730 }, size: { w: 230, h: 200 }, vp });
  assert.equal(p.left, 72);
  assert.equal(p.top, 530);
  assert.equal(p.width, 230);
});

test("placeBeside: never leaves the viewport (low trigger, tall popup, narrow window)", () => {
  const low = placeBeside({ edge, anchor: { top: 780, bottom: 840 }, size: { w: 230, h: 200 }, vp });
  assert.ok(low.top + 200 <= vp.h - 8);
  const tall = placeBeside({ edge, anchor: { top: 100, bottom: 130 }, size: { w: 320, h: 900 }, vp });
  assert.equal(tall.top, 8);
  assert.equal(tall.maxHeight, 784);
  const narrow = placeBeside({ edge: { left: 0, right: 215 }, anchor: { top: 700, bottom: 730 }, size: { w: 320, h: 100 }, vp: { w: 360, h: 800 } });
  assert.ok(narrow.left >= 8 && narrow.left + narrow.width <= 352);
});

test("placeBeside: RTL opens to the left of a sidebar that sits on the right", () => {
  const p = placeBeside({ edge: { left: 1065, right: 1280 }, anchor: { top: 700, bottom: 730 }, size: { w: 320, h: 200 }, vp, rtl: true });
  assert.equal(p.left, 1065 - 8 - 320);
  assert.ok(p.left + p.width < 1065);
});

test("placeTip: about 12px outside the edge, mirrored in RTL", () => {
  assert.deepEqual(placeTip({ edge, vp }), { left: 76 });
  assert.deepEqual(placeTip({ edge: { left: 1216, right: 1280 }, vp, rtl: true }), { right: 76 });
});
