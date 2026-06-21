// Options page: persist transport config, request host permission for the
// chosen endpoint on demand (so the extension needs no broad install-time host
// access), and trigger a sync.
import browser from "../lib/browser.js";
import { originsForConfig } from "../transport/index.js";
import { listBackups } from "../state/backups.js";

const CONFIG_KEY = "browsersync:config";
const PENDING_KEY = "browsersync:pendingLargeChange";
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
    permissions: {
      add: $("permAdd").checked, update: $("permUpdate").checked, remove: $("permRemove").checked,
    },
    confirmThreshold: Math.max(0, Number($("confirmThreshold").value) || 0),
    backups: $("backups").checked,
    historyLookbackDays: Math.max(1, Number($("historyLookbackDays").value) || 90),
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
  if (cfg.permissions) {
    $("permAdd").checked = cfg.permissions.add !== false;
    $("permUpdate").checked = cfg.permissions.update !== false;
    $("permRemove").checked = cfg.permissions.remove !== false;
  }
  if (cfg.confirmThreshold != null) $("confirmThreshold").value = cfg.confirmThreshold;
  if (cfg.backups != null) $("backups").checked = cfg.backups;
  if (cfg.historyLookbackDays != null) $("historyLookbackDays").value = cfg.historyLookbackDays;
  updateVisibility();
}

function updateVisibility() {
  const sel = document.querySelector('input[name="transport"]:checked')?.value ?? "";
  for (const g of document.querySelectorAll(".group[data-for]")) {
    const applies = (g.dataset.for ?? "").split(/\s+/).includes(sel);
    g.style.display = applies ? "" : "none";
  }
  $("intervalGroup").style.display = $("autoSync").checked ? "" : "none";
  $("historyGroup").style.display = $("syncHistory").checked ? "" : "none";
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
  if (result?.visit) parts.push(`history: applied ${result.visit.applied}`);
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

// Show the "a sync was paused because it wanted to remove a lot" panel.
async function renderPending() {
  const box = $("pendingChange");
  const pending = (await browser.storage.local.get(PENDING_KEY))[PENDING_KEY];
  if (!pending) { box.style.display = "none"; box.textContent = ""; return; }
  box.style.display = "";
  box.textContent = `A sync was paused: it wanted to remove ${pending.count} ${pending.type} item(s) ` +
    `(your limit is ${pending.limit}). Approve only if that's expected.`;
  const approve = document.createElement("button");
  approve.textContent = "Approve once & sync";
  approve.style.marginLeft = ".5rem";
  approve.addEventListener("click", async () => {
    setStatus("Applying approved change…");
    try {
      const result = await browser.runtime.sendMessage({ type: "APPROVE_LARGE_CHANGE" });
      setStatus(summarize(result));
      await refreshPanels();
    } catch (err) { setStatus(`Failed: ${err.message}`); }
  });
  box.appendChild(document.createElement("br"));
  box.appendChild(approve);
}

async function renderBackups() {
  const box = $("backupList");
  const backups = await listBackups();
  if (!backups.length) return; // keep the default hint
  box.textContent = "";
  const ul = document.createElement("ul");
  for (const b of backups.sort((a, c) => c.ts - a.ts)) {
    const li = document.createElement("li");
    li.textContent = `${new Date(b.ts).toLocaleString()} — ${b.count} bookmarks  `;
    const btn = document.createElement("button");
    btn.textContent = "Restore (re-add)";
    btn.addEventListener("click", async () => {
      setStatus("Restoring backup…");
      try {
        const n = await browser.runtime.sendMessage({ type: "RESTORE_BACKUP", ts: b.ts });
        setStatus(`Restore complete (${n} bookmarks re-added where missing).`);
      } catch (err) { setStatus(`Restore failed: ${err.message}`); }
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

async function refreshPanels() {
  await Promise.all([renderRemoteTabs(), renderPending(), renderBackups()]);
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
  } catch (err) {
    setStatus(`Sync failed: ${err.message}`);
  }
  await refreshPanels();
});

loadConfig().then(refreshPanels).catch((err) => setStatus(`Load failed: ${err.message}`));
