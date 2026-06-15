import { test } from "node:test";
import assert from "node:assert/strict";
import { makeId, stableStringify } from "../src/model/records.js";

test("stableStringify is key-order independent", () => {
  assert.equal(
    stableStringify({ b: 1, a: 2, c: { y: 1, x: 2 } }),
    stableStringify({ a: 2, c: { x: 2, y: 1 }, b: 1 }),
  );
});

test("makeId is deterministic and key-order independent", async () => {
  const a = await makeId("bookmark", { url: "https://x", parentPath: ["bar"] });
  const b = await makeId("bookmark", { parentPath: ["bar"], url: "https://x" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("makeId distinguishes different keys", async () => {
  const a = await makeId("bookmark", { url: "https://x", parentPath: ["bar"] });
  const b = await makeId("bookmark", { url: "https://x", parentPath: ["other"] });
  assert.notEqual(a, b);
});
