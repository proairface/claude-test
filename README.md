# BrowserSync (working title)

A cross-browser extension that synchronizes **bookmarks**, **open tabs**, and
**history** between Firefox and Chromium-based browsers (Chrome, Brave, Vivaldi,
Edge, Chromium). Synced entries are written back using each browser's native
APIs, so the browser treats imported activity the same as local activity.

> **Status: M1 + M2 + M3 implemented.** Build harness, bookmarks two-way sync
> (tested CRDT engine), and the local sync agent + file transport all work —
> 22 passing tests including a real end-to-end two-device sync through the
> agent. Tabs (M4) and history (M5) are still stubs. See
> [`docs/PLAN.md`](docs/PLAN.md) for milestone status.
>
> **Try it locally:**
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

## Layout

- `extension/` — the WebExtension (Manifest V3, single codebase for all browsers)
- `agent/` — the optional local sync agent / self-hosted server
- `docs/` — architecture, sync protocol, and the implementation plan
