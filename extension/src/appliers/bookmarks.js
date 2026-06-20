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

/**
 * Apply a batch of bookmark records.
 * @param {import("../model/records.js").Record[]} records
 * @param {{add?:boolean, update?:boolean, remove?:boolean}} [perms]
 */
export async function applyBookmarks(records, perms = {}) {
  if (!records.length) return;
  const tree = await browser.bookmarks.getTree();
  const roleFolders = roleFolderIdsFromTree(tree);

  for (const rec of records) {
    const { url, title, parentPath } = rec.payload;
    const folderId = await ensureFolderPath(roleFolders, parentPath);
    const siblings = await browser.bookmarks.getChildren(folderId);
    const match = siblings.find((c) => c.url === url);

    switch (plannedAction(rec, match, perms)) {
      case "remove":
        await browser.bookmarks.remove(match.id);
        break;
      case "create":
        await browser.bookmarks.create({ parentId: folderId, url, title });
        break;
      case "update":
        await browser.bookmarks.update(match.id, { title });
        break;
      default: // skip / noop
        break;
    }
  }
}
