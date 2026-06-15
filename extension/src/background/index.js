// Service worker / background entry point. Registers a periodic alarm and an
// on-demand "sync now" message, both of which run a bookmarks sync cycle.
//
// NOTE: the active transport is selectable in the options page; until the local
// agent (M3) lands, the localAgent adapter is the default target. The engine
// itself is transport-agnostic.
import browser from "../lib/browser.js";
import { runSyncCycle } from "../sync/engine.js";
import { collectBookmarks } from "../collectors/bookmarks.js";
import { applyBookmarks } from "../appliers/bookmarks.js";
import { createStore } from "../state/store.js";
import { createLocalAgentAdapter } from "../transport/localAgentAdapter.js";

const SYNC_ALARM = "browsersync:cycle";

async function buildDeps() {
  const cfg = (await browser.storage.local.get("browsersync:config"))["browsersync:config"] ?? {};
  const transport = createLocalAgentAdapter({
    baseUrl: cfg.baseUrl ?? "http://127.0.0.1:8787",
    token: cfg.token,
  });
  return {
    transport,
    collect: collectBookmarks,
    apply: applyBookmarks,
    store: createStore("bookmark"),
    type: "bookmark",
  };
}

async function syncBookmarks() {
  try {
    const result = await runSyncCycle(await buildDeps());
    console.log("[BrowserSync] bookmarks synced", result);
    return result;
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
  if (alarm.name === SYNC_ALARM) syncBookmarks().catch(() => {});
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SYNC_NOW") return syncBookmarks(); // returns a Promise -> reply
});
