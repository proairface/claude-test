// End-to-end encryption for the sync blob. A passphrase derives an AES-GCM key
// (PBKDF2); only ciphertext ever reaches the transport (WebDAV/cloud/agent), so
// those backends never see your bookmarks/history. The passphrase is never
// stored in the synced file — each envelope carries its own salt + iv, and the
// KDF parameters, so we can strengthen the KDF later without breaking data
// already encrypted with older parameters.
//
// Uses SubtleCrypto, available in extension service workers and Node 20+.

// Default KDF cost for NEW envelopes. OWASP-recommended floor for
// PBKDF2-HMAC-SHA256. Self-describing envelopes mean this can be raised over
// time without breaking older ciphertext.
const DEFAULT_KDF = { name: "PBKDF2", hash: "SHA-256", iterations: 600000 };
// Legacy default for envelopes written before the KDF was self-describing.
const LEGACY_KDF = { name: "PBKDF2", hash: "SHA-256", iterations: 150000 };

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function ub64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, kdf) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: kdf.iterations, hash: kdf.hash },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Encrypt a JSON-serializable object into a self-contained envelope. */
export async function encryptJSON(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kdf = DEFAULT_KDF;
  const key = await deriveKey(passphrase, salt, kdf);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return { bsenc: 1, kdf, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/** Decrypt an envelope back to its object; throws on wrong passphrase. */
export async function decryptJSON(env, passphrase) {
  const kdf = env.kdf ?? LEGACY_KDF; // honor the envelope's own KDF params
  const key = await deriveKey(passphrase, ub64(env.salt), kdf);
  let pt;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(env.iv) }, key, ub64(env.ct));
  } catch {
    throw new Error("Wrong passphrase or corrupt encrypted data.");
  }
  return JSON.parse(new TextDecoder().decode(pt));
}

export function isEnvelope(o) {
  return Boolean(o && o.bsenc === 1 && o.salt && o.iv && o.ct);
}
