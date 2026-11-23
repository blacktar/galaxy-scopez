#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if curl --fail --silent --max-time 1 http://127.0.0.1:8765/api/tap-info >/dev/null; then
  echo 'A GS server is already running on port 8765.'
  echo 'Choose GS > Stop Server, then run this script again.'
  exit 1
fi
command -v node >/dev/null
command -v python3 >/dev/null
mkdir -p docs/reverse-scopes
echo 'Starting the managed GS grading audition session.'
echo 'Stopping leaves the current correction in Resolve; Restore starting grade first if wanted.'
exec node scripts/grading-session.mjs serve
