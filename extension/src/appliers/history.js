// Applier: insert visits via native APIs, with capability branching.
//
//   Firefox : browser.history.addUrl({ url, visitTime, transition })  <- real past time
//   Chromium: browser.history.addUrl({ url })                         <- stamped "now"
//
// Per the project decision we accept the Chromium current-time limitation rather
// than shipping a native SQLite helper. History is append-only: this applier
// only ever ADDS visits, never removes.
import browser from "../lib/browser.js";

const SYNCABLE = /^https?:/i;

/** True if this engine can set a custom past visitTime (Firefox). */
export function supportsCustomVisitTime() {
  // getBrowserInfo exists on Firefox and not on Chromium.
  return typeof browser.runtime?.getBrowserInfo === "function";
}

/** @param {import("../model/records.js").Record[]} records */
export async function applyHistory(records) {
  if (!records.length) return;
  const withTime = supportsCustomVisitTime();
  for (const rec of records) {
    const { url, visitTime, transition } = rec.payload ?? {};
    if (!url || !SYNCABLE.test(url)) continue;
    try {
      if (withTime) {
        await browser.history.addUrl({ url, visitTime, ...(transition ? { transition } : {}) });
      } else {
        await browser.history.addUrl({ url }); // Chromium: stamped at insert time
      }
    } catch {
      /* skip URLs the browser refuses (e.g. unsupported scheme) */
    }
  }
}
