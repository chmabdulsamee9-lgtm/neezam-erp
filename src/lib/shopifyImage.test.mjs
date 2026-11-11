import test from "node:test";
import assert from "node:assert/strict";
import { thumbUrl } from "./shopifyImage.js";

test("shopify cdn images get a width twice the css size", () => {
  assert.equal(thumbUrl("https://cdn.shopify.com/s/files/1/a/b.webp?v=12", 44), "https://cdn.shopify.com/s/files/1/a/b.webp?v=12&width=88");
  assert.equal(thumbUrl("https://shop.example.com/cdn/shop/files/x.jpg", 30), "https://shop.example.com/cdn/shop/files/x.jpg?width=60");
});

test("other hosts, data urls and empty values are unchanged", () => {
  assert.equal(thumbUrl("https://img.example.com/a.png", 44), "https://img.example.com/a.png");
  assert.equal(thumbUrl("data:image/png;base64,AAAA", 44), "data:image/png;base64,AAAA");
  assert.equal(thumbUrl(null, 44), null);
  assert.equal(thumbUrl("not a url", 44), "not a url");
});
