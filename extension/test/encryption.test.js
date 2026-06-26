import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptJSON, decryptJSON, isEnvelope } from "../src/transport/crypto.js";
import { createEncryptedAdapter } from "../src/transport/encryptedAdapter.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";
import { assertEncryptionUnlocked, EncryptionLockedError } from "../src/transport/encGuard.js";

test("encrypt/decrypt round-trips and rejects a wrong passphrase", async () => {
  const obj = { version: 1, records: { a: { id: "a", payload: { url: "https://secret.example" } } } };
  const env = await encryptJSON(obj, "hunter2");
  assert.ok(isEnvelope(env));
  assert.equal(JSON.stringify(env).includes("secret.example"), false); // not in ciphertext
  assert.deepEqual(await decryptJSON(env, "hunter2"), obj);
  await assert.rejects(() => decryptJSON(env, "wrong"), /Wrong passphrase/);
});

test("envelope is self-describing (carries KDF params) and decrypt honors them", async () => {
  const env = await encryptJSON({ a: 1 }, "pw");
  assert.equal(env.kdf.name, "PBKDF2");
  assert.ok(env.kdf.iterations >= 600000); // strengthened default
  // Tampering with the recorded KDF params yields a different key -> failure,
  // proving decrypt derives from the envelope's own params (not a hardcoded one).
  const tampered = { ...env, kdf: { ...env.kdf, iterations: env.kdf.iterations + 1 } };
  await assert.rejects(() => decryptJSON(tampered, "pw"), /Wrong passphrase|corrupt/);
});

test("assertEncryptionUnlocked fails closed when enabled without a passphrase", () => {
  assert.throws(() => assertEncryptionUnlocked({ encryption: { enabled: true, passphrase: "" } }), EncryptionLockedError);
  assert.doesNotThrow(() => assertEncryptionUnlocked({ encryption: { enabled: true, passphrase: "x" } }));
  assert.doesNotThrow(() => assertEncryptionUnlocked({ encryption: { enabled: false } }));
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
