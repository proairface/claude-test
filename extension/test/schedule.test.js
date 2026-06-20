import { test } from "node:test";
import assert from "node:assert/strict";
import { intervalToMinutes, periodForConfig, MIN_PERIOD_MINUTES } from "../src/sync/schedule.js";

test("intervalToMinutes converts units", () => {
  assert.equal(intervalToMinutes({ intervalValue: 5, intervalUnit: "minutes" }), 5);
  assert.equal(intervalToMinutes({ intervalValue: 30, intervalUnit: "seconds" }), 0.5);
});

test("intervalToMinutes rejects invalid/zero values", () => {
  assert.equal(intervalToMinutes({ intervalValue: 0, intervalUnit: "minutes" }), null);
  assert.equal(intervalToMinutes({ intervalValue: -1 }), null);
  assert.equal(intervalToMinutes({ intervalValue: "abc" }), null);
});

test("periodForConfig returns null when auto-sync is disabled", () => {
  assert.equal(periodForConfig({ autoSync: false, intervalValue: 5 }), null);
});

test("periodForConfig clamps tiny intervals to the floor", () => {
  // 1 second -> 1/60 min, below the floor
  assert.equal(periodForConfig({ intervalValue: 1, intervalUnit: "seconds" }), MIN_PERIOD_MINUTES);
});

test("periodForConfig passes through reasonable intervals", () => {
  assert.equal(periodForConfig({ intervalValue: 10, intervalUnit: "minutes" }), 10);
});
