// Applier for tabs.
//
// Default behavior is LIST-ONLY: we never force-open another device's tabs into
// your browser (that would be hostile). The engine's "apply" step is therefore a
// no-op for tabs — other devices' tabs are surfaced for viewing/restoring in the
// options page instead (see background's tab cache + options UI).
//
// `restoreTabs` is provided for an explicit, user-initiated "open these" action.
import browser from "../lib/browser.js";

/** No-op: tabs are surfaced for viewing, not auto-opened. */
export async function applyTabs(_records) {
  /* intentionally does nothing */
}

/**
 * Open the given tab records in the current window. User-initiated only.
 * @param {Array<{payload:{url:string}}>} records
 */
export async function restoreTabs(records) {
  for (const rec of records) {
    if (rec?.payload?.url) await browser.tabs.create({ url: rec.payload.url, active: false });
  }
}
