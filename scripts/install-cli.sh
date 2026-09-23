#!/usr/bin/env bash
set -euo pipefail

REPO="${XIIO_CLI_BOOTSTRAP_REPO:-Vado42-chris/xi-io-sdk}"
ROOT="${XIIO_CLI_SDK_ROOT:-$HOME/.local/share/xi-io/sdk}"
SOURCE="${XIIO_CLI_BOOTSTRAP_SOURCE:-$REPO}"

fail() {
  printf 'XIIO_CLI_BOOTSTRAP=BLOCKED first_red=%s\n' "$1" >&2
  exit "${2:-2}"
}
need() { command -v "$1" >/dev/null 2>&1 || fail "MISSING_COMMAND_$1"; }

need git
need node
node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
[[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 22 ]] || fail NODE_22_PLUS_REQUIRED

mkdir -p "$(dirname "$ROOT")"

if [[ -e "$ROOT" && ! -d "$ROOT/.git" ]]; then
  fail TARGET_EXISTS_NOT_GIT_REPO
fi

if [[ ! -d "$ROOT/.git" ]]; then
  if [[ "$SOURCE" == "$REPO" ]]; then
    need gh
    gh auth status >/dev/null 2>&1 || fail GH_AUTH_REQUIRED
    gh repo clone "$REPO" "$ROOT" -- --branch main --single-branch --quiet || fail CLONE_FAILED
  else
    git clone --branch main --single-branch --quiet "$SOURCE" "$ROOT" || fail CLONE_FAILED
  fi
fi

inside="$(git -C "$ROOT" rev-parse --is-inside-work-tree 2>/dev/null || true)"
[[ "$inside" == "true" ]] || fail SDK_CHECKOUT_INVALID
branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
[[ "$branch" == "main" ]] || fail "SDK_BRANCH_NOT_MAIN_${branch:-DETACHED}"
dirty="$(git -C "$ROOT" status --porcelain=v1 2>/dev/null || true)"
[[ -z "$dirty" ]] || fail SDK_CHECKOUT_DIRTY

origin="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
if [[ "$SOURCE" == "$REPO" ]]; then
  case "$origin" in
    "https://github.com/$REPO"|"https://github.com/$REPO.git"|"git@github.com:$REPO.git") ;;
    *) fail SDK_ORIGIN_MISMATCH ;;
  esac
fi

git -C "$ROOT" fetch origin main --prune --quiet || fail FETCH_MAIN_FAILED
git -C "$ROOT" merge --ff-only origin/main --quiet || fail SDK_NOT_FAST_FORWARDABLE
head="$(git -C "$ROOT" rev-parse HEAD)"

install_receipt="$(mktemp)"
trap 'rm -f "$install_receipt"' EXIT
node "$ROOT/bin/xi.mjs" install >"$install_receipt" || fail CLI_INSTALL_FAILED

export PATH="$HOME/.local/bin:$PATH"
hash -r 2>/dev/null || true
[[ -x "$HOME/.local/bin/xi-io" ]] || fail CLI_WRAPPER_MISSING

self_test="$("$HOME/.local/bin/xi-io" self-test)" || {
  printf '%s\n' "$self_test" >&2
  fail CLI_SELF_TEST_FAILED
}

printf 'XIIO_CLI_BOOTSTRAP=PASS\nSDK_ROOT=%s\nSDK_HEAD=%s\nCLI=%s\n' "$ROOT" "$head" "$HOME/.local/bin/xi-io"
printf '%s\n' "$self_test"
