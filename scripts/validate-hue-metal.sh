#!/bin/bash
# Run from Terminal on the development Mac. No install, app restart or download.
set -euo pipefail
cd "$(dirname "$0")/.."
output="$(pwd)/docs/hue-metal-validation"
mkdir -p "$output" build
exec > >(tee "$output/validation.log") 2>&1
trap 'echo "FAILED at line $LINENO. Send validation.log; no installation was performed."' ERR
node_bin="${NODE_BINARY:-$(command -v node || true)}"
if [[ -z "$node_bin" ]]; then
 node_bin="/Applications/Galaxy Scopez.app/Contents/Resources/runtime/node"
 [[ -x "$node_bin" ]] || node_bin="/Applications/Ghetto Scopez.app/Contents/Resources/runtime/node"
fi
[[ -x "$node_bin" ]] || { echo 'Node runtime not found.'; exit 1; }
echo 'Compile and validate Hue histogram Metal support; no installation.'
date
python3 scripts/embed-metal.py
xcrun clang++ -std=c++17 -O2 -fobjc-arc -fblocks ofx/metal-analysis-test.mm ofx/MetalAnalysis.mm -framework Metal -framework Foundation -lz -o build/metal-analysis-test
"$node_bin" web/prepare-hue-metal.mjs "$output"
build/metal-analysis-test "$output/manifest.json" | tee "$output/gpu-timings.log"
METAL_VALIDATION_DIR="$output" "$node_bin" web/metal-validation.mjs compare | tee "$output/comparison.log"
echo "PASS — GPU hue output matches the independent float32 reference."
echo "Results: $output/validation.log"
echo "Timings: $output/gpu-timings.log (synthetic 4K test; not Resolve playback FPS)"
