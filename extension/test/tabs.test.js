import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeTabDevice, liveTabs } from "../test-utils/tabDevice.js";

const urlsFor = (adapter, owner) =>
  liveTabs(adapter).filter((t) => t.owner === owner).map((t) => t.url).sort();

test("each device's open tabs coexist; neither deletes the other's", async () => {
  const t = createMemoryAdapter();
  const A = makeTabDevice(t, "A", "laptop");
  const B = makeTabDevice(t, "B", "desktop");

  A.open("https://a-tab.example");
  await A.sync();
  B.open("https://b-tab.example");
  await B.sync(); // B must NOT tombstone A's tab just because B doesn't have it

  assert.deepEqual(urlsFor(t, "A"), ["https://a-tab.example"]);
  assert.deepEqual(urlsFor(t, "B"), ["https://b-tab.example"]);

  await A.sync(); // A re-syncs; still must not touch B's tab
  assert.deepEqual(urlsFor(t, "B"), ["https://b-tab.example"]);
});

test("closing a tab tombstones only the owner's record", async () => {
  const t = createMemoryAdapter();
  const A = makeTabDevice(t, "A");
  const B = makeTabDevice(t, "B");
  A.open("https://keep.example");
  A.open("https://close-me.example");
  B.open("https://b-only.example");
  await A.sync();
  await B.sync();

  A.close("https://close-me.example");
  await A.sync();

  assert.deepEqual(urlsFor(t, "A"), ["https://keep.example"]);
  assert.deepEqual(urlsFor(t, "B"), ["https://b-only.example"]); // untouched
});
