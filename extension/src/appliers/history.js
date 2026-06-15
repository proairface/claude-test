// Applier: insert visits with capability branching (see ARCHITECTURE.md).
//
//   Firefox : browser.history.addUrl({ url, visitTime, transition })  <- real past time
//   Chromium: browser.history.addUrl({ url })                         <- stamped "now"
//
// Per project decision we accept the Chromium current-time limitation rather
// than shipping a native SQLite helper.
import browser from "../lib/browser.js";

/** True if this engine can set a custom past visitTime (Firefox). */
export function supportsCustomVisitTime() {
  // TODO(M5): feature-detect Firefox vs Chromium reliably.
  return false;
}

/** @param {import("../model/records.js").Record[]} records */
export async function applyHistory(records) {
  throw new Error("applyHistory not implemented (M5)");
}
