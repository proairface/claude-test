// Applier: surface/restore other devices' tabs.
// TODO(M4): default = expose a list (no auto-open); optional restore opens
// browser.tabs.create({ url, active:false }). Never force-close local tabs.
import browser from "../lib/browser.js";

/** @param {import("../model/records.js").Record[]} records */
export async function applyTabs(records) {
  throw new Error("applyTabs not implemented (M4)");
}
