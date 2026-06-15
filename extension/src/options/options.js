// Options page logic: persist the transport config and trigger a sync on demand.
import browser from "../lib/browser.js";

const CONFIG_KEY = "browsersync:config";
const $ = (id) => document.getElementById(id);

async function loadConfig() {
  const cfg = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] ?? {};
  if (cfg.transport) {
    const radio = document.querySelector(`input[name="transport"][value="${cfg.transport}"]`);
    if (radio) radio.checked = true;
  }
  if (cfg.baseUrl) $("baseUrl").value = cfg.baseUrl;
  if (cfg.token) $("token").value = cfg.token;
  if (cfg.deviceName) $("deviceName").value = cfg.deviceName;
  for (const t of ["Bookmarks", "Tabs", "History"]) {
    if (cfg.enabled && t.toLowerCase() in cfg.enabled) {
      $(`sync${t}`).checked = Boolean(cfg.enabled[t.toLowerCase()]);
    }
  }
}

async function saveConfig() {
  const cfg = {
    transport: document.querySelector('input[name="transport"]:checked')?.value ?? "localAgent",
    baseUrl: $("baseUrl").value.trim(),
    token: $("token").value,
    deviceName: $("deviceName").value.trim(),
    enabled: {
      bookmarks: $("syncBookmarks").checked,
      tabs: $("syncTabs").checked,
      history: $("syncHistory").checked,
    },
  };
  await browser.storage.local.set({ [CONFIG_KEY]: cfg });
  return cfg;
}

function setStatus(text) {
  let el = $("status");
  if (!el) {
    el = document.createElement("p");
    el.id = "status";
    document.body.appendChild(el);
  }
  el.textContent = text;
}

document.addEventListener("change", () => {
  saveConfig().catch((e) => setStatus(`Save failed: ${e.message}`));
});

$("syncNow")?.addEventListener("click", async () => {
  await saveConfig();
  setStatus("Syncing…");
  try {
    const result = await browser.runtime.sendMessage({ type: "SYNC_NOW" });
    setStatus(`Synced: applied ${result?.applied ?? 0}, ${result?.total ?? 0} total records.`);
  } catch (e) {
    setStatus(`Sync failed: ${e.message}`);
  }
});

loadConfig().catch((e) => setStatus(`Load failed: ${e.message}`));
