// Applier: write bookmark Records into the browser via native APIs.
//
// Idempotent by construction, and gated by per-operation permissions so a
// cautious user can, e.g., let sync add/update bookmarks but never remove them.
import browser from "../lib/browser.js";
import { roleFolderIdsFromTree, resolveRoleFolderId } from "../model/roots.js";
import { plannedAction } from "../model/bookmarkPlan.js";

async function ensureChildFolder(parentId, title) {
  const children = await browser.bookmarks.getChildren(parentId);
  const existing = children.find((c) => !c.url && c.title === title);
  if (existing) return existing.id;
  const created = await browser.bookmarks.create({ parentId, title });
  return created.id;
}

async function ensureFolderPath(roleFolders, parentPath) {
  const [role, ...subFolders] = parentPath;
  let folderId = resolveRoleFolderId(roleFolders, role);
  if (!folderId) throw new Error(`No local bookmark root for role "${role}"`);
  for (const title of subFolders) folderId = await ensureChildFolder(folderId, title);
  return folderId;
}

// Move an existing node to `index` within its folder. Engine-agnostic: append
// then a backward move (Chrome/Firefox disagree only on same-parent FORWARD
// moves, which this avoids).
async function positionAt(id, parentId, index) {
  if (typeof index !== "number") return;
  const kids = await browser.bookmarks.getChildren(parentId);
  if (kids.findIndex((k) => k.id === id) === index) return; // already there
  await browser.bookmarks.move(id, { parentId }); // append to end
  const after = await browser.bookmarks.getChildren(parentId);
  const target = Math.min(Math.max(0, index), after.length - 1);
  if (target !== after.length - 1) await browser.bookmarks.move(id, { parentId, index: target });
}

/**
 * Apply a batch of bookmark records, preserving each bookmark's position within
 * its folder so ordering is consistent across devices.
 * @param {import("../model/records.js").Record[]} records
 * @param {{add?:boolean, update?:boolean, remove?:boolean}} [perms]
 */
export async function applyBookmarks(records, perms = {}) {
  if (!records.length) return;
  const tree = await browser.bookmarks.getTree();
  const roleFolders = roleFolderIdsFromTree(tree);

  // Apply per folder in ascending index order so inserts build up in order.
  const ordered = [...records].sort((a, b) => {
    const pa = (a.payload.parentPath ?? []).join("/");
    const pb = (b.payload.parentPath ?? []).join("/");
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.payload.index ?? 0) - (b.payload.index ?? 0);
  });

  for (const rec of ordered) {
    const { url, title, parentPath, index } = rec.payload;
    const folderId = await ensureFolderPath(roleFolders, parentPath);
    const siblings = await browser.bookmarks.getChildren(folderId);
    const match = siblings.find((c) => c.url === url);

    switch (plannedAction(rec, match, perms)) {
      case "remove":
        await browser.bookmarks.remove(match.id);
        break;
      case "create":
        // create()'s index is unambiguous (a fresh insert), consistent on both engines.
        await browser.bookmarks.create({
          parentId: folderId, url, title,
          ...(typeof index === "number" ? { index } : {}),
        });
        break;
      case "update":
        if (match.title !== (title ?? "")) await browser.bookmarks.update(match.id, { title });
        await positionAt(match.id, folderId, index);
        break;
      default: // skip / noop
        break;
    }
  }
}
