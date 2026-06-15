// Collector: read local bookmarks -> normalized Records.
// TODO(M2): walk browser.bookmarks.getTree(), build parentPath arrays,
// emit one Record per bookmark with makeId("bookmark", {url,title,parentPath}).
import browser from "../lib/browser.js";

/** @returns {Promise<import("../model/records.js").Record[]>} */
export async function collectBookmarks() {
  throw new Error("collectBookmarks not implemented (M2)");
}
