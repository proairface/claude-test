# Uninstalling / footprint

BrowserSync is built to leave a small, predictable footprint and to come off
cleanly. This page lists **everything** it touches and how to remove it.

## The complete footprint

| What | Where | Created by |
| --- | --- | --- |
| Project code + `node_modules` + `dist/` | your clone folder (e.g. `~/browsersync`) | `git clone` + `npm install` + build |
| `agent/browsersync.env`, `agent/run-agent.sh` | inside the project | `setup.sh` |
| `agent/state.json` (or your chosen sync file) | wherever `SYNC_FILE` points (can be a cloud folder) | the agent, at runtime — **this is your data** |
| Agent process | a foreground `node` process you start yourself | you, via the launcher |
| Extension + its `storage.local` (config, device id) | inside each browser's profile | loading the unpacked/temporary extension |

That's the whole list. BrowserSync deliberately does **not** create any of the
things that usually make software hard to remove:

- ❌ no `sudo` / root install, no files in `/usr`, `/etc`, `/Library`, `Program Files`
- ❌ no system service (`systemd`/launchd/Windows service) and no autostart
- ❌ no `PATH` changes, no edits to `.bashrc`/`.zshrc`/`.profile`
- ❌ no global npm packages (`npm install` is local to the project)
- ❌ no native-messaging host registration, no registry entries
- ❌ no telemetry/network calls except to the agent URL you configure

## Automated removal

From the project root:

```bash
./uninstall.sh            # interactive, asks before anything destructive
./uninstall.sh --dry-run  # show exactly what it would do, change nothing
```

It will, with confirmation for each step:
1. **Stop the agent** if one is listening on the configured port.
2. **Remove build output + `node_modules`** (safe — regenerable).
3. **Remove generated agent files** (`browsersync.env`, `run-agent.sh`).
4. **Leave your sync data alone by default** — deleting it is a separate,
   opt-in prompt, with an extra warning if it sits in a cloud folder (deleting
   there removes it from every synced machine).
5. **Optionally remove the entire project folder** (off by default).

Safety: the script refuses to delete root, `$HOME`, and other shallow/critical
paths, normalizes paths first, and supports `--dry-run`.

### Non-interactive

```bash
NONINTERACTIVE=1 STOP_AGENT=1 REMOVE_BUILD=1 REMOVE_GENERATED=1 \
REMOVE_SYNC_FILE=0 REMOVE_PROJECT=0 ./uninstall.sh
```

## Manual removal (equivalent, if you prefer)

```bash
# 1. Stop the agent (Ctrl-C in its terminal, or):
lsof -ti tcp:8787 | xargs kill        # use your configured PORT

# 2. Delete the project folder:
rm -rf ~/browsersync                  # your install dir

# 3. (Optional) delete your sync data file:
rm -f /path/to/state.json             # your SYNC_FILE
```

## The browser side (a script can't do this)

- **Chrome / Brave / Vivaldi:** `chrome://extensions` → BrowserSync → **Remove**.
  This also clears its stored config and device id.
- **Firefox:** `about:debugging#/runtime/this-firefox` → **Remove**, or just
  restart Firefox — temporary add-ons are removed automatically.

After those steps, nothing of BrowserSync remains on your machine.
