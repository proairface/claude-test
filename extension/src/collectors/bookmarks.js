// Collector: read local bookmarks -> normalized bookmark items.
//
// Returns "items" ({ id, payload }) rather than full Records; the sync engine
// stamps deviceId/lamport. Only URL bookmarks are emitted — folders are
// recreated implicitly from each item's parentPath when applying (empty folders
// are intentionally not synced in the MVP).
import browser from "../lib/browser.js";
import { makeId } from "../model/records.js";
import { roleFromRootChildId } from "../model/roots.js";

/**
 * @typedef {Object} BookmarkItem
 * @property {string} id
 * @property {{url:string,title:string,parentPath:string[],index:number}} payload
 */

/**
 * Natural key for a bookmark = its url + the canonical folder path it lives in.
 * Title is treated as mutable (a title change is an update, not a new item).
 */
function naturalKey(url, parentPath) {
  return { url, parentPath };
}

/**
 * @param {(url:string)=>boolean} [filter] keep-predicate; excluded urls are skipped
 * @returns {Promise<BookmarkItem[]>}
 */
export async function collectBookmarks(filter = () => true) {
  const tree = await browser.bookmarks.getTree();
  const items = [];

  // Depth-first walk. `pathFromRole` is the canonical path below a root role,
  // e.g. ["bar", "Dev", "Rust"]. The role is resolved at the top level.
  async function walk(node, role, subPath) {
    if (node.url) {
      if (!role) return; // skip anything not under a known root (shouldn't happen)
      if (!filter(node.url)) return; // excluded by user filters
      const parentPath = [role, ...subPath];
      const payload = {
        url: node.url,
        title: node.title ?? "",
        parentPath,
        index: node.index ?? 0,
      };
      items.push({ id: await makeId("bookmark", naturalKey(node.url, parentPath)), payload });
      return;
    }
    for (const child of node.children ?? []) {
      if (role === undefined) {
        // `node` is the tree root; each child is a special folder -> a role.
        await walk(child, roleFromRootChildId(child.id) ?? null, []);
      } else if (child.url) {
        await walk(child, role, subPath);
      } else {
        // descend into a sub-folder, extending the path with its title
        await walk(child, role, [...subPath, child.title ?? ""]);
      }
    }
  }

  await walk(tree[0], undefined, []);
  return items.filter((i) => i.payload.parentPath[0]); // drop unrooted
}
