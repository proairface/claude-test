// Pure decision for what the bookmark applier should do with one record, given
// the matching local node (if any) and the user's permissions. Kept browser-free
// so it can be unit-tested.

/**
 * @param {{deleted?:boolean, payload:{title?:string}}} rec
 * @param {{title?:string}|undefined} match  existing local bookmark with same url
 * @param {{add?:boolean, update?:boolean, remove?:boolean}} perms
 * @returns {"remove"|"create"|"update"|"skip"|"noop"}
 */
export function plannedAction(rec, match, perms = {}) {
  if (rec.deleted) return match ? (perms.remove !== false ? "remove" : "skip") : "noop";
  if (!match) return perms.add !== false ? "create" : "skip";
  if (match.title !== (rec.payload?.title ?? "")) return perms.update !== false ? "update" : "skip";
  return "noop";
}
