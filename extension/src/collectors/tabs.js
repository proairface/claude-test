// Collector: read this device's open tabs -> "tab" Records (a per-device set).
//
// Each device owns its own tab records (keyed by ownerDevice + window + url), so
// the same URL open on two devices is two records and devices never collide.
// Only web/file tabs are included; internal pages (chrome://, about:, …) are
// skipped as they aren't useful to surface elsewhere.
import browser from "../lib/browser.js";
import { makeId } from "../model/records.js";

const SYNCABLE = /^(https?|ftp|file):/i;

/**
 * @param {string} deviceId
 * @param {string} [deviceName] friendly label shown in other devices' UI
 * @returns {Promise<Array<{id:string,payload:object}>>}
 */
export async function collectTabs(deviceId, deviceName = "", filter = () => true) {
  const tabs = await browser.tabs.query({});
  const out = [];
  for (const t of tabs) {
    if (!t.url || !SYNCABLE.test(t.url)) continue;
    if (!filter(t.url)) continue; // excluded by user filters
    const payload = {
      url: t.url,
      title: t.title ?? "",
      ownerDevice: deviceId,
      deviceName,
      windowId: t.windowId,
      index: t.index ?? 0,
      pinned: Boolean(t.pinned),
    };
    out.push({
      id: await makeId("tab", { ownerDevice: deviceId, windowId: t.windowId, url: t.url }),
      payload,
    });
  }
  return out;
}
