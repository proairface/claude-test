// Options page: persist transport config, request host permission for the
// chosen endpoint on demand (so the extension needs no broad install-time host
// access), and trigger a sync.
import browser from "../lib/browser.js";
import { originsForConfig } from "../transport/index.js";
import { listBackups } from "../state/backups.js";
import { parseDomainList } from "../model/filters.js";

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
    filters: { excludeDomains: parseDomainList($("excludeDomains").value) },
    role: $("role").value,
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
  if (cfg.filters?.excludeDomains) $("excludeDomains").value = cfg.filters.excludeDomains.join("\n");
  if (cfg.role) $("role").value = cfg.role;
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

let inspectRows = [];
function renderInspect() {
  const q = $("inspectSearch").value.trim().toLowerCase();
  const box = $("inspectResults");
  const matches = !q
    ? inspectRows
    : inspectRows.filter((r) =>
        (r.url + " " + r.title + " " + r.device).toLowerCase().includes(q));
  box.textContent = "";
  for (const r of matches.slice(0, 500)) {
    const d = document.createElement("div");
    d.textContent = `[${r.type}] ${r.title || r.url} — ${r.url} (${r.device})`;
    box.appendChild(d);
  }
  if (matches.length > 500) {
    const more = document.createElement("div");
    more.className = "hint";
    more.textContent = `…and ${matches.length - 500} more (refine the filter)`;
    box.appendChild(more);
  }
}
$("inspectLoad").addEventListener("click", async () => {
  const cfg = await saveConfig();
  setStatus("Loading shared data…");
  try {
    if (!(await ensurePermission(cfg))) return setStatus("Permission denied for that endpoint.");
    const res = await browser.runtime.sendMessage({ type: "INSPECT_STATE" });
    inspectRows = res.rows;
    $("inspectCounts").textContent =
      `${res.total} live records — ` +
      Object.entries(res.counts).map(([t, c]) => `${t}: ${c}`).join(", ");
    renderInspect();
    setStatus("Loaded.");
  } catch (err) {
    setStatus(`Inspect failed: ${err.message}`);
  }
});
$("inspectSearch").addEventListener("input", renderInspect);

$("previewBtn").addEventListener("click", async () => {
  const cfg = await saveConfig();
  setStatus("Computing preview…");
  const box = $("preview");
  try {
    const granted = await ensurePermission(cfg);
    if (!granted) return setStatus("Permission denied for that endpoint.");
    const preview = await browser.runtime.sendMessage({ type: "PREVIEW_SYNC" });
    box.textContent = "";
    const entries = Object.entries(preview);
    const total = entries.reduce((n, [, p]) => n + p.addCount + p.removeCount, 0);
    if (total === 0) {
      box.textContent = "No changes — everything is already in sync.";
    } else {
      for (const [type, p] of entries) {
        const h = document.createElement("div");
        h.innerHTML = `<strong>${type}</strong>: +${p.addCount} add/update, −${p.removeCount} remove`;
        box.appendChild(h);
        for (const u of p.remove.slice(0, 20)) {
          const d = document.createElement("div"); d.textContent = `− ${u}`; d.style.color = "#a00"; box.appendChild(d);
        }
        for (const u of p.add.slice(0, 20)) {
          const d = document.createElement("div"); d.textContent = `+ ${u}`; d.style.color = "#070"; box.appendChild(d);
        }
      }
    }
    box.style.display = "";
    setStatus("Preview ready (nothing applied).");
  } catch (err) {
    setStatus(`Preview failed: ${err.message}`);
  }
});

$("exportBtn").addEventListener("click", async () => {
  setStatus("Building export…");
  try {
    const snap = await browser.runtime.sendMessage({ type: "EXPORT_DATA" });
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `browsersync-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${snap.counts.bookmark} bookmarks, ${snap.counts.visit} visits.`);
  } catch (err) {
    setStatus(`Export failed: ${err.message}`);
  }
});

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setStatus("Importing…");
  try {
    const text = await file.text();
    const res = await browser.runtime.sendMessage({ type: "IMPORT_DATA", text });
    setStatus(`Imported: ${res.bookmark} bookmarks, ${res.visit} visits (additive).`);
    await refreshPanels();
  } catch (err) {
    setStatus(`Import failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

loadConfig().then(refreshPanels).catch((err) => setStatus(`Load failed: ${err.message}`));
