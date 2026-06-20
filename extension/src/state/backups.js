// Local bookmark backups: snapshot before destructive syncs so a bad delete is
// recoverable. Stored in storage.local (needs the "unlimitedStorage" permission
// for large collections). Restore is additive — it re-adds missing bookmarks,
// it never deletes.
import browser from "../lib/browser.js";
import { collectBookmarks } from "../collectors/bookmarks.js";
import { applyBookmarks } from "../appliers/bookmarks.js";
import { trimBackups } from "./backupUtil.js";

const BACKUPS_KEY = "browsersync:backups";

export async function listBackups() {
  const list = (await browser.storage.local.get(BACKUPS_KEY))[BACKUPS_KEY] ?? [];
  return trimBackups(list).map(({ ts, count }) => ({ ts, count })); // metadata only
}

/** Snapshot the current bookmarks into a new backup entry. */
export async function backupBookmarks() {
  const items = await collectBookmarks();
  const list = (await browser.storage.local.get(BACKUPS_KEY))[BACKUPS_KEY] ?? [];
  list.push({ ts: Date.now(), count: items.length, items });
  await browser.storage.local.set({ [BACKUPS_KEY]: trimBackups(list) });
  return { ts: list[list.length - 1].ts, count: items.length };
}

/**
 * Restore a backup additively: re-add any bookmarks from the snapshot that are
 * missing locally. Never removes or overwrites.
 * @param {number} ts backup timestamp id
 * @returns {Promise<number>} number of records re-added (attempted)
 */
export async function restoreBackup(ts) {
  const list = (await browser.storage.local.get(BACKUPS_KEY))[BACKUPS_KEY] ?? [];
  const backup = list.find((b) => b.ts === ts);
  if (!backup) throw new Error("Backup not found");
  const records = backup.items.map((it) => ({ ...it, deleted: false, type: "bookmark" }));
  await applyBookmarks(records, { add: true, update: false, remove: false });
  return records.length;
}
