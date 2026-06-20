import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentServer } from "../../agent/server.js";

const TOKEN = "secret-token";
let server, baseUrl, dir, syncFile;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "bsync-agent-"));
  syncFile = join(dir, "state.json");
  server = createAgentServer({ syncFile, token: TOKEN });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const auth = { Authorization: `Bearer ${TOKEN}` };

test("rejects requests without the token", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 401);
});

test("health returns ok with the token", async () => {
  const res = await fetch(`${baseUrl}/health`, { headers: auth });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("GET /state returns default empty state with an ETag", async () => {
  const res = await fetch(`${baseUrl}/state`, { headers: auth });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("etag"));
  assert.deepEqual((await res.json()).records, {});
});

test("PUT then GET round-trips state, and ETag changes", async () => {
  const get1 = await fetch(`${baseUrl}/state`, { headers: auth });
  const etag1 = get1.headers.get("etag");

  const put = await fetch(`${baseUrl}/state`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json", "If-Match": etag1 },
    body: JSON.stringify({ version: 1, records: { a: { id: "a" } }, updatedAt: 1 }),
  });
  assert.equal(put.status, 200);
  const etag2 = (await put.json()).etag;
  assert.notEqual(etag1, etag2);

  const get2 = await fetch(`${baseUrl}/state`, { headers: auth });
  assert.deepEqual((await get2.json()).records, { a: { id: "a" } });
});

test("stale If-Match is rejected with 412", async () => {
  const staleEtag = "0000000000000000";
  const res = await fetch(`${baseUrl}/state`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json", "If-Match": staleEtag },
    body: JSON.stringify({ version: 1, records: {}, updatedAt: 2 }),
  });
  assert.equal(res.status, 412);
});
