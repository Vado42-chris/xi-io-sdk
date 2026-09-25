#!/usr/bin/env bash
set -euo pipefail

SRC="$(git rev-parse --show-toplevel)"
HEAD_SHA="$(git rev-parse HEAD)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
HOME_DIR="$TMP/home"
SDK_ROOT="$TMP/sdk"
mkdir -p "$HOME_DIR"

OUT="$TMP/install.out"
HOME="$HOME_DIR" XIIO_NODE="$(command -v node)" XIIO_CLI_BOOTSTRAP_SOURCE="$SRC" XIIO_CLI_BOOTSTRAP_REF="$HEAD_SHA" XIIO_CLI_SDK_ROOT="$SDK_ROOT" bash "$SRC/scripts/install-cli.sh" >"$OUT"

grep -q '^XIIO_CLI_BOOTSTRAP=PASS$' "$OUT"
grep -q "^SDK_REF=$HEAD_SHA$" "$OUT"
grep -q '^SDK_REF_KIND=commit$' "$OUT"
grep -q "^SDK_HEAD=$HEAD_SHA$" "$OUT"

[[ "$(git -C "$SDK_ROOT" rev-parse HEAD)" == "$HEAD_SHA" ]]
[[ -z "$(git -C "$SDK_ROOT" branch --show-current)" ]]
[[ -x "$HOME_DIR/.local/bin/xi-io" ]]
[[ -x "$HOME_DIR/.local/bin/xi" ]]
[[ -x "$HOME_DIR/.local/bin/xi-io-opus" ]]

set +e
HOME="$HOME_DIR" XIIO_NODE="$(command -v node)" "$HOME_DIR/.local/bin/xi-io" status --json >"$TMP/io.json"
IO_RC=$?
HOME="$HOME_DIR" XIIO_NODE="$(command -v node)" "$HOME_DIR/.local/bin/xi" status --json >"$TMP/xi.json"
XI_RC=$?
set -e
[[ "$IO_RC" -le 1 ]]
[[ "$XI_RC" -le 1 ]]

node - "$TMP/io.json" "$TMP/xi.json" "$HEAD_SHA" <<'NODE'
const fs=require('fs');
const [ioPath,xiPath,head]=process.argv.slice(2);
const io=JSON.parse(fs.readFileSync(ioPath,'utf8'));
const xi=JSON.parse(fs.readFileSync(xiPath,'utf8'));
if(io.schema!=='xiio.cli.status/v1'||xi.schema!=='xiio.cli.status/v1') process.exit(1);
if(io.xi?.sdk_generation && io.xi.sdk_generation!==head) process.exit(2);
if(xi.xi?.sdk_generation && xi.xi.sdk_generation!==head) process.exit(3);
if(io.invoked_as!=='xi-io'||xi.invoked_as!=='xi') process.exit(4);
console.log('INSTALLED_ALIAS_STATUS=PASS');
NODE

echo "CLI_EXACT_REF_INSTALL=PASS sha=$HEAD_SHA io_rc=$IO_RC xi_rc=$XI_RC"
