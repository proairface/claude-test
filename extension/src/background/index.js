// Service worker / background entry point.
// Responsibilities (M1+): load config, ensure a deviceId, register a periodic
// alarm to run sync, and expose on-demand "sync now" via runtime messaging.
import browser from "../lib/browser.js";
import { runSyncCycle } from "../sync/engine.js";

const SYNC_ALARM = "browsersync:cycle";

async function ensureDeviceId() {
  // TODO(M1): read/create a UUID in browser.storage.local.
}

browser.runtime?.onInstalled?.addListener(async () => {
  await ensureDeviceId();
  // TODO(M1): browser.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
  console.log("[BrowserSync] installed (scaffold).");
});

browser.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name !== SYNC_ALARM) return;
  // TODO(M2): assemble deps (transport from config, collectors, appliers) and:
  // runSyncCycle(deps).catch(console.error);
});

// On-demand sync trigger from the options page.
browser.runtime?.onMessage?.addListener((msg) => {
  if (msg?.type === "SYNC_NOW") {
    // TODO(M2): trigger runSyncCycle and report status back.
  }
});
