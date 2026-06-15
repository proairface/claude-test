// Orchestrates one sync cycle: collect -> pull -> merge -> apply -> push.
// Triggered by background alarms and on-demand from the options page.
import { mergeState } from "./merge.js";

/**
 * Run a full sync cycle.
 * @param {object} deps
 * @param {import("../transport/adapter.js").TransportAdapter} deps.transport
 * @param {object} deps.collectors  { collectBookmarks, collectTabs, collectHistory }
 * @param {object} deps.appliers    { applyBookmarks, applyTabs, applyHistory }
 * @param {object} deps.config      { deviceId, enabled: {bookmarks,tabs,history}, watermarks }
 */
export async function runSyncCycle(deps) {
  // TODO(M2): wire the pipeline:
  //   1. local = collect enabled types
  //   2. remote = await deps.transport.pull()
  //   3. { merged, toApply } = mergeState(local, remote, deviceId, watermark)
  //   4. apply toApply via appliers (per type)
  //   5. await deps.transport.push(merged)  (retry on ETag 412 -> re-pull/merge)
  //   6. persist updated watermarks
  throw new Error("runSyncCycle not implemented (M2)");
}
