#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
log="$(pwd)/docs/release-0.2.64-terminal.log"
exec > >(tee "$log") 2>&1
# Check the existing Keychain profile without printing credentials.
xcrun notarytool history --keychain-profile ghetto-scopez-notary --output-format json > /tmp/ghetto-scopez-notary-check.json
python3 scripts/package-macos.py --resume --runtime '/Applications/Ghetto Scopez.app/Contents/Resources/runtime' --gtap build/GTap-v1.2.27.ofx.bundle.zip
bash scripts/notarize-macos.sh '../Ghetto-Scopez-0.2.64-mac.pkg'
echo 'Signing and notarisation complete. Return to Codex to publish the verified installer.'
