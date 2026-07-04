// WebDAV transport — talks directly to a WebDAV server (Nextcloud, a NAS, etc.)
// from the extension, with NO local host software. The sync state is a single
// JSON file at the configured URL.
//
// Concurrency: uses HTTP conditional requests — If-Match on update, and
// If-None-Match:* on first create — which WebDAV servers support via ETags, so
// the engine's existing retry-on-conflict path works unchanged.
import { ConcurrencyError } from "./adapter.js";

const EMPTY_STATE = { version: 1, records: {}, updatedAt: 0 };

function basicAuth(username, password) {
  if (!username && !password) return {};
  // btoa is available in extension contexts and modern Node.
  return { Authorization: `Basic ${btoa(`${username ?? ""}:${password ?? ""}`)}` };
}

/** Issue MKCOL for each ancestor collection of the file URL (idempotent). */
async function ensureParentCollections(url, headers) {
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean);
  segs.pop(); // drop the filename
  let path = "";
  for (const seg of segs) {
    path += `/${seg}`;
    const res = await fetch(`${u.origin}${path}/`, { method: "MKCOL", headers });
    // 201 created, 405 already exists — both fine; anything else is a real error.
    if (![201, 405, 301].includes(res.status) && !res.ok) {
      throw new Error(`WebDAV MKCOL ${path} failed: ${res.status}`);
    }
  }
}

/**
 * @param {{ url: string, username?: string, password?: string }} opts
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createWebdavAdapter({ url, username, password } = {}) {
  if (!url) throw new Error("WebDAV transport requires a url");
  const auth = basicAuth(username, password);

  return {
    async pull(opts = {}) {
      const headers = { ...auth };
      if (opts.etag) headers["If-None-Match"] = opts.etag;
      const res = await fetch(url, { headers });
      if (res.status === 304) return { notModified: true, etag: opts.etag };
      if (res.status === 404) return { state: structuredClone(EMPTY_STATE), etag: undefined };
      if (res.status === 401) throw new Error("WebDAV auth failed (401)");
      if (!res.ok) throw new Error(`WebDAV pull failed: ${res.status}`);
      const state = await res.json();
      return { state, etag: res.headers.get("etag") ?? undefined };
    },

    async push(state, etag) {
      const headers = { ...auth, "Content-Type": "application/json" };
      if (etag !== undefined) headers["If-Match"] = etag;
      else headers["If-None-Match"] = "*"; // create-only: fail if it already exists

      const body = JSON.stringify(state);
      let res = await fetch(url, { method: "PUT", headers, body });

      // Parent collection missing -> create it and retry once.
      if (res.status === 409) {
        await ensureParentCollections(url, auth);
        res = await fetch(url, { method: "PUT", headers, body });
      }
      if (res.status === 412) throw new ConcurrencyError("WebDAV etag conflict");
      if (!res.ok) throw new Error(`WebDAV push failed: ${res.status}`);
      return { etag: res.headers.get("etag") ?? undefined };
    },

    async health() {
      try {
        const res = await fetch(url, { method: "GET", headers: { ...auth } });
        return res.ok || res.status === 404; // reachable + authorized (file may not exist yet)
      } catch {
        return false;
      }
    },
  };
}
