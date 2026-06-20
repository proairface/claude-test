// Corruption guard + safety error types (pure, unit-testable).
//
// The dangerous failure mode isn't unparseable JSON (that already throws on
// pull); it's a file that PARSES but is wrong (e.g. replaced by `{}` by a cloud
// conflict). Trusting that could wipe data. validateState() rejects anything
// that doesn't look like real sync state, so the engine aborts instead of
// applying or overwriting it.

export class CorruptStateError extends Error {
  constructor(reason) {
    super(`Sync data looks corrupt (${reason}). Refusing to apply or overwrite it.`);
    this.name = "CorruptStateError";
    this.reason = reason;
  }
}

/** Raised when a single sync would remove more items than the user allows. */
export class LargeChangeError extends Error {
  constructor(count, limit, recordType) {
    super(
      `This sync would remove ${count} ${recordType} item(s), over your limit of ${limit}. ` +
        `Paused for confirmation.`,
    );
    this.name = "LargeChangeError";
    this.count = count;
    this.limit = limit;
    this.recordType = recordType;
  }
}

/**
 * Validate the top-level shape of a sync-state object. Throws CorruptStateError
 * on anything that isn't a plausible state. (An empty `{records:{}}` is valid —
 * that's a legitimate brand-new store.)
 * @param {*} state
 * @returns {true}
 */
export function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new CorruptStateError("not an object");
  }
  if (!("records" in state)) throw new CorruptStateError("missing 'records'");
  const r = state.records;
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    throw new CorruptStateError("'records' is not a map");
  }
  if ("version" in state && !(typeof state.version === "number" && state.version > 0)) {
    throw new CorruptStateError("invalid 'version'");
  }
  return true;
}
