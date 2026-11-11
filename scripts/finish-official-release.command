#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(cat web/VERSION)
profile=${NOTARY_PROFILE:-ghetto-scopez-notary}
log="$(pwd)/docs/release-$version-terminal.log"
exec > >(tee "$log") 2>&1
# Confirm that the existing Keychain profile is available.
xcrun notarytool history --keychain-profile "$profile" --output-format json >/dev/null
gtap=${1:-build/GTap.ofx.bundle.zip}
downloads=$(mktemp -d "${TMPDIR:-/tmp}/galaxy-scopez-node.XXXXXX")
trap 'rm -rf "$downloads"' EXIT
node_release=v24.22.1
node_url="https://nodejs.org/dist/$node_release"
curl -fsSL --retry 2 "$node_url/SHASUMS256.txt" -o "$downloads/galaxy-node-shasums.txt"
for arch in arm64 x64; do
  curl -fsSL --retry 2 "$node_url/node-$node_release-darwin-$arch.tar.gz" -o "$downloads/galaxy-node-$arch.tar.gz"
done
python3 scripts/package-macos.py --downloads "$downloads" --gtap "$gtap"
NOTARY_PROFILE="$profile" bash scripts/notarize-macos.sh "../Galaxy-Scopez-$version-mac.pkg"
echo 'Signing and notarisation complete. Return to Codex to publish the verified installer.'
