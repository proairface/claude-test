import { test } from "node:test";
import assert from "node:assert/strict";
import { validateState, CorruptStateError } from "../src/model/validate.js";
import { plannedAction } from "../src/model/bookmarkPlan.js";
import { trimBackups } from "../src/state/backupUtil.js";

// --- corruption guard -------------------------------------------------------
test("validateState accepts plausible state (incl. empty)", () => {
  assert.equal(validateState({ version: 1, records: {} }), true);
  assert.equal(validateState({ records: { a: {} } }), true);
});

test("validateState rejects corrupt shapes", () => {
  assert.throws(() => validateState(null), CorruptStateError);
  assert.throws(() => validateState([]), CorruptStateError);
  assert.throws(() => validateState({}), CorruptStateError); // no records
  assert.throws(() => validateState({ records: [] }), CorruptStateError); // records not a map
  assert.throws(() => validateState({ version: 0, records: {} }), CorruptStateError);
});

// --- per-operation permissions ---------------------------------------------
test("plannedAction honors add/update/remove permissions", () => {
  const all = { add: true, update: true, remove: true };
  const none = { add: false, update: false, remove: false };
  const rec = (p, deleted = false) => ({ deleted, payload: p });

  // create
  assert.equal(plannedAction(rec({ title: "X" }), undefined, all), "create");
  assert.equal(plannedAction(rec({ title: "X" }), undefined, none), "skip");
  // update (title differs)
  assert.equal(plannedAction(rec({ title: "New" }), { title: "Old" }, all), "update");
  assert.equal(plannedAction(rec({ title: "New" }), { title: "Old" }, none), "skip");
  // remove
  assert.equal(plannedAction(rec({}, true), { title: "Old" }, all), "remove");
  assert.equal(plannedAction(rec({}, true), { title: "Old" }, none), "skip");
  // no-op when identical
  assert.equal(plannedAction(rec({ title: "Same", index: 2 }), { title: "Same", index: 2 }, all), "noop");
});

test("plannedAction treats a position (index) change as an update", () => {
  const all = { add: true, update: true, remove: true };
  const rec = { deleted: false, payload: { title: "T", index: 0 } };
  assert.equal(plannedAction(rec, { title: "T", index: 5 }, all), "update"); // moved
  assert.equal(plannedAction(rec, { title: "T", index: 0 }, all), "noop");   // same spot
  assert.equal(plannedAction(rec, { title: "T", index: 5 }, { update: false }), "skip");
});

// --- backup retention -------------------------------------------------------
test("trimBackups keeps the newest N", () => {
  const list = [{ ts: 1 }, { ts: 5 }, { ts: 3 }, { ts: 9 }];
  assert.deepEqual(trimBackups(list, 2).map((b) => b.ts), [9, 5]);
});
