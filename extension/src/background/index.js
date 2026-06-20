// Service worker / background entry point.
//
// Sync is triggered three ways, all funneled through a single coalescing lock so
// runs can never overlap or pile up:
//   1. a configurable periodic alarm (the "pull" schedule),
//   2. debounced reactions to local bookmark/tab changes ("sync when things
//      change" — near-instant without polling), and
//   3. on-demand "Sync now" from the options page.
import browser from "../lib/browser.js";
import { runSyncCycle } from "../sync/engine.js";
import { collectBookmarks } from "../collectors/bookmarks.js";
import { applyBookmarks } from "../appliers/bookmarks.js";
import { collectTabs } from "../collectors/tabs.js";
import { applyTabs } from "../appliers/tabs.js";
import { createStore } from "../state/store.js";
import { createTransport } from "../transport/index.js";
import { periodForConfig } from "../sync/schedule.js";

const SYNC_ALARM = "browsersync:cycle";
const CONFIG_KEY = "browsersync:config";
const REMOTE_TABS_KEY = "browsersync:remoteTabs";
const DEFAULT_CONFIG = { autoSync: true, intervalValue: 5, intervalUnit: "minutes", syncOnChange: true };

async function getConfig() {
  return { ...DEFAULT_CONFIG, ...((await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] ?? {}) };
}

// --- the actual sync work ---------------------------------------------------
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
    apply: applyTabs, // list-only
    store,
    type: "tab",
    owns: (rec, self) => rec.payload?.ownerDevice === self,
  });
  await cacheRemoteTabs(store, deviceId);
  return result;
}

async function cacheRemoteTabs(store, deviceId) {
  const baseline = await store.getBaseline();
  const byDevice = {};
  for (const rec of Object.values(baseline)) {
    if (rec.deleted) continue;
    const p = rec.payload ?? {};
    if (p.ownerDevice === deviceId) continue;
    const key = p.ownerDevice ?? "unknown";
    (byDevice[key] ??= { deviceName: p.deviceName || key.slice(0, 8), tabs: [] }).tabs.push({
      url: p.url, title: p.title,
    });
  }
  await browser.storage.local.set({ [REMOTE_TABS_KEY]: byDevice });
}

async function syncEnabled() {
  const cfg = await getConfig();
  const enabled = cfg.enabled ?? { bookmarks: true };
  const deviceId = await createStore("bookmark").getDeviceId();
  const summary = {};
  if (enabled.bookmarks !== false) summary.bookmark = await syncBookmarks(cfg);
  if (enabled.tabs) summary.tab = await syncTabs(cfg, deviceId);
  return summary;
}

// --- coalescing lock: at most one sync at a time ----------------------------
let inFlight = null;
function runSync() {
  if (inFlight) return inFlight; // join the run already in progress
  inFlight = syncEnabled()
    .then((s) => { console.log("[BrowserSync] synced", s); return s; })
    .catch((err) => { console.error("[BrowserSync] sync failed", err); throw err; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

// --- debounced trigger for local changes ------------------------------------
let debounceTimer = null;
const DEBOUNCE_MS = 4000;
function requestSyncDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSync().catch(() => {}), DEBOUNCE_MS);
}

async function onLocalChange(kind) {
  const cfg = await getConfig();
  if (!cfg.syncOnChange) return;
  if (kind === "bookmark" && cfg.enabled?.bookmarks === false) return;
  if (kind === "tab" && !cfg.enabled?.tabs) return;
  requestSyncDebounced();
}

// --- (re)configure the periodic alarm from saved config ---------------------
async function applyAlarm() {
  const cfg = await getConfig();
  await browser.alarms.clear(SYNC_ALARM);
  const period = periodForConfig(cfg);
  if (period == null) return; // auto-sync disabled
  await browser.alarms.create(SYNC_ALARM, { periodInMinutes: period });
  console.log(`[BrowserSync] periodic sync every ~${period} min`);
}

// --- wiring -----------------------------------------------------------------
browser.runtime.onInstalled.addListener(async () => {
  await createStore("bookmark").getDeviceId();
  await applyAlarm();
  console.log("[BrowserSync] installed.");
});
browser.runtime.onStartup?.addListener(applyAlarm);

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) runSync().catch(() => {});
});

// Re-apply the schedule whenever settings change.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONFIG_KEY]) applyAlarm();
});

// Local-change listeners (gated by config inside onLocalChange).
for (const ev of ["onCreated", "onChanged", "onRemoved", "onMoved"]) {
  browser.bookmarks?.[ev]?.addListener(() => onLocalChange("bookmark"));
}
browser.tabs?.onCreated?.addListener(() => onLocalChange("tab"));
browser.tabs?.onRemoved?.addListener(() => onLocalChange("tab"));
browser.tabs?.onUpdated?.addListener((_id, info) => {
  if (info.url || info.status === "complete") onLocalChange("tab"); // ignore noisy intermediate events
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SYNC_NOW") return runSync(); // Promise -> reply
});
