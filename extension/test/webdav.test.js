import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMockWebdav } from "../test-utils/webdavServer.js";
import { createWebdavAdapter } from "../src/transport/webdavAdapter.js";
import { ConcurrencyError } from "../src/transport/adapter.js";

let server, origin;
const creds = { username: "u", password: "p" };

before(async () => {
  server = createMockWebdav(creds);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((r) => server.close(r)); });

test("pull returns empty state when the file is absent", async () => {
  const a = createWebdavAdapter({ url: `${origin}/state.json`, ...creds });
  const { state, etag } = await a.pull();
  assert.deepEqual(state.records, {});
  assert.equal(etag, undefined);
});

test("push creates the file, then pull reads it back with an etag", async () => {
  const a = createWebdavAdapter({ url: `${origin}/rt.json`, ...creds });
  await a.push({ version: 1, records: { x: { id: "x" } }, updatedAt: 1 }, undefined);
  const { state, etag } = await a.pull();
  assert.deepEqual(state.records, { x: { id: "x" } });
  assert.ok(etag);
});

test("create-only push (no etag) conflicts if the file already exists", async () => {
  const url = `${origin}/once.json`;
  const a = createWebdavAdapter({ url, ...creds });
  await a.push({ version: 1, records: {}, updatedAt: 0 }, undefined); // creates
  await assert.rejects(
    () => a.push({ version: 1, records: {}, updatedAt: 0 }, undefined), // create again
    ConcurrencyError,
  );
});

test("stale If-Match push is rejected as a conflict", async () => {
  const url = `${origin}/cas.json`;
  const a = createWebdavAdapter({ url, ...creds });
  await a.push({ version: 1, records: {}, updatedAt: 0 }, undefined);
  await assert.rejects(
    () => a.push({ version: 1, records: {}, updatedAt: 9 }, '"999"'), // wrong etag
    ConcurrencyError,
  );
});

test("push auto-creates missing parent collections (MKCOL)", async () => {
  const a = createWebdavAdapter({ url: `${origin}/sub/dir/state.json`, ...creds });
  await a.push({ version: 1, records: { y: { id: "y" } }, updatedAt: 1 }, undefined);
  const { state } = await a.pull();
  assert.deepEqual(state.records, { y: { id: "y" } });
});

test("bad credentials surface as an error", async () => {
  const a = createWebdavAdapter({ url: `${origin}/state.json`, username: "u", password: "WRONG" });
  await assert.rejects(() => a.pull());
});
