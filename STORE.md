# Store listing copy

Reusable text for the Chrome Web Store / Firefox AMO listings.

## Name
BrowserSync — bookmarks, tabs & history across browsers

## Short description (≤132 chars)
Sync bookmarks, open tabs, and history between Firefox and Chromium browsers via
WebDAV, a self-hosted server, or a local file.

## Full description
BrowserSync keeps your bookmarks, open tabs, and browsing history in sync across
Firefox, Chrome, Brave, Vivaldi, and Edge — using a destination **you** control.

Highlights
- Sync bookmarks (two-way), open tabs (view other devices'), and history
  (append-only — clearing one device never wipes the rest).
- Transports with **no servers from us**: WebDAV (Nextcloud/NAS), a self-hosted
  server, a local file via the companion agent (point it at any local/NFS/SMB
  path or a cloud-synced folder), or browser storage.
- **End-to-end encryption** — with a passphrase, your destination only ever sees
  ciphertext.
- **Privacy filters** — never sync chosen domains (banking, health, …).
- **Safety first** — corruption guard, add/update/remove permissions, a
  large-change "are you sure?" pause, and automatic pre-delete backups with
  one-click restore.
- **Power features** — scheduled + on-change sync, dry-run preview, a searchable
  inspector, device roles (two-way / receive-only / send-only), named profiles,
  and offline export/import for moving to a new machine.

No accounts, no tracking, no telemetry.

## Privacy policy URL
Host `PRIVACY.md` (e.g. on GitHub Pages) and link it here.

## Permission justifications (for reviewers)
- **bookmarks** — read and write bookmarks to sync them.
- **history** — read visits to sync them; add visits received from other devices.
- **tabs** — read open tabs to share them and surface other devices' tabs.
- **storage / unlimitedStorage** — store settings, sync bookkeeping, and local
  bookmark backups (which can be large for big collections).
- **alarms** — run the periodic background sync.
- **optional_host_permissions (`http/https`)** — requested **on demand** only
  for the specific sync endpoint URL the user enters (WebDAV/server/agent), not
  at install time. No browsing-page access is used.

## Notes for reviewers
- Source is bundled with esbuild; rebuild with `npm install && npm run
  build:firefox` (output in `dist/firefox`).
- All network requests go solely to the user-configured sync endpoint.
