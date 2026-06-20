// HTTP server for the BrowserSync local sync agent (and the basis for the
// remote self-hosted server). Built on Node builtins only.
//
// Routes (see docs/SYNC-PROTOCOL.md):
//   GET  /health -> { ok, version }
//   GET  /state  -> sync state JSON, with an ETag header
//   PUT  /state  -> store state; honors If-Match for optimistic concurrency
//
// Concurrency: the ETag is a hash of the on-disk bytes. A PUT whose If-Match
// doesn't match the current ETag is rejected with 412 so the client re-pulls,
// re-merges, and retries (the engine does this automatically).
//
// Auth: when a token is configured, every request must carry
// `Authorization: Bearer <token>`. Bind to 127.0.0.1 only.
import http from "node:http";
import crypto from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, basename, join } from "node:path";

export const AGENT_VERSION = "0.1.0";

const DEFAULT_STATE = { version: 1, records: {}, updatedAt: 0 };

function etagOf(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Read the sync file, returning its raw bytes, parsed state, and ETag. */
async function readState(syncFile) {
  let raw;
  try {
    raw = await readFile(syncFile, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    raw = JSON.stringify(DEFAULT_STATE);
  }
  return { raw, state: JSON.parse(raw), etag: etagOf(raw) };
}

/** Atomically write the sync file (temp file + rename). */
async function writeState(syncFile, state) {
  const raw = JSON.stringify(state);
  const tmp = join(dirname(syncFile), `.${basename(syncFile)}.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmp, raw, "utf8");
  await rename(tmp, syncFile);
  return etagOf(raw);
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(data);
}

async function readBody(req, limitBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Create (but do not start) the agent HTTP server.
 * @param {{ syncFile: string, token?: string }} config
 * @returns {import("node:http").Server}
 */
export function createAgentServer({ syncFile, token }) {
  return http.createServer(async (req, res) => {
    try {
      // Auth
      if (token) {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${token}`) {
          return sendJson(res, 401, { error: "unauthorized" });
        }
      }

      const url = new URL(req.url, "http://127.0.0.1");
      const route = `${req.method} ${url.pathname}`;

      if (route === "GET /health") {
        return sendJson(res, 200, { ok: true, version: AGENT_VERSION });
      }

      if (route === "GET /state") {
        const { state, etag } = await readState(syncFile);
        return sendJson(res, 200, state, { ETag: etag });
      }

      if (route === "PUT /state") {
        const { etag: current } = await readState(syncFile);
        const ifMatch = req.headers["if-match"];
        if (ifMatch !== undefined && ifMatch !== "*" && ifMatch !== current) {
          return sendJson(res, 412, { error: "etag mismatch", current });
        }
        let next;
        try {
          next = JSON.parse(await readBody(req));
        } catch {
          return sendJson(res, 400, { error: "invalid JSON body" });
        }
        const etag = await writeState(syncFile, next);
        return sendJson(res, 200, { ok: true, etag }, { ETag: etag });
      }

      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      return sendJson(res, 500, { error: String(err?.message ?? err) });
    }
  });
}
