#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  run.sh — single-command startup for the Collaborative Document
#  Editor (backend API + collab WebSocket server + React frontend).
#
#  Usage:
#    ./run.sh            # start all three services
#    ./run.sh --install   # install dependencies first, then start
#    ./run.sh --stop      # kill any previously started services
#
#  Prerequisites:
#    • Python 3.10+   (for FastAPI backend)
#    • Node.js 18+    (for collab server & React frontend)
#    • npm            (for Node dependencies)
#    • pip            (for Python dependencies)
#    • A .env file at the repo root (copy .env.example and fill in)
#
#  The script starts three processes in the background and stores
#  their PIDs in .run.pids so they can be stopped cleanly.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT_DIR/.run.pids"
LOG_DIR="$ROOT_DIR/.logs"

# Colours for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

# ── helpers ──────────────────────────────────────────────────────

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

cleanup() {
    if [ -f "$PID_FILE" ]; then
        info "Stopping services …"
        while IFS= read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null && ok "Stopped PID $pid" || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
}

stop_services() {
    cleanup
    ok "All services stopped."
    exit 0
}

# ── handle --stop flag ───────────────────────────────────────────

if [[ "${1:-}" == "--stop" ]]; then
    stop_services
fi

# ── pre-flight checks ───────────────────────────────────────────

command -v python3 >/dev/null 2>&1 || { error "python3 is required but not found."; exit 1; }
command -v node    >/dev/null 2>&1 || { error "node is required but not found.";    exit 1; }
command -v npm     >/dev/null 2>&1 || { error "npm is required but not found.";     exit 1; }

# ── load .env (if it exists) ────────────────────────────────────

if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
    ok "Loaded .env"
elif [ -f "$ROOT_DIR/.env.example" ]; then
    warn "No .env file found. Copy .env.example to .env and fill in your secrets."
    warn "  cp .env.example .env"
    exit 1
fi

# ── dependency install (optional) ───────────────────────────────

if [[ "${1:-}" == "--install" ]]; then
    info "Installing backend Python dependencies …"
    pip install -r "$ROOT_DIR/backend/requirements.txt" --quiet

    info "Installing collab server Node dependencies …"
    (cd "$ROOT_DIR/backend/collab" && npm install --silent)

    info "Installing frontend Node dependencies …"
    (cd "$ROOT_DIR/frontend" && npm install --silent)

    ok "All dependencies installed."
fi

# ── clean up any previous run ────────────────────────────────────

cleanup

mkdir -p "$LOG_DIR"

# ── read ports from env (with defaults) ─────────────────────────

API_PORT="${API_PORT:-4000}"
COLLAB_PORT="${COLLAB_PORT:-1234}"
FRONTEND_PORT="${VITE_PORT:-5173}"

# ── 1. Start FastAPI backend ────────────────────────────────────

info "Starting FastAPI backend on port $API_PORT …"
(
    cd "$ROOT_DIR/backend"
    python3 -m uvicorn api.main:app \
        --host 0.0.0.0 \
        --port "$API_PORT" \
        --reload \
        > "$LOG_DIR/backend.log" 2>&1
) &
echo $! >> "$PID_FILE"
ok "Backend PID: $!"

# ── 2. Start collab WebSocket server ────────────────────────────

info "Starting collab WebSocket server on port $COLLAB_PORT …"
(
    cd "$ROOT_DIR/backend/collab"
    node server.js \
        > "$LOG_DIR/collab.log" 2>&1
) &
echo $! >> "$PID_FILE"
ok "Collab server PID: $!"

# ── 3. Start React frontend ────────────────────────────────────

info "Starting React frontend on port $FRONTEND_PORT …"
(
    cd "$ROOT_DIR/frontend"
    npx vite --port "$FRONTEND_PORT" --host \
        > "$LOG_DIR/frontend.log" 2>&1
) &
echo $! >> "$PID_FILE"
ok "Frontend PID: $!"

# ── summary ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  All services started successfully!                  ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Backend API   → ${CYAN}http://localhost:${API_PORT}${NC}              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Collab WS     → ${CYAN}ws://localhost:${COLLAB_PORT}${NC}              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Frontend      → ${CYAN}http://localhost:${FRONTEND_PORT}${NC}            ${GREEN}║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Logs: ${YELLOW}.logs/backend.log${NC}  ${YELLOW}.logs/collab.log${NC}          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}        ${YELLOW}.logs/frontend.log${NC}                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Stop: ${YELLOW}./run.sh --stop${NC}                              ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── trap Ctrl+C to kill all children ────────────────────────────

trap cleanup EXIT INT TERM

# ── keep script alive (foreground) ──────────────────────────────
# Wait for all background processes; if any exits, we keep running.

wait

