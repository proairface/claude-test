# Implementation plan

Milestones are ordered so each one is independently testable and the project is
useful as early as possible. Effort is rough engineering time for a careful
implementation with tests, **not** wall-clock.

## M0 — Scaffold + design ✅ (this commit)
Repo structure, module interfaces, manifests, docs. No logic.

## M1 — Build & dev harness ✅ (done)
- `npm run build` (esbuild) emits `dist/chrome/` and `dist/firefox/` with the
  right manifest each; `npm run run:firefox` launches via `web-ext`.
- `webextension-polyfill` wired through `src/lib/browser.js`.
- **Done:** both targets build and the background worker bundles cleanly.

## M2 — Bookmarks two-way sync ✅ (done)
- `collectors/bookmarks.js`, `appliers/bookmarks.js` (cross-browser root-role
  mapping in `model/roots.js`), content-hash ids in `model/records.js`.
- CRDT merge (`sync/merge.js`) + engine (`sync/engine.js`) with Lamport clocks,
  baseline-based change/delete detection, and ETag retry.
- In-memory transport (`transport/memoryAdapter.js`) + 15 unit tests
  (`npm test`) covering create/idempotency/delete/no-resurrection/convergence.
- **Done when (manual):** add a bookmark in Firefox, run sync, it appears in
  Brave under the same folder; deletes propagate; re-sync is a no-op. The
  automated tests prove the engine/merge half; manual cross-browser verification
  needs the M3 agent (or the memory adapter wired temporarily).

## M3 — Local sync agent + file transport ✅ (done)
- `agent/` daemon (`server.js` + `index.js`, Node builtins only): HTTP on
  `127.0.0.1`, `GET/PUT /state` reading/writing a configurable `SYNC_FILE` with
  atomic writes, ETag optimistic concurrency, and bearer-token auth.
- `transport/localAgentAdapter.js` implemented (maps 412 -> ConcurrencyError;
  the engine's retry loop handles conflicts).
- 7 new tests: agent auth/health/round-trip/412, plus a full **end-to-end**
  two-device sync through the real agent + adapter + a real file on disk.
- **Done when (manual):** run the agent, point two browsers' extensions at it,
  and a bookmark crosses over; point `SYNC_FILE` at a cloud-synced folder to
  sync across machines. Automated e2e covers the transport; the remaining step
  is loading the built extension in two real browsers.
- Still TODO (small): options-page field already exists for the agent URL/token;
  a per-path picker UI is a nicety, not required.

## M3.5 — Pluggable network transports ✅ (done)
- **WebDAV** adapter (`transport/webdavAdapter.js`): direct Basic-auth GET/PUT
  with ETag `If-Match` / create-only `If-None-Match`, auto-`MKCOL` of parent
  collections — **no host software** needed.
- **Self-hosted server** adapter made real (same protocol as the agent at a
  remote URL).
- Transport **factory** (`transport/index.js`) selects the adapter from config;
  background worker is now fully transport-agnostic.
- Options page: WebDAV fields + per-transport visibility, and **on-demand host
  permission** requests (`optional_host_permissions` + `permissions.request`) so
  the extension carries no broad install-time host access — store-friendly.
- 8 new tests (mock WebDAV server: auth, round-trip, conflict, MKCOL; plus a
  two-device end-to-end sync over WebDAV). 30 tests total.
- **Store-publishing posture:** all adapters ship in the extension (just
  `fetch`); the agent binary and a future cloud/OAuth module stay separate
  downloads, never part of the store package.

## M4 — Open tabs sync ✅ (done)
- `collectors/tabs.js` (per-device tab snapshot, owner-scoped ids) and
  `appliers/tabs.js` (list-only: never auto-opens; `restoreTabs` for explicit
  user action).
- Engine generalized: **type isolation** (a cycle only touches its own record
  type, passing others through) and an **`owns` predicate** so a device only
  tombstones its own tabs — closing a tab never deletes another device's tabs.
- Background syncs all enabled types; caches other devices' tabs for the
  options page, which lists them as clickable links ("restore on demand").
- 3 new tests (per-device coexistence, owner-scoped close, bookmark/tab type
  isolation). 33 tests total.
- **Done when (manual):** open tabs on each device are listed in the others'
  options page and openable on demand.

## M4.5 — Configurable auto-sync scheduling ✅ (done)
- Options: enable/disable auto-sync, a numeric interval (seconds/minutes), and
  "sync right after a local change" (debounced event-driven).
- Background: a single **coalescing lock** (`inFlight`) ensures runs never
  overlap/pile up; the periodic alarm is rebuilt from config on change; bookmark
  and tab change listeners trigger a debounced sync.
- `sync/schedule.js` (pure, tested) converts the interval to alarm minutes with
  a floor. Honest note in the UI: Chrome clamps sub-minute alarms to ~1 min;
  near-instant updates come from the change-driven option, not tiny polling.
- 5 new tests. 38 total.

## M4.6 — Update & version safety ✅ (done)
- Web stores are the intended channel (browsers auto-update). See
  `docs/UPDATES.md` for the full policy.
- **Cross-version guard:** the sync state carries a major `version`; a device
  refuses to overwrite state from a newer schema major (`assertStateWritable` →
  `IncompatibleStateError`) so an out-of-date device can't clobber newer data.
- **Config migrations:** `migrateConfig` (pure, tested) + `runConfigMigrations`
  on `onInstalled(update)`.
- **Protocol version:** agent `/health` reports `protocol`; `isProtocolCompatible`
  in the extension. 6 new tests. 44 total.

## M4.7 — Safety & user control ✅ (done)
- **Corruption guard:** `validateState` rejects state that parses but isn't
  plausible (e.g. an empty/garbled file from a cloud conflict) so the engine
  aborts instead of applying/overwriting it.
- **Per-operation permissions:** Options checkboxes for what sync may do to this
  browser — Add / Update / Remove independently (default all on). Enforced by a
  pure `plannedAction` in the bookmark applier.
- **Large-change safeguard:** a configurable threshold; if a sync would remove
  more than N local items the cycle throws `LargeChangeError` and **does not
  apply or push**. The options page surfaces a panel to "Approve once & sync"
  (one-shot bypass).
- **Automatic backups + restore:** before a sync removes any bookmark, snapshot
  the current bookmarks (kept last 3, `unlimitedStorage`); the options page lists
  backups with an additive "Restore (re-add)" action.
- 9 new tests (validate, permissions, backup trim, large-change abort/bypass).
  53 total.

## M4.8 — Customization & power features ✅ (done)
- **Export / Import**: portable `.json` snapshot for offline migration to a
  fresh browser/OS (additive import). `state/portable.js`.
- **Filters**: never-sync domain list (bookmarks/history/tabs); excluded items
  are not collected, imported, or tombstoned. `model/filters.js`.
- **Role modes**: per-device two-way / receive-only / send-only.
- **Preview / dry-run**: compute and list what a sync would change, applying
  nothing (engine `dryRun`; "Preview changes" button).
- **Sync inspector**: read-only, searchable view of the shared state.
- **End-to-end encryption**: passphrase → AES-GCM (PBKDF2) encrypting transport
  wrapper; transports only see ciphertext. `transport/crypto.js`.
- **Profiles**: multiple named sync sets (own transport/filters/keys and
  isolated baselines); "default" keeps legacy keys. `state/storeKeys.js`.
- 71 tests total.

## M5 — History sync ✅ (done)
- `collectors/history.js` (incremental via watermark; skips ids already in the
  shared state for loop-safety) and `appliers/history.js` (capability branch:
  Firefox sets real `visitTime`, Chromium stamps insert-time).
- `sync/history.js`: a dedicated **append-only** path — history is added, never
  tombstoned, so clearing history on one device can't wipe it everywhere.
- Options: enable History + a "last N days" lookback; honest note about the
  Chromium timestamp limitation.
- 3 new tests (propagation + idempotency, append-only/no-delete, no runaway
  re-import). 56 total.
- **Known scale caveat:** the whole-state blob grows with history; large-history
  delta sync + pruning is M6 work.

## M6 — Hardening & packaging  (mostly done)
- ✅ E2E encryption of the blob (passphrase) — see M4.8.
- ✅ Remote self-hosted server (same protocol, auth) — see M3.5.
- ✅ **Packaging**: brand icons (16/32/48/128, `npm run icons`), polished
  manifests (icons + metadata), `npm run package` → store-ready zips for both
  Chrome and Firefox via `web-ext`, `npm run lint:firefox` (0 errors/warnings).
  `docs/PUBLISHING.md`, `STORE.md` (listing + permission justifications),
  `PRIVACY.md`, and agent service installers (`agent/install/` systemd +
  launchd).
- ✅ **Delta sync (conditional transfer) + tombstone GC** — see Post-launch.
- ⬜ **Still open (optional):** record-level delta over an append-log layout for
  dumb file stores; signed self-hosted `.xpi` + `update_url`.

## Post-launch improvements ✅ (in progress)
- **Bookmark management UI.** Tier 1 (done): the toolbar popup can bookmark /
  rename / remove the current page and search-and-open bookmarks (changes
  auto-sync via existing listeners). Tier 2 (done): a full-page manager
  (`manager/`) — filterable folder tree with inline rename, delete
  (`removeTree` for folders), new folder / new bookmark, and drag-and-drop
  move/reorder; top-level special folders are protected. Rename/new-folder/
  delete verified via the real UI in Chromium (DnD uses standard HTML5 events).
  Reorder is **engine-agnostic**: it never does a same-parent forward move (the
  operation Chrome/Firefox index differently) — it appends to the destination
  then does a backward move, both consistent across browsers (verified).
- **Browser E2E test** (`extension/e2e/sync.e2e.mjs`, `npm run test:e2e`):
  Playwright loads the REAL built extension in REAL Chromium and syncs bookmarks
  both ways through the REAL agent — covering the collector/applier/engine
  against actual Chrome APIs (what unit tests mock). Runs headed under xvfb;
  auto-skips if no Chromium is present (kept out of the fast unit CI).
- **CI** (`.github/workflows/ci.yml`): tests + build + `web-ext lint` on push/PR.
- **Status popup**: toolbar popup with last-sync status + error badge.
- **Secrets hardening**: self-describing encryption envelope with a strengthened
  KDF (PBKDF2 600k, params stored per-envelope); opt-in memory-only passphrase
  (`storage.session`, never on disk); **fail-closed** when encryption is enabled
  but locked (never syncs plaintext). Threat model in `docs/SECURITY.md`.
- **Delta sync (conditional transfer)**: `If-None-Match`/`304` conditional pull
  (agent + WebDAV + memory) so unchanged remotes aren't re-downloaded; skip the
  push (and the expensive re-encrypt) when the file didn't change; a per-profile
  ETag cache drives it. Works on every transport (no protocol break). Plus
  **tombstone GC** (`model/gc.js`, 90-day retention) so the blob doesn't grow
  forever. The dominant cost — frequent scheduled syncs re-shipping MBs when
  nothing changed — is now ~one conditional GET.

### M6 (optional) — Chromium past-dated history via the agent
The Chromium `history.addUrl` API can't set a past timestamp, so synced visits
are stamped at sync time there (documented limitation we deliberately accepted).
If true retroactive timestamps on Chromium are later wanted, the realistic path
is to extend the **local agent** (Python is a fine choice — `import sqlite3`)
to write directly into Chromium's `History` SQLite file:
- Runs as the existing external local process, not from the extension sandbox
  (a webpage/extension JS can never reach the profile DB).
- **Must write only while that browser is fully closed** — Chromium locks the
  DB while running; concurrent writes risk corruption / "database is locked".
- Hand-maintains Chromium's schema (`urls`, `visits`, visit sources, segments,
  favicons) and WAL/caches, which change across versions — inherently fragile.
This stays **opt-in and off by default**; it does not affect Firefox, which
already sets real `visitTime` natively.

## Effort summary

| Milestone | Rough effort |
| --- | --- |
| M1 build harness | 0.5 d |
| M2 bookmarks | 1.5 d |
| M3 agent + file transport | 1.5 d |
| M4 tabs | 1.0 d |
| M5 history | 1.5 d |
| M6 hardening/packaging | 2.0 d |
| **MVP (M1–M3)** | **~3.5 d** |
| **Full (M1–M6)** | **~8 d** |

These are focused-engineering days; calendar time and cross-browser/OS QA push
the "production, store-published" version toward a few weeks.

## Open decisions to confirm before M1
- Bundler: `esbuild` (fast, simple) vs. `vite`. Plan assumes **esbuild**.
- Agent language: **Node** (shares JS/types with extension) vs. Go (single
  static binary, easier distribution). Plan assumes **Node** for M3, with Go as
  a possible M6 repackage.
- Tab sync default behavior (list vs. auto-restore) — plan defaults to **list**.
