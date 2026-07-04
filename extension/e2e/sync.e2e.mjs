// End-to-end: the REAL built extension in REAL Chromium, syncing bookmarks
// through the REAL agent — exercising the collector/applier/engine/transport
// against actual Chrome APIs (what the unit tests mock). Run under xvfb via
// `npm run test:e2e`. Named *.e2e.mjs so `node --test` doesn't auto-run it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createAgentServer } from "../../agent/server.js";
import { makeId } from "../src/model/records.js";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "..");
const EXE = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";
const hasBrowser = existsSync(EXE);
const skip = hasBrowser ? false : `Chromium not found at ${EXE} (set PW_CHROMIUM)`;
const TOKEN = "e2e-token";
const REMOTE_URL = "https://from-remote.example/";
const LOCAL_URL = "https://from-browser.example/";

let server, baseUrl, syncFile, dir, extDir, userDataDir, context;

before(async () => {
  if (skip) return; // no browser available; test is skipped
  dir = await mkdtemp(join(tmpdir(), "bsync-e2e-"));
  syncFile = join(dir, "state.json");

  // Seed the shared file with a bookmark as if pushed by another device "Z".
  const id = await makeId("bookmark", { url: REMOTE_URL, parentPath: ["bar"] });
  const remote = {
    version: 1, updatedAt: Date.now(),
    records: {
      [id]: {
        id, type: "bookmark", deviceId: "Z", lamport: 1, updatedAt: Date.now(), deleted: false,
        payload: { url: REMOTE_URL, title: "Remote", parentPath: ["bar"], index: 0 },
      },
    },
  };
  await writeFile(syncFile, JSON.stringify(remote));

  server = createAgentServer({ syncFile, token: TOKEN });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Copy the built extension and grant localhost host access for the test
  // (production uses optional_host_permissions requested at runtime).
  extDir = join(dir, "ext");
  await cp(resolve(here, "..", "dist", "chrome"), extDir, { recursive: true });
  const mfPath = join(extDir, "manifest.json");
  const mf = JSON.parse(await readFile(mfPath, "utf8"));
  mf.host_permissions = ["http://127.0.0.1/*", "http://localhost/*"];
  await writeFile(mfPath, JSON.stringify(mf));

  userDataDir = await mkdtemp(join(tmpdir(), "bsync-udd-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: EXE,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, "--no-sandbox"],
  });
});

after(async () => {
  if (skip) return;
  await context?.close();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
  await rm(userDataDir, { recursive: true, force: true });
});

test("bookmarks sync both ways through the real extension + agent", { skip }, async () => {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/options/options.html`);

  // Configure the extension for the local agent (no auto-sync during the test).
  await page.evaluate(({ baseUrl, token }) => chrome.storage.local.set({
    "browsersync:config": {
      transport: "localAgent", baseUrl, token,
      enabled: { bookmarks: true, tabs: false, history: false },
      autoSync: false, syncOnChange: false,
    },
  }), { baseUrl, token: TOKEN });

  // Create a local bookmark to push.
  await page.evaluate((url) => chrome.bookmarks.create({ parentId: "1", url, title: "Local" }), LOCAL_URL);

  // Trigger a real sync cycle (options page -> service worker).
  const summary = await page.evaluate(() => chrome.runtime.sendMessage({ type: "SYNC_NOW" }));
  assert.ok(summary?.bookmark, "sync ran for bookmarks");
  assert.ok(summary.bookmark.applied >= 1, "the remote bookmark was applied locally");

  // PULL direction: the remote bookmark now exists in the browser.
  const foundRemote = await page.evaluate((url) => chrome.bookmarks.search({ url }), REMOTE_URL);
  assert.equal(foundRemote.length, 1, "remote bookmark applied into the browser");

  // PUSH direction: the local bookmark reached the agent's file.
  const state = JSON.parse(await readFile(syncFile, "utf8"));
  const urls = Object.values(state.records).map((r) => r.payload?.url);
  assert.ok(urls.includes(LOCAL_URL), "local bookmark pushed to the agent");
  assert.ok(urls.includes(REMOTE_URL), "remote bookmark preserved");
});
