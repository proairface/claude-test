# Implementation plan

Milestones are ordered so each one is independently testable and the project is
useful as early as possible. Effort is rough engineering time for a careful
implementation with tests, **not** wall-clock.

## M0 — Scaffold + design ✅ (this commit)
Repo structure, module interfaces, manifests, docs. No logic.

## M1 — Build & dev harness  (~0.5 day)
- `npm` scripts to build `dist/` for Chrome and Firefox (manifest swap + bundle).
- `web-ext run` for Firefox, load-unpacked for Chromium.
- Wire `webextension-polyfill`.
- **Done when:** the empty extension loads in both browser families and logs
  from its service worker.

## M2 — Bookmarks two-way sync  (~1.5 days)
- `collectors/bookmarks.js`, `appliers/bookmarks.js`.
- Path-based reconciliation (recreate folder hierarchy), content-hash ids.
- Engine + merge + an in-memory transport for unit tests.
- **Done when:** add a bookmark in Firefox, run sync, it appears in Brave under
  the same folder; deletes propagate; re-running sync is a no-op (idempotent).

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
