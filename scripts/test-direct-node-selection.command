#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Release the existing worker's panel socket; keep the GS host running.
if node scripts/grading-session.mjs status >/dev/null 2>&1; then
  node scripts/grading-session.mjs reload-worker
fi
exec python3 scripts/test-direct-node-selection.py
