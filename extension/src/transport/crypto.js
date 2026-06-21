// End-to-end encryption for the sync blob. A passphrase derives an AES-GCM key
// (PBKDF2); only ciphertext ever reaches the transport (WebDAV/cloud/agent), so
// those backends never see your bookmarks/history. The passphrase is never
// stored in the synced file — each envelope carries its own salt + iv.
//
// Uses SubtleCrypto, available in extension service workers and Node 20+.

const PBKDF2_ITERATIONS = 150000;

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

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Encrypt a JSON-serializable object into a self-contained envelope. */
export async function encryptJSON(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return { bsenc: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/** Decrypt an envelope back to its object; throws on wrong passphrase. */
export async function decryptJSON(env, passphrase) {
  const key = await deriveKey(passphrase, ub64(env.salt));
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
