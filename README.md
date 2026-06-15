# BrowserSync (working title)

A cross-browser extension that synchronizes **bookmarks**, **open tabs**, and
**history** between Firefox and Chromium-based browsers (Chrome, Brave, Vivaldi,
Edge, Chromium). Synced entries are written back using each browser's native
APIs, so the browser treats imported activity the same as local activity.

> **Status: scaffold + design only.** This commit lays out the repository
> structure, module interfaces, and the build plan. No sync logic is
> implemented yet — every module is a documented stub with `TODO`s. Review the
> plan in [`docs/PLAN.md`](docs/PLAN.md) before implementation begins.

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
