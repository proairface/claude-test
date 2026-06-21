import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptJSON, decryptJSON, isEnvelope } from "../src/transport/crypto.js";
import { createEncryptedAdapter } from "../src/transport/encryptedAdapter.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";

test("encrypt/decrypt round-trips and rejects a wrong passphrase", async () => {
  const obj = { version: 1, records: { a: { id: "a", payload: { url: "https://secret.example" } } } };
  const env = await encryptJSON(obj, "hunter2");
  assert.ok(isEnvelope(env));
  assert.equal(JSON.stringify(env).includes("secret.example"), false); // not in ciphertext
  assert.deepEqual(await decryptJSON(env, "hunter2"), obj);
  await assert.rejects(() => decryptJSON(env, "wrong"), /Wrong passphrase/);
});

test("two devices sync through an encrypted transport; stored blob is ciphertext", async () => {
  const inner = createMemoryAdapter();
  const A = makeDevice(createEncryptedAdapter(inner, "pass"), "A");
  const B = makeDevice(createEncryptedAdapter(inner, "pass"), "B");

  A.add("https://private.example", "P");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), ["https://private.example"]);

  // What's actually stored is an opaque envelope — no plaintext url.
  const stored = inner.snapshot();
  assert.ok(isEnvelope(stored));
  assert.equal(JSON.stringify(stored).includes("private.example"), false);
});
