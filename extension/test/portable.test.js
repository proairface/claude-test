import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, parseSnapshot, recordsByType } from "../src/state/portable.js";

test("buildSnapshot tags records by type and counts them", () => {
  const snap = buildSnapshot({
    deviceId: "A", deviceName: "laptop",
    bookmarkItems: [{ id: "b1", payload: { url: "https://x", title: "X", parentPath: ["bar"] } }],
    historyItems: [{ id: "v1", payload: { url: "https://y", visitTime: 5, ownerDevice: "A" } }],
  });
  assert.equal(snap.app, "browsersync");
  assert.equal(snap.counts.bookmark, 1);
  assert.equal(snap.counts.visit, 1);
  assert.equal(snap.records.b1.type, "bookmark");
  assert.equal(snap.records.v1.type, "visit");
});

test("parseSnapshot round-trips and rejects junk", () => {
  const snap = buildSnapshot({ deviceId: "A", bookmarkItems: [], historyItems: [] });
  const parsed = parseSnapshot(JSON.stringify(snap));
  assert.equal(parsed.app, "browsersync");

  assert.throws(() => parseSnapshot("not json"), /valid JSON/);
  assert.throws(() => parseSnapshot(JSON.stringify({ foo: 1 })), /BrowserSync snapshot/);
});

test("recordsByType filters by type and drops tombstones", () => {
  const snap = buildSnapshot({
    deviceId: "A",
    bookmarkItems: [{ id: "b1", payload: { url: "https://x", title: "X", parentPath: ["bar"] } }],
    historyItems: [{ id: "v1", payload: { url: "https://y", visitTime: 5, ownerDevice: "A" } }],
  });
  assert.equal(recordsByType(snap, "bookmark").length, 1);
  assert.equal(recordsByType(snap, "visit").length, 1);
});
