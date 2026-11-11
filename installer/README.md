# Signed macOS installer

The package installs the universal GTap plug-in, Galaxy Scopez menu-bar app,
bundled Node runtime/native analysis and a system LaunchAgent. Postinstall creates
an actual Finder alias on the logged-in user's Desktop without overwriting an
unrelated item, then starts the app in that user's login session. The app owns
only its child host process; Start/Stop/Quit do not terminate another host.

Prerequisites: Xcode, valid Developer ID Application and Developer ID Installer
identities with private keys, pinned web dependencies, and the existing prebuilt
GTap/native payloads in release/. No Apple passwords belong in source files.

Download the official Node24.22.1 Darwin arm64 and x64 tar.gz archives and
SHASUMS256.txt into /tmp as galaxy-node-arm64.tar.gz, galaxy-node-x64.tar.gz and
galaxy-node-shasums.txt. The packaging script verifies those executable archives.

Run `python3 scripts/package-macos.py --gtap build/GTap.ofx.bundle.zip` from the repository. Signing happens in
/private/tmp/galaxy-scopez-macos-installer to avoid file-provider Finder metadata.
Identity overrides are available through the script's --help. --resume reuses
staging after signing-only fixes; it does not refresh payloads or compile changes.

Run `bash scripts/notarize-macos.sh ../Galaxy-Scopez-VERSION-mac.pkg` to submit,
retrieve Apple's log, staple the ticket and assess the package. The default
Keychain profile is ghetto-scopez-notary (override NOTARY_PROFILE). The output
package lives beside the repository in outputs/. Guide edits require explicit
user optical approval before guide diff packaging or publication.

Verified locally: both architectures compile; bundled Node/native host works on
Apple Silicon on an isolated port; Finder alias resolves; signed package accepted
by Apple, ticket stapled/validated, Gatekeeper install assessment accepted.
Installation confirmed working by the user on 2026-10-25. This confirmation
does not separately establish upgrade, subsequent-login or Intel-hardware coverage.
