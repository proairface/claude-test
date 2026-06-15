import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWinner, mergeState, liveRecords } from "../src/sync/merge.js";
import { makeRecord, stableStringify } from "../src/model/records.js";

const rec = (id, lamport, deviceId, extra = {}) =>
  makeRecord({ id, type: "bookmark", deviceId, lamport, payload: { url: id }, ...extra });

test("pickWinner orders by lamport then deviceId", () => {
  assert.equal(pickWinner(rec("a", 1, "d1"), rec("a", 2, "d1")).lamport, 2);
  assert.equal(pickWinner(rec("a", 5, "d1"), rec("a", 5, "d2")).deviceId, "d2");
});

test("pickWinner: tombstone wins an exact tie", () => {
  const live = rec("a", 3, "d1");
  const dead = rec("a", 3, "d1", { deleted: true });
  assert.equal(pickWinner(live, dead).deleted, true);
  assert.equal(pickWinner(dead, live).deleted, true);
});

test("pickWinner handles a missing side", () => {
  assert.equal(pickWinner(undefined, rec("a", 1, "d1")).id, "a");
  assert.equal(pickWinner(rec("a", 1, "d1"), undefined).id, "a");
});

test("mergeState flags a remote create for apply when not present locally", () => {
  const remote = { a: rec("a", 1, "d1") };
  const { merged, toApply } = mergeState(remote, {}, {});
  assert.equal(Object.keys(merged).length, 1);
  assert.equal(toApply.length, 1);
  assert.equal(toApply[0].id, "a");
});

test("mergeState does not re-apply something already live and identical", () => {
  const r = rec("a", 1, "d1");
  const live = { a: stableStringify(r.payload) };
  const { toApply } = mergeState({ a: r }, { a: r }, live);
  assert.equal(toApply.length, 0);
});

test("mergeState flags a tombstone for deletion only if locally live", () => {
  const dead = rec("a", 2, "d1", { deleted: true });
  assert.equal(mergeState({ a: dead }, {}, { a: "x" }).toApply.length, 1); // live -> delete
  assert.equal(mergeState({ a: dead }, {}, {}).toApply.length, 0); // absent -> nothing
});

test("liveRecords drops tombstones", () => {
  const out = liveRecords({ a: rec("a", 1, "d1"), b: rec("b", 1, "d1", { deleted: true }) });
  assert.deepEqual(Object.keys(out), ["a"]);
});
