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
python_pkg="$downloads/python-3.14.10-macos11.pkg"
curl -fsSL --retry 2 https://www.python.org/ftp/python/3.14.10/python-3.14.10-macos11.pkg -o "$python_pkg"
echo "286c7018aa2730f6747ca433dccdc2b31be45f078a9ea0ffa44d5f06368fd2d7  $python_pkg" | shasum -a 256 -c -
pkgutil --check-signature "$python_pkg"
pkgutil --expand-full "$python_pkg" "$downloads/python-source"
python3 scripts/prepare-python-runtime.py "$downloads/python-source/Python_Framework.pkg/Payload" "$downloads/python-runtime"
python3 scripts/package-macos.py --python-runtime "$downloads/python-runtime" --downloads "$downloads" --gtap "$gtap"
NOTARY_PROFILE="$profile" bash scripts/notarize-macos.sh "../Galaxy-Scopez-$version-mac.pkg"
echo 'Signing and notarisation complete. Return to Codex to publish the verified installer.'
