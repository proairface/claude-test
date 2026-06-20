// End-to-end: two devices sync bookmarks through the REAL WebDAV adapter
// against a mock WebDAV server — the no-host-software path.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMockWebdav } from "../test-utils/webdavServer.js";
import { createWebdavAdapter } from "../src/transport/webdavAdapter.js";
import { makeDevice } from "../test-utils/device.js";

let server, origin;
const creds = { username: "u", password: "p" };

before(async () => {
  server = createMockWebdav(creds);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((r) => server.close(r)); });

const adapter = () => createWebdavAdapter({ url: `${origin}/bsync/state.json`, ...creds });

test("create + delete propagate between two devices over WebDAV", async () => {
  const A = makeDevice(adapter(), "A");
  const B = makeDevice(adapter(), "B");

  A.add("https://w.example", "W");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), ["https://w.example"]);
  assert.equal((await B.sync()).applied, 0); // idempotent

  A.del("https://w.example");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), []);
});

test("concurrent writes converge via the conflict-retry path", async () => {
  const A = makeDevice(adapter(), "A");
  const B = makeDevice(adapter(), "B");
  A.add("https://a3.example", "A3");
  B.add("https://b3.example", "B3");
  await A.sync();
  await B.sync();
  await A.sync();
  const expected = ["https://a3.example", "https://b3.example"];
  assert.deepEqual(A.urls(), expected);
  assert.deepEqual(B.urls(), expected);
});
