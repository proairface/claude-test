#!/usr/bin/env node
// BrowserSync local sync agent — entry point.
//
// Starts the HTTP server (see server.js) bound to 127.0.0.1, serving the shared
// sync state from SYNC_FILE. Point SYNC_FILE at any mount (local/NFS/SMB) or a
// cloud-synced folder (Drive/OneDrive/Dropbox) to sync across machines.
//
//   PORT       localhost port            (default 8787)
//   SYNC_FILE  path to the sync file     (default ./state.json)
//   TOKEN      shared secret             (required in practice; warns if unset)
import process from "node:process";
import { resolve } from "node:path";
import { createAgentServer, AGENT_VERSION } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const syncFile = resolve(process.env.SYNC_FILE ?? "./state.json");
const token = process.env.TOKEN;

if (!token) {
  console.warn("[browsersync-agent] WARNING: TOKEN is unset — the agent is unauthenticated.");
}

const server = createAgentServer({ syncFile, token });

server.listen(port, "127.0.0.1", () => {
  console.log(`[browsersync-agent] v${AGENT_VERSION} listening on http://127.0.0.1:${port}`);
  console.log(`[browsersync-agent] sync file: ${syncFile}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
