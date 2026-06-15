// Applier: write bookmark Records into the browser via native APIs.
//
// Idempotent by construction: before creating anything it indexes what already
// exists in the target folder. Honors tombstones (deleted records) by removing
// the matching local bookmark. Folders along parentPath are created on demand.
import browser from "../lib/browser.js";
import { roleFolderIdsFromTree, resolveRoleFolderId } from "../model/roots.js";

/** Find or create a child folder with `title` under `parentId`. */
async function ensureChildFolder(parentId, title) {
  const children = await browser.bookmarks.getChildren(parentId);
  const existing = children.find((c) => !c.url && c.title === title);
  if (existing) return existing.id;
  const created = await browser.bookmarks.create({ parentId, title });
  return created.id;
}

/**
 * Resolve a canonical parentPath (["bar", "Dev", ...]) to a concrete local
 * folder id, creating intermediate folders as needed.
 */
async function ensureFolderPath(roleFolders, parentPath) {
  const [role, ...subFolders] = parentPath;
  let folderId = resolveRoleFolderId(roleFolders, role);
  if (!folderId) throw new Error(`No local bookmark root for role "${role}"`);
  for (const title of subFolders) {
    folderId = await ensureChildFolder(folderId, title);
  }
  return folderId;
}

/**
 * Apply a batch of bookmark records to the local browser.
 * @param {import("../model/records.js").Record[]} records
 */
export async function applyBookmarks(records) {
  if (!records.length) return;
  const tree = await browser.bookmarks.getTree();
  const roleFolders = roleFolderIdsFromTree(tree);

  for (const rec of records) {
    const { url, title, parentPath } = rec.payload;
    const folderId = await ensureFolderPath(roleFolders, parentPath);
    const siblings = await browser.bookmarks.getChildren(folderId);
    const match = siblings.find((c) => c.url === url);

    if (rec.deleted) {
      if (match) await browser.bookmarks.remove(match.id);
      continue;
    }
    if (!match) {
      await browser.bookmarks.create({ parentId: folderId, url, title });
    } else if (match.title !== title) {
      await browser.bookmarks.update(match.id, { title });
    }
  }
}
