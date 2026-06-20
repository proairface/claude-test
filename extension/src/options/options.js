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
    autoSync: $("autoSync").checked,
    intervalValue: Number($("intervalValue").value) || 5,
    intervalUnit: $("intervalUnit").value,
    syncOnChange: $("syncOnChange").checked,
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
  if (cfg.autoSync != null) $("autoSync").checked = cfg.autoSync;
  if (cfg.intervalValue != null) $("intervalValue").value = cfg.intervalValue;
  if (cfg.intervalUnit) $("intervalUnit").value = cfg.intervalUnit;
  if (cfg.syncOnChange != null) $("syncOnChange").checked = cfg.syncOnChange;
  updateVisibility();
}

function updateVisibility() {
  const sel = document.querySelector('input[name="transport"]:checked')?.value ?? "";
  for (const g of document.querySelectorAll(".group[data-for]")) {
    const applies = (g.dataset.for ?? "").split(/\s+/).includes(sel);
    g.style.display = applies ? "" : "none";
  }
  $("intervalGroup").style.display = $("autoSync").checked ? "" : "none";
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

function summarize(result) {
  const parts = [];
  if (result?.bookmark) parts.push(`bookmarks: applied ${result.bookmark.applied}`);
  if (result?.tab) parts.push(`tabs: applied ${result.tab.applied}`);
  return parts.length ? `Synced (${parts.join("; ")}).` : "Synced.";
}

// Render the cached "other devices' tabs" view (set by the background worker).
async function renderRemoteTabs() {
  const box = $("remoteTabs");
  const byDevice = (await browser.storage.local.get("browsersync:remoteTabs"))["browsersync:remoteTabs"] ?? {};
  const devices = Object.entries(byDevice).filter(([, d]) => d.tabs?.length);
  if (!devices.length) return; // keep the default hint
  box.textContent = "";
  for (const [, dev] of devices) {
    const h = document.createElement("h4");
    h.textContent = `${dev.deviceName} (${dev.tabs.length})`;
    box.appendChild(h);
    const ul = document.createElement("ul");
    for (const t of dev.tabs) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = t.url; a.textContent = t.title || t.url; a.target = "_blank"; a.rel = "noreferrer";
      li.appendChild(a);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
}

document.addEventListener("change", () => {
  updateVisibility();
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
    setStatus(summarize(result));
    await renderRemoteTabs();
  } catch (err) {
    setStatus(`Sync failed: ${err.message}`);
  }
});

loadConfig().then(renderRemoteTabs).catch((err) => setStatus(`Load failed: ${err.message}`));
