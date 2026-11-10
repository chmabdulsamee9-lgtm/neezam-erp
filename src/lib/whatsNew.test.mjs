import { test } from "node:test";
import assert from "node:assert/strict";
import { WHATS_NEW_ID, WHATS_NEW_PAGES, hasSeenWhatsNew, markWhatsNewSeen, nextStep, prevStep, isLastStep, clampStep } from "./whatsNew.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test("seen flag: shown until marked, per release id", () => {
  const s = mem();
  assert.equal(hasSeenWhatsNew(WHATS_NEW_ID, s), false);
  markWhatsNewSeen(WHATS_NEW_ID, s);
  assert.equal(hasSeenWhatsNew(WHATS_NEW_ID, s), true);
  assert.equal(hasSeenWhatsNew("whatsnew-2027-01", s), false, "a new release shows again");
  assert.equal(hasSeenWhatsNew(WHATS_NEW_ID, { getItem() { throw new Error("blocked"); } }), true, "unreadable storage never nags");
  assert.equal(hasSeenWhatsNew(WHATS_NEW_ID, null), false);
});

test("steps: 3 pages, back and next stay in range, last page is detected", () => {
  assert.equal(WHATS_NEW_PAGES.length, 3);
  assert.ok(WHATS_NEW_PAGES.every((p) => p.bullets.length <= 3));
  assert.equal(prevStep(0), 0);
  assert.equal(nextStep(0), 1);
  assert.equal(nextStep(2), 2);
  assert.equal(isLastStep(1), false);
  assert.equal(isLastStep(2), true);
  assert.equal(clampStep(9), 2);
});
