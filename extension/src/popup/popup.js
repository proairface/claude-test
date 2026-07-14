// Toolbar popup: sync status + Tier-1 quick bookmark actions (bookmark/edit/
// remove the current page, and search-and-open).
import browser from "../lib/browser.js";
import { roleFolderIdsFromTree, resolveRoleFolderId } from "../model/roots.js";

const STATUS_KEY = "browsersync:status";
const $ = (id) => document.getElementById(id);
const SYNCABLE = /^(https?|ftp|file):/i;

// --- sync status ------------------------------------------------------------
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
function summarize(summary) {
  return Object.entries(summary ?? {}).map(([t, r]) => `${t}: applied ${r.applied ?? 0}`).join(" · ") || "nothing to do";
}
async function renderStatus() {
  const st = (await browser.storage.local.get(STATUS_KEY))[STATUS_KEY];
  const dot = $("dot");
  if (!st) { dot.className = "idle"; $("headline").textContent = "No sync yet"; $("detail").textContent = ""; return; }
  if (st.ok) { dot.className = "ok"; $("headline").textContent = `Synced ${ago(st.ts)}`; $("detail").textContent = summarize(st.summary); }
  else { dot.className = "err"; $("headline").textContent = `Failed ${ago(st.ts)}`; $("detail").textContent = st.error ?? "Unknown error"; }
}

// --- current-page bookmark actions -----------------------------------------
async function barFolderId() {
  const tree = await browser.bookmarks.getTree();
  return resolveRoleFolderId(roleFolderIdsFromTree(tree), "bar");
}
async function currentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function renderPage() {
  const body = $("pageBody");
  body.textContent = "";
  const tab = await currentTab();
  if (!tab?.url || !SYNCABLE.test(tab.url)) {
    body.append(Object.assign(document.createElement("span"), { className: "idle", textContent: "Not a bookmarkable page." }));
    return;
  }
  const existing = (await browser.bookmarks.search({ url: tab.url })).find((m) => m.url === tab.url);

  if (!existing) {
    const btn = Object.assign(document.createElement("button"), { textContent: "★ Bookmark this page" });
    btn.addEventListener("click", async () => {
      await browser.bookmarks.create({ parentId: await barFolderId(), url: tab.url, title: tab.title ?? tab.url });
      await renderPage();
    });
    body.append(btn);
    return;
  }

  // Bookmarked: editable title + Save/Remove.
  const title = Object.assign(document.createElement("input"), { type: "text", value: existing.title ?? "" });
  const save = Object.assign(document.createElement("button"), { textContent: "Save" });
  const remove = Object.assign(document.createElement("button"), { textContent: "Remove", title: "Remove bookmark" });
  save.addEventListener("click", async () => {
    await browser.bookmarks.update(existing.id, { title: title.value });
    save.textContent = "Saved";
    setTimeout(() => { save.textContent = "Save"; }, 1200);
  });
  remove.addEventListener("click", async () => {
    await browser.bookmarks.remove(existing.id);
    await renderPage();
  });
  const row = document.createElement("div");
  row.className = "row";
  row.append(title, save, remove);
  body.append(row);
}

// --- search -----------------------------------------------------------------
let searchTimer = null;
async function runSearch() {
  const q = $("bmSearch").value.trim();
  const box = $("results");
  box.textContent = "";
  if (!q) return;
  const hits = (await browser.bookmarks.search({ query: q })).filter((b) => b.url && SYNCABLE.test(b.url)).slice(0, 40);
  for (const b of hits) {
    const a = document.createElement("a");
    a.href = b.url;
    a.title = b.url;
    a.append(document.createTextNode(b.title || b.url));
    const u = Object.assign(document.createElement("div"), { className: "u", textContent: b.url });
    a.append(u);
    a.addEventListener("click", (e) => { e.preventDefault(); browser.tabs.create({ url: b.url }); window.close(); });
    box.append(a);
  }
}

// --- wiring -----------------------------------------------------------------
$("syncNow").addEventListener("click", async () => {
  $("headline").textContent = "Syncing…"; $("detail").textContent = "";
  try { await browser.runtime.sendMessage({ type: "SYNC_NOW" }); } catch { /* status recorded by bg */ }
  await renderStatus();
});
const openOptions = () => browser.runtime.openOptionsPage();
$("settings").addEventListener("click", openOptions);
$("bmSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); });
$("openManager").addEventListener("click", (e) => {
  e.preventDefault();
  browser.tabs.create({ url: browser.runtime.getURL("manager/manager.html") });
  window.close();
});

renderStatus();
renderPage();
