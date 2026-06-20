# Try it locally

A hands-on walkthrough to see BrowserSync syncing bookmarks between two
browsers. Everything here uses the MVP that's implemented today (M1–M3:
bookmarks sync via the local agent).

Plan on ~10–15 minutes the first time.

## What you'll need

- **Node.js 18+** (the agent and the build both use it). Check with `node -v`.
- Two browsers to test across — any mix of Firefox and a Chromium browser
  (Chrome, Brave, Vivaldi, Edge).
- A local clone of this repo.

```bash
git clone <your-repo-url> browsersync
cd browsersync
```

---

## Step 1 — Build the extension

```bash
cd extension
npm install
npm test          # optional: 22 tests should pass
npm run build     # produces dist/chrome/ and dist/firefox/
```

You now have two loadable, unpacked extensions:

- `extension/dist/chrome/`   → for Chrome / Brave / Vivaldi / Edge
- `extension/dist/firefox/`  → for Firefox

---

## Step 2 — Start the local agent

The agent is the little server that holds the shared sync file. From a second
terminal:

```bash
cd browsersync/agent
TOKEN=mysecret SYNC_FILE=./state.json node index.js
```

You should see:

```
[browsersync-agent] v0.1.0 listening on http://127.0.0.1:8787
[browsersync-agent] sync file: /.../agent/state.json
```

Leave it running. Notes:

- `TOKEN` is a shared secret — you'll type the same value into each browser.
- `SYNC_FILE` can be **any path**. To sync across *machines*, point it at a
  cloud-synced folder, e.g.
  `SYNC_FILE="$HOME/OneDrive/browsersync/state.json"` (or a Drive/Dropbox/NFS/
  SMB path). Each machine runs its own agent against its own copy of that
  folder; the cloud client replicates the file.
- `PORT` defaults to `8787`; override with `PORT=9000` if needed.

---

## Step 3 — Load the extension

### Chrome / Brave / Vivaldi
1. Open `chrome://extensions` (or `brave://extensions`, `vivaldi://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select `extension/dist/chrome/`.

> Loading the *folder* via "Load unpacked" is required — Chromium blocks
> drag-and-drop install of unsigned extensions.

### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `extension/dist/firefox/manifest.json`.

> "Temporary" add-ons are removed on Firefox restart — that's the normal way to
> run an unsigned extension during development.

---

## Step 4 — Point each browser at the agent

In **each** browser:

1. Open the extension's **Options** page
   (extensions list → BrowserSync → Details/Preferences → Options), or it opens
   in a tab automatically on some browsers.
2. Set:
   - **Transport**: Local agent
   - **Agent URL**: `http://127.0.0.1:8787`
   - **Token**: `mysecret` (must match the agent)
3. Make sure **Bookmarks** is checked.

The settings save automatically as you change them.

---

## Step 5 — Watch a bookmark sync

1. In **Browser A**, add a bookmark (e.g. bookmark this page) into the
   Bookmarks Bar.
2. In **Browser A**'s Options, click **Sync now**. You should see
   `Synced: applied 0, N total records.` (it pushed your bookmark up).
3. In **Browser B**, click **Sync now**. You should see
   `Synced: applied 1, …` and the bookmark appears in B's Bookmarks Bar.
4. Try the reverse: add/delete in B, Sync B, Sync A. Deletes propagate too.

Syncs also run automatically on a ~15-minute alarm, but **Sync now** is the
fast way to see it work.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Sync failed: agent pull failed: 401` | Token mismatch — the Options token must equal the agent's `TOKEN`. |
| `Sync failed` / network error | Agent isn't running, or the Agent URL/port is wrong. Confirm the agent terminal shows it listening, and the URL matches `PORT`. |
| Bookmark doesn't appear in B | Did you click **Sync now** in *both* browsers (A pushes, B pulls)? Check the agent's `state.json` has grown. |
| Bookmark lands in a different folder | Cross-browser top-level folders are mapped by role (bar/menu/other). Chromium has no "menu", so Firefox "menu" items land in "other". This is expected for the MVP. |
| Firefox add-on vanished | It was a *temporary* add-on; reload it via `about:debugging` after restart. |

---

## What's NOT here yet

- **Open tabs** (M4) and **history** (M5) are not wired into sync yet — only
  bookmarks. See `docs/PLAN.md` for status.
- Chromium history, when added, will be sync-dated (not back-dated); Firefox
  will carry real past timestamps. See the M6 note for the optional approach to
  back-dating Chromium history.
