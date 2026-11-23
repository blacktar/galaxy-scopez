#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/native-contrast-panel-test.py
