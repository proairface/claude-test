# BrowserSync — Local Sync Agent

A tiny cross-platform daemon that owns filesystem I/O for the shared sync state,
so the sandboxed extension can use file-based transports (local partitions,
NFS, SMB, or a cloud-synced folder like Google Drive / OneDrive / Dropbox).

The same HTTP protocol is implemented by the optional remote **self-hosted
server** — only the URL, auth, and TLS differ.

## How it gives you "any transport"

The agent reads/writes a single sync file at a configurable path. To sync across
machines via the cloud, point that path at a folder your cloud client already
mirrors:

```
SYNC_FILE=~/OneDrive/browsersync/state.json   # or a Drive/Dropbox/NFS/SMB path
```

The cloud client replicates the file; each machine's agent reads the latest.

## Protocol (see docs/SYNC-PROTOCOL.md)

```
GET  /health  -> { ok, version }
GET  /state   -> sync state (+ ETag)
PUT  /state   -> store state (If-Match for optimistic concurrency)
```

Binds to `127.0.0.1` only; requires a shared token (matching the extension).

## Status

Scaffold only. `index.js` is a documented stub — see milestone **M3** in
`docs/PLAN.md`.

## Config (planned)

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | localhost port |
| `SYNC_FILE` | `./state.json` | path to the shared sync file (any mount) |
| `TOKEN` | _required_ | shared secret the extension must present |
