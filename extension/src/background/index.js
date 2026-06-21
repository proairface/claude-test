// Service worker / background entry point.
//
// Sync is triggered by a configurable alarm, debounced local-change events, and
// on-demand "Sync now" — all funneled through one coalescing lock. Safety rails:
// corruption guard + version guard (engine), per-operation permissions, a
// large-change threshold that pauses for confirmation, and pre-destructive
// bookmark backups.
import browser from "../lib/browser.js";
import { runSyncCycle } from "../sync/engine.js";
import { collectBookmarks } from "../collectors/bookmarks.js";
import { applyBookmarks } from "../appliers/bookmarks.js";
import { collectTabs } from "../collectors/tabs.js";
import { applyTabs } from "../appliers/tabs.js";
import { collectHistorySince } from "../collectors/history.js";
import { applyHistory } from "../appliers/history.js";
import { runHistorySync } from "../sync/history.js";
import { createStore } from "../state/store.js";
import { createTransport } from "../transport/index.js";
import { periodForConfig } from "../sync/schedule.js";
import { runConfigMigrations } from "../state/migrate.js";
import { LargeChangeError } from "../model/validate.js";
import { backupBookmarks, restoreBackup } from "../state/backups.js";
import { buildSnapshot, parseSnapshot, recordsByType } from "../state/portable.js";
import { makeUrlFilter } from "../model/filters.js";

const urlFilterFor = (cfg) => makeUrlFilter(cfg.filters);
const keepFor = (cfg) => {
  const f = urlFilterFor(cfg);
  return (rec) => { const u = rec.payload?.url; return u ? f(u) : true; };
};

const SYNC_ALARM = "browsersync:cycle";
const CONFIG_KEY = "browsersync:config";
const REMOTE_TABS_KEY = "browsersync:remoteTabs";
const PENDING_KEY = "browsersync:pendingLargeChange";
const BYPASS_KEY = "browsersync:allowLargeOnce";
const DEFAULT_CONFIG = {
  autoSync: true, intervalValue: 5, intervalUnit: "minutes", syncOnChange: true,
  permissions: { add: true, update: true, remove: true }, confirmThreshold: 200, backups: true,
};

async function getConfig() {
  return { ...DEFAULT_CONFIG, ...((await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] ?? {}) };
}
async function getFlag(key) { return Boolean((await browser.storage.local.get(key))[key]); }
async function consumeBypass() {
  const v = await getFlag(BYPASS_KEY);
  if (v) await browser.storage.local.set({ [BYPASS_KEY]: false });
  return v;
}

// --- sync work --------------------------------------------------------------
async function syncBookmarks(cfg, { dryRun = false } = {}) {
  const perms = cfg.permissions ?? {};
  const threshold = Number(cfg.confirmThreshold);
  const maxRemovals = Number.isFinite(threshold) && threshold > 0 ? threshold : null;
  const allowLargeChange = dryRun ? false : await consumeBypass();
  const filter = urlFilterFor(cfg);
  try {
    const res = await runSyncCycle({
      transport: createTransport(cfg),
      collect: () => collectBookmarks(filter),
      keep: keepFor(cfg),
      dryRun,
      apply: async (recs) => {
        if (cfg.backups !== false && recs.some((r) => r.deleted)) await backupBookmarks();
        await applyBookmarks(recs, {
          add: perms.add !== false, update: perms.update !== false, remove: perms.remove !== false,
        });
      },
      store: createStore("bookmark"),
      type: "bookmark",
      maxRemovals,
      allowLargeChange,
      mode: cfg.role ?? "sync",
    });
    await browser.storage.local.remove(PENDING_KEY);
    return res;
  } catch (err) {
    if (err instanceof LargeChangeError) {
      await browser.storage.local.set({
        [PENDING_KEY]: { count: err.count, limit: err.limit, type: err.recordType, ts: Date.now() },
      });
    }
    throw err;
  }
}

async function syncTabs(cfg, deviceId, { dryRun = false } = {}) {
  const store = createStore("tab");
  const filter = urlFilterFor(cfg);
  const result = await runSyncCycle({
    transport: createTransport(cfg),
    collect: () => collectTabs(deviceId, cfg.deviceName ?? "", filter),
    apply: applyTabs,
    store,
    type: "tab",
    owns: (rec, self) => rec.payload?.ownerDevice === self,
    keep: keepFor(cfg),
    mode: cfg.role ?? "sync",
    dryRun,
  });
  if (!dryRun) await cacheRemoteTabs(store, deviceId);
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

async function syncHistory(cfg, deviceId, { dryRun = false } = {}) {
  const lookbackDays = Number(cfg.historyLookbackDays) > 0 ? Number(cfg.historyLookbackDays) : 90;
  const filter = urlFilterFor(cfg);
  return runHistorySync({
    transport: createTransport(cfg),
    collect: (since, knownIds, dev) => collectHistorySince(since, knownIds, dev, { filter }),
    apply: applyHistory,
    store: createStore("visit"),
    type: "visit",
    keep: keepFor(cfg),
    mode: cfg.role ?? "sync",
    dryRun,
    initialWatermark: Date.now() - lookbackDays * 86400000,
  });
}

async function syncEnabled(opts = {}) {
  const cfg = await getConfig();
  const enabled = cfg.enabled ?? { bookmarks: true };
  const deviceId = await createStore("bookmark").getDeviceId();
  const summary = {};
  if (enabled.bookmarks !== false) summary.bookmark = await syncBookmarks(cfg, opts);
  if (enabled.tabs) summary.tab = await syncTabs(cfg, deviceId, opts);
  if (enabled.history) summary.visit = await syncHistory(cfg, deviceId, opts);
  return summary;
}

// Preview: what a sync would change, applying/uploading nothing.
async function previewSync() {
  const summary = await syncEnabled({ dryRun: true });
  const out = {};
  for (const [type, res] of Object.entries(summary)) {
    const changes = res.changes ?? [];
    out[type] = {
      add: changes.filter((c) => !c.deleted).map((c) => c.payload?.url).filter(Boolean).slice(0, 200),
      remove: changes.filter((c) => c.deleted).map((c) => c.payload?.url).filter(Boolean).slice(0, 200),
      addCount: changes.filter((c) => !c.deleted).length,
      removeCount: changes.filter((c) => c.deleted).length,
    };
  }
  return out;
}

// --- inspector: read the shared sync state (read-only) ----------------------
async function inspectState() {
  const cfg = await getConfig();
  const pulled = await createTransport(cfg).pull();
  const records = pulled.state?.records ?? {};
  const rows = [];
  const counts = {};
  for (const rec of Object.values(records)) {
    const type = rec.type ?? "bookmark";
    counts[type] = (counts[type] ?? 0) + 1;
    if (rec.deleted) continue;
    rows.push({
      type,
      url: rec.payload?.url ?? "",
      title: rec.payload?.title ?? "",
      device: rec.payload?.deviceName || rec.deviceId || "",
    });
  }
  return { counts, total: rows.length, rows };
}

// --- portable export / import (offline migration) ---------------------------
async function exportSnapshot() {
  const cfg = await getConfig();
  const deviceId = await createStore("bookmark").getDeviceId();
  const bookmarkItems = await collectBookmarks();
  let historyItems = [];
  if (cfg.enabled?.history) {
    historyItems = await collectHistorySince(0, new Set(), deviceId, { maxResults: 50000 });
  }
  return buildSnapshot({ deviceId, deviceName: cfg.deviceName, bookmarkItems, historyItems });
}

async function importSnapshot(text) {
  const cfg = await getConfig();
  const perms = cfg.permissions ?? {};
  const snap = parseSnapshot(text);
  const bookmarks = recordsByType(snap, "bookmark");
  const visits = recordsByType(snap, "visit");
  // Additive only — import never removes or overwrites.
  await applyBookmarks(bookmarks, { add: perms.add !== false, update: false, remove: false });
  await applyHistory(visits);
  return { bookmark: bookmarks.length, visit: visits.length };
}

// --- coalescing lock --------------------------------------------------------
let inFlight = null;
function runSync() {
  if (inFlight) return inFlight;
  inFlight = syncEnabled()
    .then((s) => { console.log("[BrowserSync] synced", s); return s; })
    .catch((err) => { console.warn("[BrowserSync] sync stopped:", err.message); throw err; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

// --- debounced local-change trigger ----------------------------------------
let debounceTimer = null;
function requestSyncDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSync().catch(() => {}), 4000);
}
async function onLocalChange(kind) {
  const cfg = await getConfig();
  if (!cfg.syncOnChange) return;
  if (kind === "bookmark" && cfg.enabled?.bookmarks === false) return;
  if (kind === "tab" && !cfg.enabled?.tabs) return;
  requestSyncDebounced();
}

// --- periodic alarm from config ---------------------------------------------
async function applyAlarm() {
  const cfg = await getConfig();
  await browser.alarms.clear(SYNC_ALARM);
  const period = periodForConfig(cfg);
  if (period == null) return;
  await browser.alarms.create(SYNC_ALARM, { periodInMinutes: period });
}

// --- wiring -----------------------------------------------------------------
browser.runtime.onInstalled.addListener(async (details) => {
  if (details?.reason === "update" || details?.reason === "install") await runConfigMigrations();
  await createStore("bookmark").getDeviceId();
  await applyAlarm();
});
browser.runtime.onStartup?.addListener(applyAlarm);

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) runSync().catch(() => {});
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONFIG_KEY]) applyAlarm();
});

for (const ev of ["onCreated", "onChanged", "onRemoved", "onMoved"]) {
  browser.bookmarks?.[ev]?.addListener(() => onLocalChange("bookmark"));
}
browser.tabs?.onCreated?.addListener(() => onLocalChange("tab"));
browser.tabs?.onRemoved?.addListener(() => onLocalChange("tab"));
browser.tabs?.onUpdated?.addListener((_id, info) => {
  if (info.url || info.status === "complete") onLocalChange("tab");
});

browser.runtime.onMessage.addListener((msg) => {
  switch (msg?.type) {
    case "SYNC_NOW":
      return runSync();
    case "PREVIEW_SYNC":
      return previewSync();
    case "APPROVE_LARGE_CHANGE": // user confirmed a paused large change
      return browser.storage.local.set({ [BYPASS_KEY]: true }).then(runSync);
    case "RESTORE_BACKUP":
      return restoreBackup(msg.ts);
    case "INSPECT_STATE":
      return inspectState();
    case "EXPORT_DATA":
      return exportSnapshot();
    case "IMPORT_DATA":
      return importSnapshot(msg.text);
    default:
      return undefined;
  }
});
