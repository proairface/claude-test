// Options page logic. TODO(M3): load/save config in browser.storage.local,
// validate the transport connection via adapter.health(), and POST a
// { type: "SYNC_NOW" } runtime message on demand.
import browser from "../lib/browser.js";

document.getElementById("syncNow")?.addEventListener("click", () => {
  // TODO(M3): browser.runtime.sendMessage({ type: "SYNC_NOW" });
  console.log("[BrowserSync] sync-now clicked (scaffold).");
});
