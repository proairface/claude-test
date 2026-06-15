// Cross-browser bookmark-root mapping.
//
// Each browser exposes a handful of special top-level bookmark folders, but
// with different ids and titles:
//
//   Chromium : id "1" = Bookmarks Bar, "2" = Other Bookmarks, "3" = Mobile
//   Firefox  : "toolbar_____" = Toolbar, "menu________" = Menu,
//              "unfiled_____" = Other, "mobile______" = Mobile
//
// To sync across browsers we collapse these to canonical ROLE strings, store
// the role in a bookmark's parentPath[0], and resolve the role back to the
// local browser's folder id when applying.

/** @typedef {"bar"|"menu"|"other"|"mobile"} Role */

const CHROMIUM_ID_TO_ROLE = { "1": "bar", "2": "other", "3": "mobile" };
const FIREFOX_ID_TO_ROLE = {
  toolbar_____: "bar",
  menu________: "menu",
  unfiled_____: "other",
  mobile______: "mobile",
};

/**
 * Map a top-level special-folder node id to a canonical role.
 * Firefox has no "menu" on Chromium, so menu items fall back to "other" when
 * applied on a browser that lacks a menu (handled in resolveRoleFolderId).
 * @param {string} rootChildId
 * @returns {Role|null}
 */
export function roleFromRootChildId(rootChildId) {
  return CHROMIUM_ID_TO_ROLE[rootChildId] ?? FIREFOX_ID_TO_ROLE[rootChildId] ?? null;
}

/**
 * Given the browser's bookmark tree, return a map of Role -> folder id for the
 * special folders that exist locally.
 * @param {Array} tree result of browser.bookmarks.getTree()
 * @returns {Record<Role, string>}
 */
export function roleFolderIdsFromTree(tree) {
  const root = tree[0];
  /** @type {Record<string,string>} */
  const map = {};
  for (const child of root.children ?? []) {
    const role = roleFromRootChildId(child.id);
    if (role) map[role] = child.id;
  }
  return map;
}

/**
 * Resolve a role to a concrete local folder id, with sensible fallbacks for
 * browsers that don't have every role (e.g. Chromium has no "menu").
 * @param {Record<string,string>} roleFolders
 * @param {Role} role
 * @returns {string|undefined}
 */
export function resolveRoleFolderId(roleFolders, role) {
  return roleFolders[role] ?? roleFolders.other ?? roleFolders.bar;
}
