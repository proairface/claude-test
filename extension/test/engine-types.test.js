// Bookmarks and tabs share one sync file. Verify a cycle for one type never
// touches or applies records of the other type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";
import { makeTabDevice, liveTabs } from "../test-utils/tabDevice.js";

test("a bookmark cycle preserves tab records and never imports them as bookmarks", async () => {
  const t = createMemoryAdapter();

  // Device A publishes a tab.
  const A = makeTabDevice(t, "A");
  A.open("https://a-tab.example");
  await A.sync();

  // Device B (bookmarks) syncs against the same shared state.
  const B = makeDevice(t, "B");
  B.add("https://a-bookmark.example", "BM");
  await B.sync();

  // The shared state holds BOTH a tab and a bookmark record.
  const recs = t.snapshot().records;
  const types = new Set(Object.values(recs).filter((r) => !r.deleted).map((r) => r.type));
  assert.ok(types.has("tab"), "tab record preserved");
  assert.ok(types.has("bookmark"), "bookmark record present");

  // The tab must NOT have leaked into B's bookmark store.
  assert.deepEqual(B.urls(), ["https://a-bookmark.example"]);

  // And the tab is still intact for tab devices.
  assert.deepEqual(liveTabs(t).map((x) => x.url), ["https://a-tab.example"]);
});
