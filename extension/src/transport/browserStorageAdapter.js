// Fallback transport using the browser's own storage.sync. Zero infrastructure
// but tiny quota (~100KB) and does NOT bridge Firefox <-> Chromium. Useful for
// demos/tests only. Implemented opportunistically.
// TODO: store the (possibly chunked) state blob in browser.storage.sync.
import browser from "../lib/browser.js";

/** @returns {import("./adapter.js").TransportAdapter} */
export function createBrowserStorageAdapter() {
  return {
    async pull() { throw new Error("browserStorage.pull not implemented"); },
    async push(_state) { throw new Error("browserStorage.push not implemented"); },
    async health() { return true; },
  };
}
