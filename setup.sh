#!/usr/bin/env bash
#
# BrowserSync — interactive setup / bootstrap.
#
# Clones (or updates) the repo, installs dependencies, builds the extension for
# both browser families, and configures + optionally starts the local sync
# agent. Safe to run repeatedly (idempotent).
#
# Usage:
#   ./setup.sh                      # interactive
#   curl -fsSL <raw-url>/setup.sh | bash
#
# Non-interactive / automation (any of these skip the matching prompt):
#   NONINTERACTIVE=1 INSTALL_DIR=~/browsersync AGENT_TOKEN=secret \
#   SYNC_FILE=~/Drive/bsync.json AGENT_PORT=8787 ./setup.sh
#
set -euo pipefail

# --- Config defaults (override via env) -------------------------------------
REPO_URL="${REPO_URL:-https://github.com/proairface/claude-test.git}"
DEFAULT_INSTALL_DIR="${HOME}/browsersync"
DEFAULT_PORT="8787"
NONINTERACTIVE="${NONINTERACTIVE:-0}"

# --- Pretty output ----------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YEL=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; BLU=""; RST=""
fi
say()  { printf '%s\n' "$*"; }
info() { printf '%s➜%s %s\n' "$BLU" "$RST" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$*" "$RST" >&2; exit 1; }
hr()   { printf '%s%s%s\n' "$DIM" "------------------------------------------------------------" "$RST"; }

# --- Prompt helpers (work under `curl | bash` via /dev/tty) ------------------
have_tty() { [ "$NONINTERACTIVE" != "1" ] && [ -e /dev/tty ]; }

# ask_var VARNAME "Prompt text" "default"
#   Keeps an already-set non-empty env var; else prompts; else uses default.
ask_var() {
  local name="$1" prompt="$2" def="${3:-}" cur ans
  cur="$(eval "printf '%s' \"\${$name:-}\"")"
  if [ -n "$cur" ]; then ok "$prompt: $cur ${DIM}(from env)${RST}"; return; fi
  if have_tty; then
    if [ -n "$def" ]; then
      read -r -p "$(printf '%s%s%s [%s]: ' "$BOLD" "$prompt" "$RST" "$def")" ans < /dev/tty || ans=""
    else
      read -r -p "$(printf '%s%s%s: ' "$BOLD" "$prompt" "$RST")" ans < /dev/tty || ans=""
    fi
    ans="${ans:-$def}"
  else
    ans="$def"
  fi
  printf -v "$name" '%s' "$ans"
}

confirm() { # confirm "Question?" [default:y|n] -> 0 yes / 1 no
  local q="$1" def="${2:-y}" ans hint
  [ "$def" = "y" ] && hint="[Y/n]" || hint="[y/N]"
  if ! have_tty; then [ "$def" = "y" ]; return; fi
  read -r -p "$(printf '%s%s%s %s: ' "$BOLD" "$q" "$RST" "$hint")" ans < /dev/tty || ans=""
  ans="${ans:-$def}"
  case "$ans" in [yY]*) return 0;; *) return 1;; esac
}

expand_tilde() { case "$1" in "~"|"~/"*) printf '%s' "${HOME}${1#\~}";; *) printf '%s' "$1";; esac; }

gen_token() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
  elif command -v xxd >/dev/null 2>&1; then head -c 16 /dev/urandom | xxd -p | tr -d '\n'
  else date +%s | sha1sum 2>/dev/null | cut -c1-32 || echo "change-me-$(date +%s)"; fi
}

# --- Node.js handling -------------------------------------------------------
# Order of preference: a usable system Node (>=18) -> an already-bootstrapped
# project-local Node -> download a project-local Node into <project>/.node.
# The local copy needs no sudo and is removed when the project folder is (or by
# uninstall.sh). Set NO_NODE_BOOTSTRAP=1 to require a system Node instead.
NODE_LTS_LINE="${NODE_LTS_LINE:-latest-v20.x}"   # nodejs.org dist line
NODE_BIN="node"                                   # resolved by ensure_node

detect_node_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x64;;
    aarch64|arm64) echo arm64;;
    armv7l) echo armv7l;;
    ppc64le) echo ppc64le;; s390x) echo s390x;;
    *) echo "";;
  esac
}

node_ok() { # node_ok <node-binary> -> 0 if it runs and is >=18
  local maj; maj="$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || return 1
  [ -n "$maj" ] && [ "$maj" -ge 18 ] 2>/dev/null
}

bootstrap_local_node() { # downloads Node into $LOCAL_NODE_DIR; 0 on success
  local os arch file url tmp ex idx
  os="$(uname -s)"
  [ "$os" = "Linux" ] || { warn "Auto-download here supports Linux only; on $os install Node 18+ manually."; return 1; }
  arch="$(detect_node_arch)"
  [ -n "$arch" ] || { warn "Unsupported CPU arch '$(uname -m)' for auto-download."; return 1; }
  command -v tar >/dev/null 2>&1 || { warn "tar is required to unpack Node."; return 1; }
  local have_curl=0
  if command -v curl >/dev/null 2>&1; then have_curl=1
  elif command -v wget >/dev/null 2>&1; then have_curl=0
  else warn "curl or wget is required to download Node."; return 1; fi

  if [ -n "${NODE_VERSION:-}" ]; then
    file="node-${NODE_VERSION}-linux-${arch}.tar.xz"
    url="https://nodejs.org/dist/${NODE_VERSION}/${file}"
  else
    if [ "$have_curl" = 1 ]; then idx="$(curl -fsSL "https://nodejs.org/dist/${NODE_LTS_LINE}/" || true)"
    else idx="$(wget -qO- "https://nodejs.org/dist/${NODE_LTS_LINE}/" || true)"; fi
    file="$(printf '%s' "$idx" | grep -oE "node-v[0-9.]+-linux-${arch}\.tar\.xz" | head -1)"
    [ -n "$file" ] || { warn "Could not determine the Node download URL (network?)."; return 1; }
    url="https://nodejs.org/dist/${NODE_LTS_LINE}/${file}"
  fi

  info "Downloading ${file} …"
  tmp="$(mktemp -d)"
  if [ "$have_curl" = 1 ]; then curl -fL --progress-bar "$url" -o "$tmp/node.tar.xz" || { warn "Download failed: $url"; rm -rf "$tmp"; return 1; }
  else wget -q "$url" -O "$tmp/node.tar.xz" || { warn "Download failed: $url"; rm -rf "$tmp"; return 1; }; fi
  tar -xJf "$tmp/node.tar.xz" -C "$tmp" 2>/dev/null || { warn "Extract failed (tar needs xz support)."; rm -rf "$tmp"; return 1; }
  ex="$(find "$tmp" -maxdepth 1 -type d -name 'node-v*' | head -1)"
  [ -n "$ex" ] || { warn "Unexpected archive layout."; rm -rf "$tmp"; return 1; }
  rm -rf "$LOCAL_NODE_DIR"; mkdir -p "$LOCAL_NODE_DIR"
  cp -a "$ex/." "$LOCAL_NODE_DIR/"
  rm -rf "$tmp"
}

ensure_node() {
  LOCAL_NODE_DIR="$PROJECT_DIR/.node"
  if command -v node >/dev/null 2>&1 && node_ok node; then
    NODE_BIN="$(command -v node)"; ok "Using system node $(node -v), npm $(npm -v)"; return
  fi
  if [ -x "$LOCAL_NODE_DIR/bin/node" ] && node_ok "$LOCAL_NODE_DIR/bin/node"; then
    export PATH="$LOCAL_NODE_DIR/bin:$PATH"; NODE_BIN="$LOCAL_NODE_DIR/bin/node"
    ok "Using project-local node $(node -v), npm $(npm -v)"; return
  fi
  warn "Node.js 18+ was not found on your system."
  [ "${NO_NODE_BOOTSTRAP:-0}" = "1" ] && \
    die "Node 18+ required. Install from https://nodejs.org and re-run (NO_NODE_BOOTSTRAP is set)."
  confirm "Download a project-local Node into $LOCAL_NODE_DIR (no sudo, removed with the folder)?" y || \
    die "Node 18+ required. Install from https://nodejs.org and re-run."
  if bootstrap_local_node && [ -x "$LOCAL_NODE_DIR/bin/node" ] && node_ok "$LOCAL_NODE_DIR/bin/node"; then
    export PATH="$LOCAL_NODE_DIR/bin:$PATH"; NODE_BIN="$LOCAL_NODE_DIR/bin/node"
    ok "Installed project-local node $(node -v), npm $(npm -v)"
  else
    die "Could not set up Node automatically. Install Node 18+ from https://nodejs.org and re-run."
  fi
}

# --- 0. Prerequisites -------------------------------------------------------
# Node is handled later (after the project dir is known) so a project-local
# Node can be installed inside it. Only git is required up front.
hr; say "${BOLD}BrowserSync setup${RST}"; hr
info "Checking prerequisites…"
command -v git  >/dev/null 2>&1 || die "git is required but not found. Install git and re-run."
ok "git $(git --version | awk '{print $3}')"

# --- 1. Locate or clone the repo --------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
if [ -d "$SCRIPT_DIR/extension" ] && [ -d "$SCRIPT_DIR/agent" ]; then
  # Running from inside an existing checkout.
  PROJECT_DIR="$SCRIPT_DIR"
  ok "Using existing checkout at $PROJECT_DIR"
  if [ -d "$PROJECT_DIR/.git" ] && confirm "Pull latest changes from origin?" n; then
    git -C "$PROJECT_DIR" pull --ff-only || warn "Could not fast-forward; continuing with current checkout."
  fi
else
  ask_var INSTALL_DIR "Where should the project live?" "$DEFAULT_INSTALL_DIR"
  INSTALL_DIR="$(expand_tilde "$INSTALL_DIR")"
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Repo already present at $INSTALL_DIR — updating…"
    git -C "$INSTALL_DIR" pull --ff-only || warn "Could not fast-forward; continuing."
  else
    [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ] && \
      die "$INSTALL_DIR exists and is not empty. Pick another path or remove it."
    info "Cloning $REPO_URL → $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  PROJECT_DIR="$INSTALL_DIR"
fi

# --- 1b. Ensure Node.js (system, or project-local download) -----------------
hr; info "Checking Node.js…"
ensure_node

# --- 2. Build the extension -------------------------------------------------
hr; info "Installing extension dependencies (npm install)…"
( cd "$PROJECT_DIR/extension" && npm install --no-audit --no-fund )

if confirm "Run the test suite to verify the build?"; then
  ( cd "$PROJECT_DIR/extension" && npm test ) && ok "Tests passed." || warn "Tests reported failures — see output above."
fi

info "Building extension for Chrome and Firefox…"
( cd "$PROJECT_DIR/extension" && npm run build )
ok "Built: $PROJECT_DIR/extension/dist/chrome  and  $PROJECT_DIR/extension/dist/firefox"

# --- 3. Configure the agent -------------------------------------------------
hr; say "${BOLD}Local sync agent${RST}"

# Offer to point the sync file at a detected cloud-synced folder.
suggest_sync_file() {
  local c
  for c in "$HOME/Dropbox" "$HOME/OneDrive" "$HOME/OneDrive - Personal" \
           "$HOME/Google Drive" "$HOME/Library/CloudStorage"/*; do
    [ -d "$c" ] && { printf '%s/browsersync/state.json' "$c"; return; }
  done
  printf '%s/agent/state.json' "$PROJECT_DIR"
}
DEFAULT_SYNC_FILE="$(suggest_sync_file)"

ask_var SYNC_FILE  "Path to the shared sync file (a cloud folder syncs across machines)" "$DEFAULT_SYNC_FILE"
SYNC_FILE="$(expand_tilde "$SYNC_FILE")"
ask_var AGENT_PORT "Agent port" "$DEFAULT_PORT"
ask_var AGENT_TOKEN "Shared secret token (blank = generate one)" ""
[ -n "$AGENT_TOKEN" ] || { AGENT_TOKEN="$(gen_token)"; ok "Generated token: $AGENT_TOKEN"; }

mkdir -p "$(dirname "$SYNC_FILE")"

# Persist config + a convenience launcher in the agent dir.
CONFIG_FILE="$PROJECT_DIR/agent/browsersync.env"
cat > "$CONFIG_FILE" <<EOF
# BrowserSync agent config (generated by setup.sh)
export TOKEN="$AGENT_TOKEN"
export SYNC_FILE="$SYNC_FILE"
export PORT="$AGENT_PORT"
# Node binary to run the agent with (system node, or the project-local copy).
export NODE_BIN="$NODE_BIN"
EOF

LAUNCHER="$PROJECT_DIR/agent/run-agent.sh"
cat > "$LAUNCHER" <<'EOF'
#!/usr/bin/env bash
# Start the BrowserSync agent with the saved config.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=/dev/null
source ./browsersync.env
echo "Starting agent on http://127.0.0.1:${PORT}  (sync file: ${SYNC_FILE})"
exec "${NODE_BIN:-node}" index.js
EOF
chmod +x "$LAUNCHER"
ok "Wrote agent config → $CONFIG_FILE"
ok "Wrote launcher    → $LAUNCHER"

# --- 4. Summary + next steps ------------------------------------------------
hr; say "${BOLD}${GRN}Setup complete!${RST}"; hr
cat <<EOF
${BOLD}Agent${RST}
  Start it anytime with:   ${BLU}$LAUNCHER${RST}
  URL:    http://127.0.0.1:${AGENT_PORT}
  Token:  ${AGENT_TOKEN}
  File:   ${SYNC_FILE}

${BOLD}Load the extension${RST}
  Chrome/Brave/Vivaldi:  open chrome://extensions → enable Developer mode →
                         "Load unpacked" → select
                         ${BLU}$PROJECT_DIR/extension/dist/chrome${RST}
  Firefox:               open about:debugging#/runtime/this-firefox →
                         "Load Temporary Add-on" → select
                         ${BLU}$PROJECT_DIR/extension/dist/firefox/manifest.json${RST}

${BOLD}In each browser's Options${RST}
  Transport = Local agent · Agent URL = http://127.0.0.1:${AGENT_PORT} · Token = ${AGENT_TOKEN}
  Then add a bookmark and click "Sync now" (push on one browser, pull on the other).

Full walkthrough: ${BLU}$PROJECT_DIR/docs/TRY-IT.md${RST}
EOF

if confirm "Start the agent now (foreground; Ctrl-C to stop)?" n; then
  hr; exec "$LAUNCHER"
fi
