// Service worker / background entry point. Registers a periodic alarm and an
// on-demand "sync now" message, both of which run a sync cycle for each enabled
// data type. The active transport is selectable in the options page; the engine
// itself is transport-agnostic.
import browser from "../lib/browser.js";
import { runSyncCycle } from "../sync/engine.js";
import { collectBookmarks } from "../collectors/bookmarks.js";
import { applyBookmarks } from "../appliers/bookmarks.js";
import { collectTabs } from "../collectors/tabs.js";
import { applyTabs } from "../appliers/tabs.js";
import { createStore } from "../state/store.js";
import { createTransport } from "../transport/index.js";

const SYNC_ALARM = "browsersync:cycle";
const CONFIG_KEY = "browsersync:config";
const REMOTE_TABS_KEY = "browsersync:remoteTabs";

async function getConfig() {
  return (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] ?? {};
}

async function syncBookmarks(cfg) {
  return runSyncCycle({
    transport: createTransport(cfg),
    collect: collectBookmarks,
    apply: applyBookmarks,
    store: createStore("bookmark"),
    type: "bookmark",
  });
}

async function syncTabs(cfg, deviceId) {
  const store = createStore("tab");
  const result = await runSyncCycle({
    transport: createTransport(cfg),
    collect: () => collectTabs(deviceId, cfg.deviceName ?? ""),
    apply: applyTabs, // list-only: never auto-open other devices' tabs
    store,
    type: "tab",
    owns: (rec, self) => rec.payload?.ownerDevice === self,
  });
  await cacheRemoteTabs(store, deviceId);
  return result;
}

// Build a per-device view of OTHER devices' open tabs and cache it for the UI.
async function cacheRemoteTabs(store, deviceId) {
  const baseline = await store.getBaseline();
  /** @type {Record<string, {deviceName:string, tabs:Array<{url:string,title:string}>}>} */
  const byDevice = {};
  for (const rec of Object.values(baseline)) {
    if (rec.deleted) continue;
    const p = rec.payload ?? {};
    if (p.ownerDevice === deviceId) continue; // skip our own tabs
    const key = p.ownerDevice ?? "unknown";
    (byDevice[key] ??= { deviceName: p.deviceName || key.slice(0, 8), tabs: [] }).tabs.push({
      url: p.url,
      title: p.title,
    });
  }
  await browser.storage.local.set({ [REMOTE_TABS_KEY]: byDevice });
}

async function syncEnabled() {
  const cfg = await getConfig();
  const enabled = cfg.enabled ?? { bookmarks: true };
  const deviceId = await createStore("bookmark").getDeviceId();
  const summary = {};
  try {
    if (enabled.bookmarks !== false) summary.bookmark = await syncBookmarks(cfg);
    if (enabled.tabs) summary.tab = await syncTabs(cfg, deviceId);
    console.log("[BrowserSync] synced", summary);
    return summary;
  } catch (err) {
    console.error("[BrowserSync] sync failed", err);
    throw err;
  }
}

browser.runtime.onInstalled.addListener(async () => {
  await createStore("bookmark").getDeviceId(); // ensure a deviceId exists
  await browser.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
  console.log("[BrowserSync] installed; sync alarm registered.");
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncEnabled().catch(() => {});
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SYNC_NOW") return syncEnabled(); // Promise -> reply
});
