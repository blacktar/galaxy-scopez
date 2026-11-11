#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

output="$(mktemp -d "${TMPDIR:-/tmp}/galaxy-scopez-calibration.XXXXXX")"
export METAL_VALIDATION_DIR="$output/metal"
log="$output/validation.log"
echo "Validation log: $log"

status=0
{
  bash scripts/build-analysis.sh &&
  node --test web/calibration-reference.test.mjs &&
  SCOPE_ANALYSIS=js node --test web/calibration-reference.test.mjs &&
  bash scripts/test-metal-analysis.sh
} 2>&1 | tee "$log" || status=$?

echo "Validation exit status: $status" | tee -a "$log"
echo "Send back the log at $log"
exit "$status"
