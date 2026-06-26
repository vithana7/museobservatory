#!/usr/bin/env bash
#
# Muse Observatory — local runner.
#
#   ./dev.sh           Dev server (hot-reload). Use this while working.
#   ./dev.sh preview   Real production build, then preview it.
#                        This is "what actually ships" — use it to check the
#                        real bundle, asset paths, and what loads over the network.
#
# Plain and readable on purpose: this is a convenience wrapper, not infrastructure.

set -euo pipefail
cd "$(dirname "$0")"

# 1. Node must be present.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 18+ (https://nodejs.org) and try again."
  exit 1
fi

# 2. Install dependencies on first run (or after they're cleared).
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run)…"
  npm install
fi

MODE="${1:-dev}"

case "$MODE" in
  dev)
    echo "Starting dev server (hot-reload)…"
    # Open the browser shortly after Vite boots. macOS only; harmless elsewhere.
    if command -v open >/dev/null 2>&1; then
      ( sleep 2 && open http://localhost:5173/ ) &
    fi
    npm run dev
    ;;

  preview)
    echo "Building production bundle…"
    npm run build
    echo "Serving the production build…"
    if command -v open >/dev/null 2>&1; then
      ( sleep 2 && open http://localhost:4173/ ) &
    fi
    npm run preview
    ;;

  *)
    echo "Unknown mode: '$MODE'"
    echo "Usage: ./dev.sh [dev|preview]"
    exit 1
    ;;
esac
