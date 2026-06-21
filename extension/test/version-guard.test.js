// A device running an older schema must refuse to overwrite newer sync data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";
import { IncompatibleStateError } from "../src/model/version.js";

test("a newer-major sync state is not clobbered by an older client", async () => {
  // Shared state already at a future schema version (v2).
  const t = createMemoryAdapter({ version: 2, records: {}, updatedAt: 0 });
  const A = makeDevice(t, "A");
  A.add("https://x.example", "X");

  await assert.rejects(() => A.sync(), IncompatibleStateError);

  // State must be untouched — no overwrite happened.
  const snap = t.snapshot();
  assert.equal(snap.version, 2);
  assert.deepEqual(snap.records, {});
});
