// Persistence for sync bookkeeping, backed by browser.storage.local.
//
// Holds: a stable deviceId, the device's Lamport clock, and the per-type
// "baseline" (last cycle's merged record map) used for change/delete detection.
import browser from "../lib/browser.js";

const KEY_DEVICE = "browsersync:deviceId";
const KEY_LAMPORT = "browsersync:lamport";
const keyBaseline = (type) => `browsersync:baseline:${type}`;

async function get(key, fallback) {
  const out = await browser.storage.local.get(key);
  return out[key] ?? fallback;
}
async function set(key, value) {
  await browser.storage.local.set({ [key]: value });
}

/**
 * Build a store bound to a record `type` (so bookmarks/tabs/history each keep
 * their own baseline) while sharing one deviceId and Lamport clock.
 * @param {string} type
 */
export function createStore(type) {
  return {
    async getDeviceId() {
      let id = await get(KEY_DEVICE, null);
      if (!id) {
        id = crypto.randomUUID();
        await set(KEY_DEVICE, id);
      }
      return id;
    },
    getLamport: () => get(KEY_LAMPORT, 0),
    setLamport: (n) => set(KEY_LAMPORT, n),
    getBaseline: () => get(keyBaseline(type), {}),
    setBaseline: (map) => set(keyBaseline(type), map),
  };
}
