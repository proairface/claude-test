// Full-page bookmark manager — Tier 2.
//
// A filterable folder tree with inline editing: rename, delete, new folder,
// new bookmark, and drag-and-drop move/reorder. All edits go through the native
// bookmarks API, so they propagate to your other devices automatically via the
// background's change listeners.
import browser from "../lib/browser.js";

const $ = (id) => document.getElementById(id);
const collapsed = new Set();     // folder ids the user collapsed (default: open)
let rootChildIds = new Set();    // top-level special folders (bar/other/menu…)

function iconBtn(glyph, title, onClick) {
  const b = document.createElement("button");
  b.className = "act";
  b.type = "button";
  b.textContent = glyph;
  b.title = title;
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

async function refresh() { await render($("search").value.trim()); }

// Begin an inline rename on `labelEl` for node `id`, seeded with `current`.
function startRename(labelEl, id, current) {
  const input = document.createElement("input");
  input.className = "rename";
  input.value = current ?? "";
  const commit = async (save) => {
    if (save && input.value !== current) {
      try { await browser.bookmarks.update(id, { title: input.value }); } catch { /* ignore */ }
    }
    await refresh();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit(true);
    else if (e.key === "Escape") commit(false);
  });
  input.addEventListener("blur", () => commit(true));
  labelEl.replaceWith(input);
  input.focus();
  input.select();
}

async function del(node) {
  const isFolder = !node.url;
  const label = isFolder ? `folder “${node.title}” and everything in it` : `“${node.title || node.url}”`;
  if (!confirm(`Delete ${label}?`)) return;
  try {
    if (isFolder) await browser.bookmarks.removeTree(node.id);
    else await browser.bookmarks.remove(node.id);
  } catch { /* ignore */ }
  await refresh();
}

async function newFolder(parentId) {
  const title = prompt("New folder name:")?.trim();
  if (!title) return;
  await browser.bookmarks.create({ parentId, title });
  await refresh();
}
async function newBookmark(parentId) {
  const url = prompt("Bookmark URL:")?.trim();
  if (!url) return;
  const title = prompt("Title (optional):", "")?.trim() || url;
  try { await browser.bookmarks.create({ parentId, url, title }); } catch { alert("Couldn't add that URL."); }
  await refresh();
}

// --- drag & drop ------------------------------------------------------------
function makeDraggable(li, node, draggable) {
  if (!draggable) return;
  li.draggable = true;
  li.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.effectAllowed = "move";
  });
}
// Place `id` immediately before `beforeId` in `parentId` (or at the end when
// beforeId is null). Engine-agnostic: Chrome and Firefox disagree on the index
// for a same-parent FORWARD move, so we never do one — we append to the
// destination first (deterministic on both), then, if needed, do a BACKWARD
// move to the slot before `beforeId` (also consistent on both). Re-reading the
// children between steps keeps the target index correct.
async function placeBefore(id, parentId, beforeId) {
  if (id === beforeId) return;
  await browser.bookmarks.move(id, { parentId }); // append to destination
  if (beforeId) {
    const kids = await browser.bookmarks.getChildren(parentId);
    const idx = kids.findIndex((k) => k.id === beforeId);
    if (idx >= 0) await browser.bookmarks.move(id, { parentId, index: idx });
  }
}

function makeDropTarget(el, descriptorFn) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain");
    const d = descriptorFn();
    if (!id || !d) return;
    // move() throws if you drop a folder into itself/a descendant — ignore.
    try { await placeBefore(id, d.parentId, d.beforeId ?? null); } catch { /* invalid move */ }
    await refresh();
  });
}

// --- rendering --------------------------------------------------------------
function actionRow(node, { editable, isFolder }) {
  const span = document.createElement("span");
  span.className = "acts";
  if (editable) {
    span.append(iconBtn("✎", "Rename", () => {
      const label = span.parentElement.querySelector(".label, a");
      startRename(label, node.id, node.title);
    }));
    span.append(iconBtn("🗑", "Delete", () => del(node)));
  }
  if (isFolder) {
    span.append(iconBtn("📁+", "New folder", () => newFolder(node.id)));
    span.append(iconBtn("🔖+", "New bookmark", () => newBookmark(node.id)));
  }
  return span;
}

function bookmarkNode(node) {
  const li = document.createElement("li");
  li.className = "bm";
  const a = document.createElement("a");
  a.href = node.url;
  a.className = "label";
  a.textContent = node.title || node.url;
  a.addEventListener("click", (e) => { e.preventDefault(); browser.tabs.create({ url: node.url }); });
  li.append(a);
  const host = document.createElement("span");
  host.className = "u";
  try { host.textContent = new URL(node.url).hostname; } catch { host.textContent = ""; }
  li.append(host);
  li.append(actionRow(node, { editable: true, isFolder: false }));
  makeDraggable(li, node, true);
  // Drop onto a bookmark => move as its sibling, just before it.
  makeDropTarget(li, () => ({ parentId: node.parentId, beforeId: node.id }));
  return li;
}

function folderNode(node, topLevel) {
  const li = document.createElement("li");
  const isOpen = !collapsed.has(node.id);
  li.className = `folder${isOpen ? " open" : ""}`;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = node.title || "(folder)";
  label.addEventListener("click", () => {
    if (collapsed.has(node.id)) collapsed.delete(node.id); else collapsed.add(node.id);
    li.classList.toggle("open");
  });
  li.append(label);
  li.append(actionRow(node, { editable: !topLevel, isFolder: true }));
  li.append(renderChildren(node.children ?? [], false));
  makeDraggable(li, node, !topLevel);
  // Drop onto the folder's label => move INTO this folder (append at end).
  makeDropTarget(label, () => ({ parentId: node.id, beforeId: null }));
  // Drop onto the folder row => reorder before this folder (not for protected
  // top-level folders, whose parent is the root).
  if (!topLevel) makeDropTarget(li, () => ({ parentId: node.parentId, beforeId: node.id }));
  return li;
}

function renderChildren(children, topLevel) {
  const ul = document.createElement("ul");
  for (const child of children) {
    ul.append(child.url ? bookmarkNode(child) : folderNode(child, topLevel));
  }
  return ul;
}

async function render(filter = "") {
  const tree = await browser.bookmarks.getTree();
  const root = tree[0];
  rootChildIds = new Set((root.children ?? []).map((c) => c.id));
  const box = $("tree");
  box.textContent = "";

  if (filter) {
    const hits = (await browser.bookmarks.search({ query: filter })).filter((b) => b.url).slice(0, 500);
    const ul = document.createElement("ul");
    for (const b of hits) ul.append(bookmarkNode(b));
    box.append(ul);
    return;
  }
  box.append(renderChildren(root.children ?? [], true));
}

let t = null;
$("search").addEventListener("input", () => { clearTimeout(t); t = setTimeout(refresh, 200); });

render();
