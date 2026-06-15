# Architecture

## Goals

1. One extension codebase that runs on Firefox and all Chromium browsers.
2. Sync bookmarks, open tabs, and history between devices/browsers.
3. Write synced data back through **native browser APIs** so the browser cannot
   distinguish imported entries from locally-created ones.
4. Pluggable transport so the shared sync state can live on a self-hosted
   server, a local/NFS/SMB path, or a cloud-synced folder (Drive/OneDrive/etc.).
5. Retroactive sync: a browser opened after a week of inactivity pulls and
   applies everything it missed.

## Why a local agent exists

A WebExtension runs in a sandbox. It **cannot**:
- open arbitrary local files (NFS/SMB/local partitions),
- read a Google Drive / OneDrive folder on disk,
- write the browser's history SQLite database.

It **can** make `fetch()` calls to `http://localhost`, and (with a manifest
entry) exchange native messages with a registered host binary. Therefore the
file-based transports are served by a small **local sync agent**:

```
extension  ──HTTP localhost / native messaging──▶  local agent  ──fs──▶  sync file
```

Point the agent's configured path at any mount or cloud-synced folder and you
get NFS/SMB/local/Drive/OneDrive "for free" — cloud providers sync the file,
the agent just reads/writes it. A remote **self-hosted server** speaks the exact
same HTTP protocol, so the extension code is identical; only the base URL and
auth differ.

## Layered design

```
extension/src/
  collectors/   read local browser state  -> normalized records
  appliers/     normalized records        -> write via browser APIs
  model/        normalized record types + ids + tombstones
  sync/         engine (orchestration) + merge (CRDT-ish reconciliation)
  transport/    adapter interface + concrete adapters
  background/   service worker: schedules sync, wires everything
  options/      UI to pick transport, path/URL, what to sync, device name
```

### Data flow for one sync cycle

1. **Collect** local bookmarks/tabs/history -> normalized records with stable
   content-hash ids and per-record logical timestamps.
2. **Pull** the remote sync state via the active transport adapter.
3. **Merge** local + remote (see `docs/SYNC-PROTOCOL.md`): last-writer-wins per
   field, tombstones for deletes, vector/lamport clock per device to order
   events and compute "what this device hasn't applied yet".
4. **Apply** the missing remote records locally through the appliers.
5. **Push** the merged state (including this device's new records) back.
6. Persist a per-device **watermark** so the next cycle is incremental.

### Identity & dedup

- `deviceId`: random UUID generated on first run, stored in `storage.local`.
- Record id: stable hash of the natural key
  (e.g. bookmark = `url + title + parentPath`; visit = `url + visitTime`).
  This makes sync idempotent and prevents duplicate inserts on re-apply.

## Browser API matrix

| Capability | Chromium API | Firefox API | Notes |
| --- | --- | --- | --- |
| Read bookmarks | `chrome.bookmarks.getTree` | same | identical |
| Write bookmarks | `chrome.bookmarks.create` | same | identical |
| Read tabs | `chrome.tabs.query` | same | identical |
| Open tab | `chrome.tabs.create` | same | identical |
| Read history | `chrome.history.search` | same | identical |
| Add visit | `chrome.history.addUrl` (no custom time) | `browser.history.addUrl({visitTime})` | **divergence** |

The history applier branches on capability detection (see
`appliers/history.js`).

## Manifest V3 across browsers

- Background: `service_worker` on Chromium; Firefox supports MV3 with an
  `background.scripts`/event-page form. We keep two manifest files
  (`manifest.chrome.json`, `manifest.firefox.json`) and a build step copies the
  right one to `dist/manifest.json`.
- All extension code uses the promise-based `browser.*` namespace via
  `webextension-polyfill` so the same source runs on both.

## Security & privacy

- Sync state may contain full history/bookmarks — sensitive. Plan for optional
  end-to-end encryption (passphrase -> key via PBKDF2/Argon2; encrypt the blob
  before it leaves the extension) so untrusted transports (cloud folders) never
  see plaintext. See PLAN milestone M6.
- Agent listens on `127.0.0.1` only, with a shared token the extension sends.
