#!/usr/bin/env bash
#
# BrowserSync — interactive, safe uninstaller.
#
# Removes what this project installed, with explicit confirmation for anything
# destructive and hard guards against deleting unsafe paths. Your sync DATA and
# the whole project folder are preserved by default — you opt in to removing
# them.
#
# Usage:
#   ./uninstall.sh                 # interactive
#   ./uninstall.sh --dry-run       # show what would happen, change nothing
#
# Non-interactive (each defaults to 0 = keep):
#   NONINTERACTIVE=1 STOP_AGENT=1 REMOVE_BUILD=1 REMOVE_GENERATED=1 \
#   REMOVE_SYNC_FILE=0 REMOVE_PROJECT=0 ./uninstall.sh
#
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
NONINTERACTIVE="${NONINTERACTIVE:-0}"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YEL=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; BLU=""; RST=""
fi
info() { printf '%s➜%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
hr()   { printf '%s%s%s\n' "$DIM" "------------------------------------------------------------" "$RST"; }

have_tty() { [ "$NONINTERACTIVE" != "1" ] && [ -e /dev/tty ]; }

# confirm "Question?" [default:y|n] ; honors env override $2varname if set via caller
confirm() {
  local q="$1" def="${2:-n}" ans hint
  [ "$def" = "y" ] && hint="[Y/n]" || hint="[y/N]"
  if ! have_tty; then [ "$def" = "y" ]; return; fi
  read -r -p "$(printf '%s%s%s %s: ' "$BOLD" "$q" "$RST" "$hint")" ans < /dev/tty || ans=""
  ans="${ans:-$def}"
  case "$ans" in [yY]*) return 0;; *) return 1;; esac
}

# env_or_confirm VARNAME "Question?" default  -> 0/1
env_or_confirm() {
  local name="$1" q="$2" def="${3:-n}" v
  v="$(eval "printf '%s' \"\${$name:-}\"")"
  if [ -n "$v" ]; then [ "$v" = "1" ]; return; fi
  confirm "$q" "$def"
}

# Hard guard: refuse to delete obviously dangerous paths.
assert_safe_path() {
  local p="$1" dir base abs depth
  [ -n "$p" ] || die "Refusing to remove an empty path."
  case "$p" in /|//|///*) die "Refusing to remove root: $p";; esac
  dir="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)" || dir=""
  base="$(basename "$p")"
  if [ -z "$dir" ]; then abs="$p"
  elif [ "$dir" = "/" ]; then abs="/$base"        # avoid building "//root"
  else abs="$dir/$base"; fi
  abs="$(printf '%s' "$abs" | sed 's://*:/:g')"    # collapse any duplicate slashes
  case "$abs" in
    "/"|"$HOME"|"$HOME/"|"/root"|"/home"|"/Users"|"/etc"|"/usr"|"/var"|"/bin"|"/opt")
      die "Refusing to remove unsafe path: $abs";;
  esac
  depth="$(printf '%s' "${abs#/}" | awk -F/ 'NF{print NF}')"
  [ "${depth:-0}" -ge 2 ] || die "Refusing to remove shallow path: $abs"
}

rm_path() { # rm_path <path> <label>
  local p="$1" label="$2"
  [ -e "$p" ] || { ok "$label already absent."; return; }
  assert_safe_path "$p"
  if [ "$DRY_RUN" = "1" ]; then warn "[dry-run] would remove $label: $p"; return; fi
  rm -rf -- "$p"
  ok "Removed $label: $p"
}

# --- Locate the project + saved config --------------------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
[ -d "$PROJECT_DIR/agent" ] && [ -d "$PROJECT_DIR/extension" ] \
  || die "This doesn't look like the BrowserSync project root ($PROJECT_DIR)."

PORT="8787"; SYNC_FILE=""
if [ -f "$PROJECT_DIR/agent/browsersync.env" ]; then
  # shellcheck source=/dev/null
  source "$PROJECT_DIR/agent/browsersync.env" || true
  PORT="${PORT:-8787}"
fi

hr; printf '%sBrowserSync uninstall%s' "$BOLD" "$RST"
[ "$DRY_RUN" = "1" ] && printf ' %s(dry-run)%s' "$YEL" "$RST"; printf '\n'; hr
info "Project: $PROJECT_DIR"
[ -n "$SYNC_FILE" ] && info "Sync file (data): $SYNC_FILE"
info "Agent port: $PORT"
echo

# --- 1. Stop the agent if it's running --------------------------------------
agent_pids() {
  if command -v lsof >/dev/null 2>&1; then lsof -ti tcp:"$PORT" 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then fuser "$PORT"/tcp 2>/dev/null | tr -d ' ' || true
  else printf ''; fi
}
PIDS="$(agent_pids)"
if [ -n "$PIDS" ]; then
  warn "An agent appears to be listening on port $PORT (pid: $PIDS)."
  if env_or_confirm STOP_AGENT "Stop the running agent?" y; then
    if [ "$DRY_RUN" = "1" ]; then warn "[dry-run] would kill: $PIDS"
    else kill $PIDS 2>/dev/null || true; sleep 1; ok "Agent stopped."; fi
  fi
else
  ok "No agent running on port $PORT."
fi

# --- 2. Build artifacts + dependencies (safe, regenerable) ------------------
if env_or_confirm REMOVE_BUILD "Remove build output and node_modules (dist/, node_modules)?" y; then
  rm_path "$PROJECT_DIR/extension/dist" "extension build output"
  rm_path "$PROJECT_DIR/extension/node_modules" "extension node_modules"
fi

# --- 3. Generated agent files (config, launcher, local state) ---------------
if env_or_confirm REMOVE_GENERATED "Remove generated agent files (browsersync.env, run-agent.sh)?" y; then
  rm_path "$PROJECT_DIR/agent/browsersync.env" "agent config"
  rm_path "$PROJECT_DIR/agent/run-agent.sh" "agent launcher"
fi

# --- 4. Sync DATA — preserved unless explicitly requested -------------------
if [ -n "$SYNC_FILE" ] && [ -e "$SYNC_FILE" ]; then
  warn "The sync file is your DATA (bookmarks/etc.): $SYNC_FILE"
  case "$SYNC_FILE" in
    "$HOME/Dropbox"/*|*"/OneDrive"*|*"/Google Drive"*|*"/CloudStorage"/*)
      warn "It looks like it's in a CLOUD folder — deleting it removes it from every synced machine.";;
  esac
  if env_or_confirm REMOVE_SYNC_FILE "Delete the sync data file?" n; then
    rm_path "$SYNC_FILE" "sync data file"
    # Remove its parent dir only if now empty.
    parent="$(dirname "$SYNC_FILE")"
    if [ -d "$parent" ] && [ -z "$(ls -A "$parent" 2>/dev/null)" ]; then
      rm_path "$parent" "empty sync data folder"
    fi
  else
    ok "Kept sync data: $SYNC_FILE"
  fi
fi

# --- 5. The whole project folder (the clone) --------------------------------
if env_or_confirm REMOVE_PROJECT "Remove the ENTIRE project folder ($PROJECT_DIR)?" n; then
  assert_safe_path "$PROJECT_DIR"
  if [ "$DRY_RUN" = "1" ]; then
    warn "[dry-run] would remove project folder: $PROJECT_DIR"
  else
    TARGET="$PROJECT_DIR"; cd "$(dirname "$TARGET")"   # step out so rm can succeed
    rm -rf -- "$TARGET"; ok "Removed project folder: $TARGET"
  fi
fi

# --- 6. The part a script can't do: the browser side ------------------------
hr; printf '%sManual steps (a script cannot touch your browser):%s\n' "$BOLD" "$RST"
cat <<EOF
  Chrome/Brave/Vivaldi:  open chrome://extensions → find "BrowserSync" → Remove.
                         (This also clears its stored config + device id.)
  Firefox:               open about:debugging#/runtime/this-firefox → Remove,
                         or just restart Firefox (temporary add-ons auto-remove).

That's the complete footprint. No services, PATH entries, shell-rc edits, global
packages, or system files were ever created, so nothing else remains.
EOF
hr; ok "Uninstall finished."
