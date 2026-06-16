import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";

test("a create propagates across devices", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://a.example", "Site A");
  await A.sync();
  await B.sync();

  assert.deepEqual(B.urls(), ["https://a.example"]);
});

test("re-syncing an unchanged device applies nothing", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");
  A.add("https://a.example", "Site A");
  await A.sync();
  await B.sync();

  const second = await B.sync();
  assert.equal(second.applied, 0);
});

test("a delete propagates and does not resurrect", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://gone.example", "Temp");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), ["https://gone.example"]);

  A.del("https://gone.example");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), []); // deleted on B

  // Passive re-syncs must not bring it back.
  await B.sync();
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), []);
  assert.deepEqual(A.urls(), []);
});

test("concurrent creates on two devices both converge", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://a.example", "A");
  B.add("https://b.example", "B");
  await A.sync();
  await B.sync(); // B sees A, pushes A+B
  await A.sync(); // A now sees B

  const expected = ["https://a.example", "https://b.example"];
  assert.deepEqual(A.urls(), expected);
  assert.deepEqual(B.urls(), expected);
});

test("a title edit propagates as an update, not a duplicate", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://x.example", "Old");
  await A.sync();
  await B.sync();

  // edit title on A
  A.db[0].title = "New";
  await A.sync();
  await B.sync();

  assert.equal(B.db.length, 1);
  assert.equal(B.db[0].title, "New");
});
