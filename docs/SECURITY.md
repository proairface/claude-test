# Security & threat model

What BrowserSync's encryption protects, what it doesn't, and how secrets are
handled.

## What end-to-end encryption protects
With a passphrase set, the entire sync blob is encrypted **before it leaves the
extension** (AES-GCM; key derived from your passphrase via PBKDF2). So:
- The **transport** — your WebDAV host, a cloud-synced folder, the agent, a
  self-hosted server — only ever stores/serves **ciphertext**. It cannot read
  your bookmarks, history, or tab URLs.
- **In transit and at rest on the destination**, the data is confidential and
  tamper-evident (AES-GCM authenticates contents — a modified blob fails to
  decrypt rather than silently corrupting).

## What it does NOT protect against
- **Local device compromise.** The data lives unencrypted in your browser (it
  has to, to be usable), and settings live in the browser's local storage. An
  attacker with access to your logged-in profile can read both. Encryption is
  about the *transport*, not your own device.
- **A malicious transport replaying an OLD ciphertext (rollback).** AES-GCM
  proves a blob wasn't *modified*, not that it's the *latest*. A hostile server
  could serve a stale (but validly-encrypted) blob. This is an accepted
  limitation; mitigation (a signed monotonic counter) is future work.

## How secrets are handled
- **Passphrase storage — your choice:**
  - *Default:* stored in the browser's local extension storage so unattended
    background sync keeps working across restarts.
  - *Memory-only (opt-in):* "Keep passphrase only in memory" stores it in
    `storage.session`, which is **never written to disk** and is cleared when the
    browser fully closes. More secure, but background sync pauses until you
    re-enter it each browser session.
- **Fail-closed:** if encryption is enabled but no passphrase is available
  (e.g. memory-only after a restart), sync **stops with a clear "locked" error**
  rather than falling back to uploading plaintext.
- **Transport credentials** (WebDAV user/password, agent/server token) are kept
  in local storage by necessity — unattended background sync needs them. Prefer
  app-specific passwords/tokens scoped to the sync folder where your provider
  supports it.
- **Key derivation** is self-describing: each encrypted envelope records its KDF
  parameters (algorithm, iterations), so the cost can be raised in future
  releases without breaking data encrypted by older versions. Current default:
  PBKDF2-HMAC-SHA256, 600k iterations.
- **No secret leaves your machine except as ciphertext**, and secrets are never
  included in exports (export contains data records only) or sync status.

## Recommendations
- Use encryption whenever the destination is a third party (cloud/hosted WebDAV).
- Keep an **unencrypted local export** somewhere safe — a lost passphrase means
  unrecoverable encrypted data, by design.
- Use a strong, unique passphrase; the same one must be entered on every device.

## Reporting
Open a security issue at https://github.com/proairface/claude-test.
