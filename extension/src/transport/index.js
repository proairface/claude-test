// Transport factory: build the active transport adapter from saved config.
// Keeping this in one place lets the background worker stay transport-agnostic
// and makes it trivial to add new transports.
import { createLocalAgentAdapter } from "./localAgentAdapter.js";
import { createRemoteServerAdapter } from "./remoteServerAdapter.js";
import { createWebdavAdapter } from "./webdavAdapter.js";
import { createBrowserStorageAdapter } from "./browserStorageAdapter.js";
import { createEncryptedAdapter } from "./encryptedAdapter.js";
import { assertEncryptionUnlocked } from "./encGuard.js";

export { EncryptionLockedError } from "./encGuard.js";

/**
 * @param {object} cfg saved options (see options page)
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createTransport(cfg = {}) {
  const base = createBaseTransport(cfg);
  if (cfg.encryption?.enabled) {
    assertEncryptionUnlocked(cfg); // fail closed — never sync plaintext when locked
    return createEncryptedAdapter(base, cfg.encryption.passphrase);
  }
  return base;
}

function createBaseTransport(cfg = {}) {
  switch (cfg.transport) {
    case "webdav":
      return createWebdavAdapter({
        url: cfg.webdavUrl,
        username: cfg.webdavUser,
        password: cfg.webdavPass,
      });
    case "remoteServer":
      return createRemoteServerAdapter({ baseUrl: cfg.baseUrl, token: cfg.token });
    case "browserStorage":
      return createBrowserStorageAdapter();
    case "localAgent":
    default:
      return createLocalAgentAdapter({
        baseUrl: cfg.baseUrl ?? "http://127.0.0.1:8787",
        token: cfg.token,
      });
  }
}

/**
 * The origin(s) a given config needs host permission for, so the options page
 * can request them on demand (keeps the extension free of broad install-time
 * host access — friendlier for store review).
 * @returns {string[]} match patterns, e.g. ["https://dav.example.com/*"]
 */
export function originsForConfig(cfg = {}) {
  const urls = [];
  if (cfg.transport === "webdav" && cfg.webdavUrl) urls.push(cfg.webdavUrl);
  if ((cfg.transport === "localAgent" || cfg.transport === "remoteServer") && cfg.baseUrl)
    urls.push(cfg.baseUrl);
  const patterns = [];
  for (const u of urls) {
    try {
      const { protocol, host } = new URL(u);
      patterns.push(`${protocol}//${host}/*`);
    } catch {
      /* ignore malformed URLs */
    }
  }
  return patterns;
}
