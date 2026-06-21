import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentServer } from "../../agent/server.js";
import { createLocalAgentAdapter } from "../src/transport/localAgentAdapter.js";
import { ProtocolMismatchError } from "../src/model/version.js";

// A real agent reports a compatible protocol, so preflight passes.
test("preflight passes against a protocol-compatible agent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bsync-pf-"));
  const server = createAgentServer({ syncFile: join(dir, "s.json"), token: "t" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const a = createLocalAgentAdapter({ baseUrl, token: "t" });
    await a.preflight(); // resolves
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});

// A backend advertising a different protocol major is rejected clearly.
test("preflight throws ProtocolMismatchError on an incompatible backend", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: "9.9.9", protocol: 999 }));
    } else {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const a = createLocalAgentAdapter({ baseUrl });
    await assert.rejects(() => a.preflight(), ProtocolMismatchError);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// An unreachable agent fails fast with a clear message.
test("preflight reports an unreachable agent", async () => {
  const a = createLocalAgentAdapter({ baseUrl: "http://127.0.0.1:1" });
  await assert.rejects(() => a.preflight(), /not reachable/);
});
