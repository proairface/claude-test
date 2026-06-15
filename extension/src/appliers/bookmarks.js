// Applier: write bookmark Records into the browser via native APIs.
// TODO(M2): ensure parentPath folders exist (create missing), then
// browser.bookmarks.create(); honor tombstones via browser.bookmarks.remove().
// Must be idempotent: skip if a node with the same natural key already exists.
import browser from "../lib/browser.js";

/** @param {import("../model/records.js").Record[]} records */
export async function applyBookmarks(records) {
  throw new Error("applyBookmarks not implemented (M2)");
}
