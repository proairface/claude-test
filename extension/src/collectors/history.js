// Collector: read history since the last watermark -> "visit" Records.
// TODO(M5): browser.history.search({ text:"", startTime: watermark, maxResults })
// then browser.history.getVisits() per url for precise visitTime + transition.
import browser from "../lib/browser.js";

/**
 * @param {number} sinceMs incremental watermark
 * @returns {Promise<import("../model/records.js").Record[]>}
 */
export async function collectHistory(sinceMs) {
  throw new Error("collectHistory not implemented (M5)");
}
