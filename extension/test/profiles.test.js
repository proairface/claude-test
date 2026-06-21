import { test } from "node:test";
import assert from "node:assert/strict";
import { keyLamport, keyBaseline, keyWatermark } from "../src/state/storeKeys.js";

test("default profile uses legacy (un-prefixed) keys for back-compat", () => {
  assert.equal(keyBaseline("bookmark", "default"), "browsersync:baseline:bookmark");
  assert.equal(keyBaseline("bookmark"), "browsersync:baseline:bookmark");
  assert.equal(keyWatermark("visit", "default"), "browsersync:watermark:visit");
  assert.equal(keyLamport("default"), "browsersync:lamport");
});

test("named profiles get isolated, distinct keys", () => {
  assert.equal(keyBaseline("bookmark", "work"), "browsersync:baseline:work:bookmark");
  assert.equal(keyWatermark("visit", "work"), "browsersync:watermark:work:visit");
  assert.equal(keyLamport("work"), "browsersync:lamport:work");
  assert.notEqual(keyBaseline("bookmark", "work"), keyBaseline("bookmark", "personal"));
});
