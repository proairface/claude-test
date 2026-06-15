// Collector: read open tabs -> normalized Records (per-device set).
// TODO(M4): browser.tabs.query({}), group by window, emit "tab" Records.
import browser from "../lib/browser.js";

/** @returns {Promise<import("../model/records.js").Record[]>} */
export async function collectTabs() {
  throw new Error("collectTabs not implemented (M4)");
}
