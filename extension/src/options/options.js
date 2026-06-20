// Options page: persist transport config, request host permission for the
// chosen endpoint on demand (so the extension needs no broad install-time host
// access), and trigger a sync.
import browser from "../lib/browser.js";
import { originsForConfig } from "../transport/index.js";

const CONFIG_KEY = "browsersync:config";
const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ["webdavUrl", "webdavUser", "webdavPass", "baseUrl", "token", "deviceName"];

function readForm() {
  const cfg = {
    transport: document.querySelector('input[name="transport"]:checked')?.value ?? "localAgent",
    enabled: {
      bookmarks: $("syncBookmarks").checked,
      tabs: $("syncTabs").checked,
      history: $("syncHistory").checked,
    },
  };
  for (const f of TEXT_FIELDS) cfg[f] = $(f).value.trim?.() ?? $(f).value;
  return cfg;
}

async function loadConfig() {
  const cfg = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] ?? {};
  if (cfg.transport) {
    const r = document.querySelector(`input[name="transport"][value="${cfg.transport}"]`);
    if (r) r.checked = true;
  }
  for (const f of TEXT_FIELDS) if (cfg[f] != null) $(f).value = cfg[f];
  if (cfg.enabled) {
    $("syncBookmarks").checked = cfg.enabled.bookmarks !== false;
    $("syncTabs").checked = Boolean(cfg.enabled.tabs);
    $("syncHistory").checked = Boolean(cfg.enabled.history);
  }
  updateVisibility();
}

function updateVisibility() {
  const sel = document.querySelector('input[name="transport"]:checked')?.value ?? "";
  for (const g of document.querySelectorAll(".group")) {
    const applies = (g.dataset.for ?? "").split(/\s+/).includes(sel);
    g.style.display = applies ? "" : "none";
  }
}

async function saveConfig() {
  const cfg = readForm();
  await browser.storage.local.set({ [CONFIG_KEY]: cfg });
  return cfg;
}

// Ask for permission to talk to the configured endpoint, only when needed.
async function ensurePermission(cfg) {
  const origins = originsForConfig(cfg);
  if (!origins.length) return true;
  if (await browser.permissions.contains({ origins })) return true;
  // Must be called from a user gesture (the button click) on Firefox.
  return browser.permissions.request({ origins });
}

function setStatus(text) { $("status").textContent = text; }

document.addEventListener("change", (e) => {
  if (e.target?.name === "transport") updateVisibility();
  saveConfig().catch((err) => setStatus(`Save failed: ${err.message}`));
});

$("syncNow").addEventListener("click", async () => {
  const cfg = await saveConfig();
  setStatus("Requesting access…");
  try {
    const granted = await ensurePermission(cfg);
    if (!granted) return setStatus("Permission denied for that endpoint — cannot sync.");
    setStatus("Syncing…");
    const result = await browser.runtime.sendMessage({ type: "SYNC_NOW" });
    setStatus(`Synced: applied ${result?.applied ?? 0}, ${result?.total ?? 0} total records.`);
  } catch (err) {
    setStatus(`Sync failed: ${err.message}`);
  }
});

loadConfig().catch((err) => setStatus(`Load failed: ${err.message}`));
