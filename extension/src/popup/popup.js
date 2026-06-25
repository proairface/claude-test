// Toolbar popup: shows last sync status and offers a quick "Sync now".
import browser from "../lib/browser.js";

const STATUS_KEY = "browsersync:status";
const $ = (id) => document.getElementById(id);

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function summarize(summary) {
  const parts = [];
  for (const [type, r] of Object.entries(summary ?? {})) {
    parts.push(`${type}: applied ${r.applied ?? 0}`);
  }
  return parts.join(" · ") || "nothing to do";
}

async function render() {
  const st = (await browser.storage.local.get(STATUS_KEY))[STATUS_KEY];
  const dot = $("dot");
  if (!st) {
    dot.className = "idle"; $("headline").textContent = "No sync yet";
    $("detail").textContent = "Click “Sync now”, or configure a transport in Settings.";
    return;
  }
  if (st.ok) {
    dot.className = "ok"; $("headline").textContent = `Synced ${ago(st.ts)}`;
    $("detail").textContent = summarize(st.summary);
  } else {
    dot.className = "err"; $("headline").textContent = `Failed ${ago(st.ts)}`;
    $("detail").textContent = st.error ?? "Unknown error";
  }
}

$("syncNow").addEventListener("click", async () => {
  $("headline").textContent = "Syncing…";
  $("detail").textContent = "";
  try {
    await browser.runtime.sendMessage({ type: "SYNC_NOW" });
  } catch {
    /* status is recorded by the background; render() will show it */
  }
  await render();
});

const openOptions = () => browser.runtime.openOptionsPage();
$("settings").addEventListener("click", openOptions);
$("openOptions").addEventListener("click", (e) => { e.preventDefault(); openOptions(); });

render();
