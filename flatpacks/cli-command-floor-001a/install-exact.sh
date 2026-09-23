#!/usr/bin/env bash
set -euo pipefail
SHA="${1:-}"
REPO="Vado42-chris/xi-io-sdk"
NODE="${XIIO_NODE:-$HOME/.nvm/versions/node/v24.11.1/bin/node}"
DEST_ROOT="${XIIO_CLI_RELEASE_ROOT:-$HOME/.local/share/xi-io/cli/releases}"
case "$SHA" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "CLI_INSTALL_BLOCKED first_red=EXACT_40_CHAR_SHA_REQUIRED" >&2; exit 13 ;;
esac
[ -x "$NODE" ] || { echo "CLI_INSTALL_BLOCKED first_red=ARIES_NODE_MISSING" >&2; exit 13; }
RESOLVED="$(gh api "repos/$REPO/commits/$SHA" --jq .sha)"
[ "$RESOLVED" = "$SHA" ] || { echo "CLI_INSTALL_BLOCKED first_red=PROVIDER_SHA_MISMATCH" >&2; exit 13; }
DEST="$DEST_ROOT/$SHA"
if [ ! -f "$DEST/bin/xi.mjs" ]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  gh api "repos/$REPO/tarball/$SHA" > "$TMP/sdk.tgz"
  mkdir -p "$TMP/unpack" "$DEST_ROOT"
  tar -xzf "$TMP/sdk.tgz" -C "$TMP/unpack"
  SRC="$(find "$TMP/unpack" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -f "$SRC/bin/xi.mjs" ] || { echo "CLI_INSTALL_BLOCKED first_red=SDK_TARBALL_INVALID" >&2; exit 13; }
  mv "$SRC" "$DEST"
fi
BACKUP="$HOME/.local/state/xi-io/cli-install-backup"
mkdir -p "$BACKUP"
if [ -r "$HOME/.local/share/xi-io/cli/sdk.path" ]; then
  cp "$HOME/.local/share/xi-io/cli/sdk.path" "$BACKUP/sdk.path.before"
fi
"$NODE" "$DEST/bin/xi.mjs" install >/tmp/xiio-cli-install.json
ACTUAL="$(cat "$HOME/.local/share/xi-io/cli/sdk.path" | tr -d '\r\n')"
[ "$ACTUAL" = "$DEST" ] || { echo "CLI_INSTALL_BLOCKED first_red=INSTALL_POINTER_MISMATCH" >&2; exit 13; }
printf 'CLI_EXACT_INSTALL=PASS\nSOURCE_SHA=%s\nSDK_ROOT=%s\n' "$SHA" "$DEST"
