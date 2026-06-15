#!/usr/bin/env node
// BrowserSync local sync agent — SCAFFOLD (milestone M3).
//
// Planned behavior:
//   - Bind an HTTP server to 127.0.0.1:${PORT}.
//   - GET  /health -> { ok: true, version }
//   - GET  /state  -> read SYNC_FILE, return JSON + ETag (hash of contents).
//   - PUT  /state  -> validate If-Match against current ETag; on match,
//                     atomically write SYNC_FILE (write temp + rename); else 412.
//   - Require header `Authorization: Bearer ${TOKEN}` on every request.
//   - SYNC_FILE may live on any mount (local/NFS/SMB) or a cloud-synced folder.
//
// Implemented in M3. Today it only prints its intended config so the scaffold
// is runnable and self-documenting.

import process from "node:process";

const config = {
  port: process.env.PORT ?? "8787",
  syncFile: process.env.SYNC_FILE ?? "./state.json",
  hasToken: Boolean(process.env.TOKEN),
};

console.log("[browsersync-agent] scaffold — not yet serving requests (M3).");
console.log("[browsersync-agent] planned config:", config);
if (!config.hasToken) {
  console.warn("[browsersync-agent] WARNING: TOKEN not set; required in M3.");
}

// TODO(M3): create the http.Server, wire the routes above with atomic writes
// and ETag concurrency, and add graceful shutdown.
