// Persistence for sync bookkeeping, backed by browser.storage.local.
//
// Holds: a stable deviceId, the device's Lamport clock, the per-type "baseline"
// (last cycle's merged record map), and the history watermark. Baseline/
// watermark/lamport are namespaced per PROFILE so multiple named sync sets (work
// vs personal, different files) never cross-contaminate. The "default" profile
// uses the original un-prefixed keys for backward compatibility.
import browser from "../lib/browser.js";
import { keyLamport, keyBaseline, keyWatermark, keyEtag } from "./storeKeys.js";

const KEY_DEVICE = "browsersync:deviceId";

async function get(key, fallback) {
  const out = await browser.storage.local.get(key);
  return out[key] ?? fallback;
}
async function set(key, value) {
  await browser.storage.local.set({ [key]: value });
}

/**
 * Build a store bound to a record `type` and a `profileId`.
 * @param {string} type
 * @param {string} [profileId]
 */
export function createStore(type, profileId = "default") {
  return {
    async getDeviceId() {
      let id = await get(KEY_DEVICE, null);
      if (!id) {
        id = crypto.randomUUID();
        await set(KEY_DEVICE, id);
      }
      return id;
    },
    getLamport: () => get(keyLamport(profileId), 0),
    setLamport: (n) => set(keyLamport(profileId), n),
    getBaseline: () => get(keyBaseline(type, profileId), {}),
    setBaseline: (map) => set(keyBaseline(type, profileId), map),
    getWatermark: () => get(keyWatermark(type, profileId), null),
    setWatermark: (ms) => set(keyWatermark(type, profileId), ms),
    // Last-seen file ETag (per profile) for conditional (delta) transfers.
    getLastEtag: () => get(keyEtag(profileId), null),
    setLastEtag: (etag) => set(keyEtag(profileId), etag),
  };
}
