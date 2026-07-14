// Full-page bookmark manager — Tier 2 scaffold.
//
// Today: a working read-only, filterable folder tree (open bookmarks in a new
// tab). This is the foundation to build editing on.
//
// TODO(Tier 2):
//   - inline rename (browser.bookmarks.update) and delete (browser.bookmarks.remove)
//   - move between folders + reorder (browser.bookmarks.move) with drag-and-drop
//   - create folders; multi-select + bulk actions
//   - a "changes sync automatically" hint (background listeners already do this)
import browser from "../lib/browser.js";

const $ = (id) => document.getElementById(id);

function bookmarkNode(node) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = node.url;
  a.textContent = node.title || node.url;
  a.addEventListener("click", (e) => { e.preventDefault(); browser.tabs.create({ url: node.url }); });
  li.append(a);
  const u = document.createElement("span");
  u.className = "u";
  try { u.textContent = new URL(node.url).hostname; } catch { u.textContent = ""; }
  li.append(u);
  return li;
}

function folderNode(node) {
  const li = document.createElement("li");
  li.className = "folder open";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = node.title || "(folder)";
  label.addEventListener("click", () => li.classList.toggle("open"));
  li.append(label);
  const ul = renderChildren(node.children ?? []);
  li.append(ul);
  return li;
}

function renderChildren(children) {
  const ul = document.createElement("ul");
  for (const child of children) {
    ul.append(child.url ? bookmarkNode(child) : folderNode(child));
  }
  return ul;
}

async function render(filter = "") {
  const tree = await browser.bookmarks.getTree();
  const root = tree[0];
  const box = $("tree");
  box.textContent = "";

  if (filter) {
    // Flat filtered list when searching.
    const hits = (await browser.bookmarks.search({ query: filter })).filter((b) => b.url).slice(0, 500);
    const ul = document.createElement("ul");
    for (const b of hits) ul.append(bookmarkNode(b));
    box.append(ul);
    return;
  }
  box.append(renderChildren(root.children ?? []));
}

let t = null;
$("search").addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(() => render($("search").value.trim()), 200);
});

render();
