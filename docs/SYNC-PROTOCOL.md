# Sync protocol & data model

This document defines the wire format and merge rules. It is the contract
between the extension, the local agent, and the self-hosted server.

## Normalized records

All synced items become `Record`s:

```jsonc
{
  "id": "sha256-of-natural-key",   // stable, content-derived
  "type": "bookmark" | "tab" | "visit",
  "deviceId": "uuid-of-origin-device",
  "lamport": 12345,                 // logical clock for ordering
  "updatedAt": 1718400000000,       // ms epoch, wall clock (tiebreak/info)
  "deleted": false,                 // tombstone flag
  "payload": { /* type-specific, see below */ }
}
```

### bookmark payload
```jsonc
{ "url": "https://…", "title": "…", "parentPath": ["Bookmarks Bar", "Dev"], "index": 3 }
```

### tab payload
```jsonc
{ "url": "https://…", "title": "…", "windowGroup": "device:uuid:win:7", "pinned": false }
```
Open tabs are modeled as a per-device *set*; restoring is opt-in (you usually
don't want every device's tabs forced open everywhere).

### visit payload
```jsonc
{ "url": "https://…", "title": "…", "visitTime": 1718300000000, "transition": "link" }
```
`visitTime` is honored on Firefox; on Chromium it is recorded in payload but the
actual inserted visit is stamped at apply time (documented limitation).

## Sync state (the file/blob)

```jsonc
{
  "version": 1,
  "records": { "<id>": Record, … },   // map for O(1) merge + dedup
  "clocks": { "<deviceId>": lamportHigh },  // highest lamport seen per device
  "updatedAt": 1718400000000
}
```

## Merge rules (last-writer-wins + tombstones)

For each incoming record `r` vs. existing `e` with the same `id`:

1. If no `e`: insert `r`.
2. Else compare `(lamport, deviceId)` lexicographically (lamport first,
   deviceId as deterministic tiebreak). Keep the higher one.
3. A `deleted: true` record is a tombstone; it wins ties against a live record
   to make deletes converge. Tombstones are garbage-collected after a
   configurable retention window (default 90 days).

This is a simple state-based CRDT (a grow-only map of LWW-registers), which
converges regardless of sync order — important for the "offline for a week"
case.

## What "this device must apply" means

After merge, the device applies any record whose `(deviceId, lamport)` it has
not yet recorded in its **local watermark** map and whose origin is not itself.
Idempotent appliers + content-hash ids make re-application safe even if the
watermark is lost.

## Transport HTTP API (agent and server share this)

```
GET  /state            -> 200 { sync state }            (whole blob; simple v1)
PUT  /state            <- { sync state }  -> 200        (optimistic, with ETag)
GET  /health           -> 200 { ok: true, version }
```

- `If-Match: <etag>` on `PUT` gives optimistic concurrency; on 412 the client
  re-pulls, re-merges, retries.
- **Conditional (delta) transfer:** `GET /state` honors `If-None-Match: <etag>`
  and returns `304 Not Modified` (no body) when the file is unchanged. The
  client caches the last-seen ETag per profile and, when nothing changed
  locally, uses this to skip re-downloading; it also skips the `PUT` entirely
  when the merged file is byte-identical to what it pulled. This works on every
  transport (agent, WebDAV) without a protocol change — the whole-blob model is
  kept for simplicity/correctness, and the redundant transfers are elided.
- A record-level `GET /changes?since=<lamport>` remains possible future work for
  very large stores on dumb file backends (append-log layout).

## Encryption (M6, optional)

If a passphrase is set, the extension encrypts `records`/`clocks` with
AES-GCM (key from Argon2id) and the transport stores an opaque ciphertext
envelope `{ version, salt, nonce, ciphertext }`. The agent/server never see
plaintext.
