// Browser-free guard so encryption "locked" handling is unit-testable.
export class EncryptionLockedError extends Error {
  constructor() {
    super("Encryption is enabled but no passphrase is available. Enter it in Settings to unlock.");
    this.name = "EncryptionLockedError";
  }
}

/**
 * Throw if encryption is enabled but there's no passphrase — so we FAIL CLOSED
 * instead of silently syncing plaintext to a store meant to be encrypted.
 */
export function assertEncryptionUnlocked(cfg) {
  if (cfg?.encryption?.enabled && !cfg.encryption.passphrase) {
    throw new EncryptionLockedError();
  }
}
