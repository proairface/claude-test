// Versioning + cross-version compatibility for sync data and the agent protocol.
//
// Because browsers auto-update extensions independently, several devices may run
// different versions against the SAME shared sync file. The rules:
//   - Sync-state schema changes must be ADDITIVE within a major version (unknown
//     fields / record types are always preserved, never dropped).
//   - The sync state carries a major `version`. A device that sees a HIGHER
//     major than it understands must NOT overwrite it — it goes read-only and
//     surfaces an "update required" error instead of corrupting newer data.

/** Major schema version of the shared sync state this build writes/understands. */
export const STATE_SCHEMA_VERSION = 1;

/** Major version of the agent/server wire protocol this build speaks. */
export const PROTOCOL_VERSION = 1;

/** Thrown when the shared state is newer than this extension can safely handle. */
export class IncompatibleStateError extends Error {
  constructor(found, supported) {
    super(
      `Sync data is schema v${found}, but this BrowserSync only supports v${supported}. ` +
        `Update the extension on this device to sync.`,
    );
    this.name = "IncompatibleStateError";
    this.found = found;
    this.supported = supported;
  }
}

/** Major version of a sync-state object (defaults to 1 for legacy/empty state). */
export function stateMajor(state) {
  const v = Number(state?.version);
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 1;
}

/**
 * Assert the state is safe to read AND write with this build. Returns the major
 * on success; throws IncompatibleStateError if the state is from a newer major.
 */
export function assertStateWritable(state) {
  const major = stateMajor(state);
  if (major > STATE_SCHEMA_VERSION) throw new IncompatibleStateError(major, STATE_SCHEMA_VERSION);
  return major;
}

/** Whether a remote agent/server protocol major is compatible with this build. */
export function isProtocolCompatible(remoteProtocol) {
  const v = Number(remoteProtocol);
  if (!Number.isFinite(v)) return true; // unknown/legacy agent: don't block
  return Math.trunc(v) === PROTOCOL_VERSION;
}
