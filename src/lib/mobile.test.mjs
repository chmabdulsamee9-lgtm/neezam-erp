import { test } from "node:test";
import assert from "node:assert/strict";
import { MOBILE_MAX_PX, MOBILE_QUERY, pickBottomTabs, activeTabFor, countActiveFilters } from "./mobile.js";

test("one breakpoint, also used as the media query", () => {
  assert.equal(MOBILE_MAX_PX, 760);
  assert.equal(MOBILE_QUERY, "(max-width: 760px)");
});

test("bottom tabs follow the same permission check as the sidebar", () => {
  assert.deepEqual(pickBottomTabs(() => true), ["home", "orders", "courier", "products"]);
  assert.deepEqual(pickBottomTabs((id) => id === "orders"), ["home", "orders"], "a staff user with only Orders");
  assert.deepEqual(pickBottomTabs(() => false), ["home"], "Home is always there");
  assert.deepEqual(pickBottomTabs(undefined), ["home"]);
});

test("active tab", () => {
  const tabs = ["home", "orders", "courier", "products"];
  assert.equal(activeTabFor("orders", tabs), "orders");
  assert.equal(activeTabFor("courier", tabs), "courier");
  assert.equal(activeTabFor("pnl", tabs), null);
  assert.equal(activeTabFor("products/x", tabs), "products");
});

test("active filter count", () => {
  const d = { source: "All", city: "All", sku: "All" };
  assert.equal(countActiveFilters({ status: [], source: "All", city: "All", sku: "All" }, d), 0);
  assert.equal(countActiveFilters({ status: ["Pending"], source: "Meta", city: "All", sku: "All" }, d), 2);
  assert.equal(countActiveFilters({ q: "" }, {}), 0);
  assert.equal(countActiveFilters({ q: "abc" }, {}), 1);
});
