# Updates, versioning & compatibility

How BrowserSync ships updates and stays safe when devices run different
versions against the same shared sync data.

## Distribution: the web stores

The intended channel is the **Chrome Web Store** and **Firefox AMO**. Browsers
then **auto-update** the extension silently — there is no update code to ship.
(The store-friendly permission model — `optional_host_permissions` requested per
endpoint — exists partly to keep store review smooth.)

Developers running from source update with:

```bash
git pull && (cd extension && npm run build)   # then reload the unpacked ext
```

The **agent** is a separate download with its own version; update it by pulling
the repo. It is never part of the published extension package.

## Versions we track

| Version | Where | Bump when |
| --- | --- | --- |
| Extension `version` | `manifest.*.json` | every release (semver) |
| `STATE_SCHEMA_VERSION` | `extension/src/model/version.js` | the shared sync-state format changes incompatibly |
| `PROTOCOL_VERSION` | extension + `agent/server.js` | the agent/server wire protocol changes incompatibly |
| `CONFIG_SCHEMA_VERSION` | `extension/src/state/migrateConfig.js` | the saved `storage.local` config shape changes |

## The hard part: mixed versions on one sync file

Because devices auto-update independently, a single shared file may be touched by
several extension versions at once. Two mechanisms keep that safe:

### 1. Additive schema + "newer wins, never clobbered"
- Sync-state changes must be **additive within a major** — unknown fields and
  unknown record *types* are always preserved (the engine already passes through
  record types it doesn't handle).
- The state carries a major `version`. Before writing, a device calls
  `assertStateWritable(state)`. If the state's major is **newer** than the
  device understands, it throws `IncompatibleStateError` and **does not push** —
  so an out-of-date device can never overwrite newer-format data. The user sees
  an "update this device" message instead.

### 2. Config migrations on update
On `runtime.onInstalled` (`reason: "update"`), `runConfigMigrations()` brings the
stored config up to `CONFIG_SCHEMA_VERSION` by applying ordered, pure migration
steps (`migrateConfig`). Adding one: bump the version and add a step keyed by the
new version.

### Agent/server protocol
`GET /health` returns `{ version, protocol }`. The extension's
`isProtocolCompatible()` compares the protocol major and can warn on a mismatch
rather than failing obscurely. Unknown/legacy agents are not blocked.

## The agent / self-hosted server

The agent (and the identical self-hosted server) is a **separate download** with
its own lifecycle, distinct from the store-distributed extension.

### Updating it
- **Local agent:** `git pull` in the repo, then restart it (Ctrl-C the running
  process and re-run `agent/run-agent.sh`, or your service manager). Each machine
  runs its own agent and is updated independently.
- **Self-hosted server:** deploy the new `agent/` build to your host and restart.

### Why agent updates are low-risk
The agent is **schema-agnostic**: it only stores and serves the opaque
sync-state blob — it never parses records. So:
- The **data** cross-version guard (`assertStateWritable`) is enforced entirely
  in the *extension*, and therefore protects the agent/server path too, on every
  transport.
- Agents on different machines can run **different versions** safely, as long as
  each is wire-protocol-compatible with the extension talking to it locally.

### Handling a wire-protocol mismatch
The only agent/extension contract that can break is the HTTP wire protocol
(`GET/PUT /state`, ETag, auth). It's guarded end to end:
- The agent advertises `protocol` on `GET /health`.
- Before each sync, the agent/server adapter runs a **preflight**: it checks the
  agent is reachable, the token is accepted, and the protocol major matches. On
  mismatch it throws `ProtocolMismatchError` ("update whichever is older");
  unreachable/401 produce equally clear messages. The sync is aborted *before*
  any write, so a mismatch can never half-apply.
- Bump `PROTOCOL_VERSION` in **both** `agent/server.js` and
  `extension/src/model/version.js` only on an incompatible protocol change, and
  prefer additive, backward-compatible protocol changes so old and new can
  coexist during rollout.

## Release checklist (when cutting a version)

1. Bump `manifest.*.json` `version`.
2. If the sync-state format changed: keep it additive, or bump
   `STATE_SCHEMA_VERSION` **and** ship a forward migration + a transition plan
   (older clients will go read-only until updated).
3. If config shape changed: bump `CONFIG_SCHEMA_VERSION` and add a `migrateConfig`
   step.
4. If the agent protocol changed: bump `PROTOCOL_VERSION` in both places.
5. Build, test, then upload to the stores.
