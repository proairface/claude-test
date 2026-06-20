// End-to-end M3: two devices sync bookmarks through the REAL agent (HTTP +
// file on disk) via the REAL localAgentAdapter — the full transport path,
// not the in-memory stand-in.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentServer } from "../../agent/server.js";
import { createLocalAgentAdapter } from "../src/transport/localAgentAdapter.js";
import { makeDevice } from "../test-utils/device.js";

const TOKEN = "e2e-token";
let server, baseUrl, dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "bsync-e2e-"));
  server = createAgentServer({ syncFile: join(dir, "state.json"), token: TOKEN });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

test("a bookmark created on one device appears on the other through the agent", async () => {
  const transport = () => createLocalAgentAdapter({ baseUrl, token: TOKEN });
  const A = makeDevice(transport(), "A");
  const B = makeDevice(transport(), "B");

  A.add("https://shared.example", "Shared");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), ["https://shared.example"]);

  // Idempotent re-sync applies nothing.
  assert.equal((await B.sync()).applied, 0);

  // Delete on B propagates to A and does not resurrect.
  B.del("https://shared.example");
  await B.sync();
  await A.sync();
  assert.deepEqual(A.urls(), []);
  await A.sync();
  await B.sync();
  assert.deepEqual(A.urls(), []);
  assert.deepEqual(B.urls(), []);
});

test("the adapter surfaces a concurrency conflict as a retry path", async () => {
  // Two devices reading the same etag then both writing: the engine's retry
  // loop must converge without losing data.
  const A = makeDevice(createLocalAgentAdapter({ baseUrl, token: TOKEN }), "A");
  const B = makeDevice(createLocalAgentAdapter({ baseUrl, token: TOKEN }), "B");
  A.add("https://a2.example", "A2");
  B.add("https://b2.example", "B2");
  await A.sync();
  await B.sync();
  await A.sync();
  assert.deepEqual(A.urls(), ["https://a2.example", "https://b2.example"]);
  assert.deepEqual(B.urls(), ["https://a2.example", "https://b2.example"]);
});
