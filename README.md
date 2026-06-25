# BrowserSync (working title)

[![CI](https://github.com/proairface/claude-test/actions/workflows/ci.yml/badge.svg)](https://github.com/proairface/claude-test/actions/workflows/ci.yml)

A cross-browser extension that synchronizes **bookmarks**, **open tabs**, and
**history** between Firefox and Chromium-based browsers (Chrome, Brave, Vivaldi,
Edge, Chromium). Synced entries are written back using each browser's native
APIs, so the browser treats imported activity the same as local activity.

> **Status: bookmarks, tabs, and history sync all implemented.** Build harness,
> bookmarks two-way sync, open-tabs (per-device, list-only), append-only history
> sync, **multiple transports — WebDAV (no host software), self-hosted server,
> local agent, browser storage**, configurable + event-driven scheduling,
> update/version safety, and a safety & control layer (corruption guard,
> add/update/remove permissions, large-change pause, backups/restore). 56
> passing tests including real two-device end-to-end syncs, plus end-to-end
> encryption, filters, role modes, dry-run preview, a sync inspector, profiles,
> and **store-ready packaging** (`npm run package`). See
> [`docs/PLAN.md`](docs/PLAN.md) and [`docs/PUBLISHING.md`](docs/PUBLISHING.md).
> Remaining (optional): large-history delta sync.
>
> **No extra software?** Pick the **WebDAV** transport in Options — the
> extension talks to your WebDAV server (Nextcloud/NAS) directly, so Node/the
> agent isn't needed. The agent is only for the *local-file* transport. See
> [Transports](#transports).
>
> **Easiest start — the setup script** clones/updates the repo, installs deps
> (and, if Node 18+ isn't found, offers a no-sudo project-local Node download),
> builds both targets, and configures + optionally starts the agent:
> ```bash
> ./setup.sh            # interactive; or run from a fresh download to bootstrap
> ```
> It writes `agent/run-agent.sh` (a one-command launcher) and prints exactly
> what to load and which Options values to enter.
>
> **Try it:** see [`docs/TRY-IT.md`](docs/TRY-IT.md) for the full manual
> walkthrough. Quick version:
> 1. Agent (from `agent/`): `TOKEN=yoursecret SYNC_FILE=~/Drive/bsync.json node index.js`
>    (point `SYNC_FILE` at any local/NFS/SMB path or cloud-synced folder).
> 2. Extension (from `extension/`): `npm install && npm test && npm run build`,
>    then load `dist/chrome` (chrome://extensions → unpacked) or
>    `npm run run:firefox`. In the extension's Options, set the agent URL +
>    token and click **Sync now**.

## What works vs. what's constrained

| Data type | Chromium (Chrome/Brave/Vivaldi/Edge) | Firefox |
| --- | --- | --- |
| Bookmarks | ✅ full two-way sync (`bookmarks` API) | ✅ full two-way sync |
| Open tabs | ✅ read + restore (`tabs` API) | ✅ read + restore |
| History (real past timestamps) | ❌ API stamps *current* time only | ✅ `history.addUrl({visitTime})` honors past timestamps |

The Chromium history-timestamp limitation is a deliberate browser security
boundary. Per the project decision, we **accept this limitation** rather than
shipping a fragile native helper that edits the SQLite `History` file. On
Chromium, synced visits appear in history but are stamped at sync time; on
Firefox they carry their true original timestamps.

## Architecture in one picture

```
  ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
  │  Firefox      │      │  Brave        │      │  Chrome       │
  │  + extension  │      │  + extension  │      │  + extension  │
  └──────┬────────┘      └──────┬────────┘      └──────┬────────┘
         │ localhost / native messaging  (Transport adapter)
         ▼                      ▼                      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │   Local Sync Agent (cross-platform daemon)  OR  Self-hosted  │
  │   server. Owns file I/O for the shared sync state.           │
  └───────────────────────────┬─────────────────────────────────┘
                              ▼
        Sync state file (JSON/CBOR) living on ANY of:
        local partition · NFS · SMB · Google Drive · OneDrive · Dropbox
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/SYNC-PROTOCOL.md`](docs/SYNC-PROTOCOL.md) for the data model and merge
rules.

## Transports

The two browsers need a shared "rendezvous" to exchange data. You pick how, in
the extension's Options — **every adapter is plain `fetch()` and ships inside
the extension**, so the extension stays store-publishable regardless of choice:

| Transport | Extra software on your PC | Notes |
| --- | --- | --- |
| **WebDAV** | **None** | Talks directly to Nextcloud / a NAS / any WebDAV URL. Recommended for a pure-extension setup. |
| **Self-hosted server** | None on your PC | Same protocol as the agent at a remote URL; you host the server elsewhere. |
| **Local agent** | Yes (the Node agent) | Only this one needs the agent — it owns local-file I/O so the sync file can live on a local/NFS/SMB path or a cloud-synced folder. |
| **Browser `storage.sync`** | None | Demo only — tiny quota, does not bridge Firefox ↔ Chromium. |

Permissions are requested **per endpoint, on demand** (when you enter a URL),
not broadly at install time — so the published extension asks for no scary
all-sites access up front.

**What ships in the store vs. what's a separate download:** the extension
(all adapters) is store-ready. The **agent** binary and any future **cloud
(OAuth) module** are optional, separate downloads in this repo — they are not
part of the published extension.

## Safety & control

Because sync can delete things, there are rails (all configurable in Options):

- **Corruption guard** — refuses to act on sync data that doesn't look valid, so
  a garbled/empty file can't wipe your data.
- **Per-operation permissions** — allow sync to Add / Update / Remove
  independently; uncheck *Remove* and sync will never delete your local entries.
- **Large-change safeguard** — if a sync would remove more than N items it
  pauses and asks before applying anything.
- **Automatic backups** — bookmarks are snapshotted before any destructive sync,
  with a one-click additive *Restore*.

## Uninstalling

Clean removal is a first-class feature — BrowserSync creates no services, PATH
entries, shell-rc edits, global packages, or system files. Run `./uninstall.sh`
(or `./uninstall.sh --dry-run` to preview). Your sync data and project folder
are kept unless you opt in. Full footprint + manual steps:
[`docs/UNINSTALL.md`](docs/UNINSTALL.md).

## Layout

- `extension/` — the WebExtension (Manifest V3, single codebase for all browsers)
- `agent/` — the optional local sync agent / self-hosted server
- `docs/` — architecture, sync protocol, the plan, and try-it/uninstall guides
- `setup.sh` / `uninstall.sh` — interactive install and clean removal
