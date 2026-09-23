#!/usr/bin/env bash
set -euo pipefail
SHA="${1:-}"
NODE="${XIIO_NODE:-$HOME/.nvm/versions/node/v24.11.1/bin/node}"
ROOT="$(cat "$HOME/.local/share/xi-io/cli/sdk.path" 2>/dev/null | tr -d '\r\n')"
[ -x "$NODE" ] || { echo "CLI_VALIDATE_BLOCKED first_red=NODE_MISSING"; exit 13; }
[ -f "$ROOT/bin/xi.mjs" ] || { echo "CLI_VALIDATE_BLOCKED first_red=INSTALLED_ROOT_MISSING"; exit 13; }
for a in xi-io xi xiio; do
  p="$(command -v "$a" || true)"
  [ -n "$p" ] || { echo "CLI_VALIDATE_BLOCKED first_red=ALIAS_MISSING alias=$a"; exit 13; }
  "$a" status --json > "/tmp/$a.status.json" || rc=$?
  rc="${rc:-0}"
  case "$rc" in 0|1|2) ;; *) echo "CLI_VALIDATE_BLOCKED first_red=STATUS_EXIT alias=$a exit=$rc"; exit 13;; esac
  unset rc
done
jq 'del(.invoked_as)' /tmp/xi-io.status.json > /tmp/xiio-a.json
jq 'del(.invoked_as)' /tmp/xi.status.json > /tmp/xiio-b.json
jq 'del(.invoked_as)' /tmp/xiio.status.json > /tmp/xiio-c.json
diff -u /tmp/xiio-a.json /tmp/xiio-b.json
diff -u /tmp/xiio-a.json /tmp/xiio-c.json
printf 'CLI_INSTALLED_ALIAS_PARITY=PASS\n'
