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

## M3 — Local sync agent + file transport  (~1.5 days)
- `agent/` daemon: HTTP on `127.0.0.1`, reads/writes a configurable file path,
  ETag concurrency, token auth.
- `transport/localAgentAdapter.js` in the extension.
- Options UI to set the path (point it at NFS/SMB/local/Drive/OneDrive folder).
- **Done when:** two browsers on the same machine sync bookmarks through a file
  on disk; pointing the path at a cloud-synced folder syncs across machines.

## M4 — Open tabs sync  (~1 day)
- `collectors/tabs.js`, `appliers/tabs.js`, per-device tab sets.
- Options: "show other devices' tabs" (list) vs. "restore on demand".
- **Done when:** open tabs from each device are visible/restorable elsewhere.

## M5 — History sync  (~1.5 days)
- `collectors/history.js`, `appliers/history.js` with capability branching.
- Firefox: real `visitTime`. Chromium: documented current-time stamping.
- Incremental collection via watermark to avoid re-scanning full history.
- **Done when:** a week of Firefox history shows up (correct dates) in Firefox
  on another machine, and appears (sync-dated) on Brave.

## M6 — Hardening  (~2 days, optional/parallel)
- Optional E2E encryption of the blob (passphrase).
- Remote self-hosted server (same protocol, auth, TLS) as an alt to the agent.
- Conflict/perf: large-history delta sync (`/changes?since=`), tombstone GC.
- Packaging: signed `.xpi` (Firefox) and store-ready zip (Chromium), native
  messaging host manifests + installers per OS for the agent.

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
