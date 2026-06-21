# Publishing & packaging

How to build store-ready packages and submit to the Chrome Web Store and
Firefox AMO. (Distribution model and auto-updates: see `docs/UPDATES.md`.)

## Build the packages

From `extension/`:

```bash
npm install
npm run icons        # (re)generate icon PNGs — replace with final artwork first
npm test             # 71 tests
npm run lint:firefox # web-ext lint — must be 0 errors
npm run package      # -> web-ext-artifacts/browsersync-chrome-<v>.zip and -firefox-<v>.zip
```

`npm run package` bundles each target into its own `dist/` and zips it with
`web-ext`. The version in the filename comes from the manifest `version` — bump
it in **both** `manifest.chrome.json` and `manifest.firefox.json` per release.

## Chrome Web Store
1. Create a developer account (one-time fee) at the Chrome Web Store Developer
   Dashboard.
2. Upload `browsersync-chrome-<v>.zip`.
3. Fill the listing (see `STORE.md`), add screenshots + the 128px icon, and the
   privacy policy URL (host `PRIVACY.md`).
4. Justify permissions in the review notes (see `STORE.md` → Permission
   justifications). Submit for review.

## Firefox AMO
1. Create an account at addons.mozilla.org.
2. Upload `browsersync-firefox-<v>.zip`. AMO signs it and (for listed add-ons)
   distributes + auto-updates it.
3. Provide the same listing + privacy policy. Because the source is bundled
   (esbuild), include build instructions for reviewers: `npm install && npm run
   build:firefox`, output in `dist/firefox`.

### Self-distribution (optional)
For a signed `.xpi` outside AMO, use `web-ext sign` with AMO API credentials,
then host the `.xpi` + an `update.json` and set `browser_specific_settings.
gecko.update_url`. Not needed if you list on AMO.

## GitHub Releases (hosting the zips)

Build artifacts are **not** committed (`*.zip` and `web-ext-artifacts/` are
gitignored) — they're reproducible with `npm run package`. To host downloadable
builds on GitHub, attach the zips to a tagged Release:

**Web UI:** Repo → Releases → Draft a new release → create tag `v<version>` →
drag in `web-ext-artifacts/browsersync-{chrome,firefox}-<version>.zip` → Publish.

**`gh` CLI:**
```bash
cd extension && npm run package
gh release create v0.1.0 \
  web-ext-artifacts/browsersync-chrome-0.1.0.zip \
  web-ext-artifacts/browsersync-firefox-0.1.0.zip \
  --title "BrowserSync v0.1.0" --notes "First packaged release"
```

Releases are best as a developer/sideload archive; for end users prefer the web
stores (install + auto-update). Keep the Release tag in sync with the manifest
`version`.

## The companion agent (separate download)
The agent is **not** part of the store package. Distribute it from the repo.
Users run it via `agent/run-agent.sh` (created by `setup.sh`) or a service:

- **Linux (systemd, per-user):** see `agent/install/browsersync-agent.service`.
- **macOS (launchd):** see `agent/install/com.browsersync.agent.plist`.
- **Windows:** run `node index.js` (e.g. via Task Scheduler) with `PORT`,
  `SYNC_FILE`, `TOKEN` env vars.

Most users who choose **WebDAV** need no agent at all.

## Release checklist
1. Bump `version` in both manifests (and `STATE_SCHEMA_VERSION` /
   `PROTOCOL_VERSION` only on incompatible changes — see `docs/UPDATES.md`).
2. `npm test` green, `npm run lint:firefox` clean.
3. `npm run package`.
4. Upload to both stores; update listing if features changed.
5. Tag the release in git.
