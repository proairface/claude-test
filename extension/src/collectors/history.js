// Collector: read history visits since a watermark -> "visit" items.
//
// Skips visits whose id is already in the shared state (knownIds) — this is what
// keeps the append-only loop safe (we never re-collect what we already shared,
// including visits we imported from other devices on Firefox).
import browser from "../lib/browser.js";
import { makeId } from "../model/records.js";

const SYNCABLE = /^https?:/i;
const DEFAULT_MAX_RESULTS = 5000;

/**
 * @param {number} sinceMs incremental watermark
 * @param {Set<string>} knownIds ids already present in the shared state
 * @param {string} deviceId
 * @param {{maxResults?:number}} [opts]
 * @returns {Promise<Array<{id:string,payload:object}>>}
 */
export async function collectHistorySince(sinceMs, knownIds, deviceId, opts = {}) {
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
  const filter = opts.filter ?? (() => true);
  const results = await browser.history.search({ text: "", startTime: sinceMs, maxResults });
  const out = [];
  for (const r of results) {
    if (!r.url || !SYNCABLE.test(r.url)) continue;
    if (!filter(r.url)) continue; // excluded by user filters
    let visits = [];
    try {
      visits = await browser.history.getVisits({ url: r.url });
    } catch {
      visits = [];
    }
    for (const v of visits) {
      if (v.visitTime == null || v.visitTime < sinceMs) continue;
      const visitTime = Math.floor(v.visitTime);
      const id = await makeId("visit", { url: r.url, visitTime });
      if (knownIds.has(id)) continue;
      out.push({
        id,
        payload: {
          url: r.url,
          title: r.title ?? "",
          visitTime,
          transition: v.transition,
          ownerDevice: deviceId,
        },
      });
    }
  }
  return out;
}
