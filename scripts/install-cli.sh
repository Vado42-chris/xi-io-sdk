#!/usr/bin/env bash
set -euo pipefail

REPO="${XIIO_CLI_BOOTSTRAP_REPO:-Vado42-chris/xi-io-sdk}"
REF="${XIIO_CLI_BOOTSTRAP_REF:-main}"
ROOT="${XIIO_CLI_SDK_ROOT:-$HOME/.local/share/xi-io/sdk}"
if [[ "$REF" =~ ^[0-9a-fA-F]{40}$ ]]; then
  REF_KIND="commit"
  REF="${REF,,}"
else
  REF_KIND="named"
fi
SOURCE="${XIIO_CLI_BOOTSTRAP_SOURCE:-$REPO}"

fail() {
  printf 'XIIO_CLI_BOOTSTRAP=BLOCKED first_red=%s\n' "$1" >&2
  exit "${2:-2}"
}
need() { command -v "$1" >/dev/null 2>&1 || fail "MISSING_COMMAND_$1"; }

resolve_node() {
  local candidate major

  if [[ -n "${XIIO_NODE:-}" && -x "${XIIO_NODE}" ]]; then
    major="$("${XIIO_NODE}" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    if [[ "$major" =~ ^[0-9]+$ && "$major" -ge 22 ]]; then
      printf '%s\n' "${XIIO_NODE}"
      return 0
    fi
  fi

  candidate="$(command -v node 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    major="$("$candidate" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    if [[ "$major" =~ ^[0-9]+$ && "$major" -ge 22 ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  for candidate in     "$HOME"/.nvm/versions/node/*/bin/node     "$HOME"/.local/bin/node     /usr/local/bin/node     /usr/bin/node
  do
    [[ -x "$candidate" ]] || continue
    major="$("$candidate" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
    if [[ "$major" =~ ^[0-9]+$ && "$major" -ge 22 ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

NODE="$(resolve_node || true)"
[[ -n "$NODE" ]] || fail NODE_22_PLUS_NOT_FOUND
node_major="$("$NODE" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
[[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 22 ]] || fail NODE_22_PLUS_REQUIRED

if [[ "${XIIO_CLI_BOOTSTRAP_PROBE_NODE:-0}" == "1" ]]; then
  printf 'XIIO_CLI_NODE_PROBE=PASS\nNODE=%s\nNODE_MAJOR=%s\n' "$NODE" "$node_major"
  exit 0
fi

need git

mkdir -p "$(dirname "$ROOT")"

if [[ -e "$ROOT" && ! -d "$ROOT/.git" ]]; then
  fail TARGET_EXISTS_NOT_GIT_REPO
fi

if [[ ! -d "$ROOT/.git" ]]; then
  if [[ "$SOURCE" == "$REPO" ]]; then
    need gh
    gh auth status >/dev/null 2>&1 || fail GH_AUTH_REQUIRED
    if [[ "$REF_KIND" == "commit" ]]; then
      gh repo clone "$REPO" "$ROOT" -- --no-checkout --quiet || fail CLONE_FAILED
    else
      gh repo clone "$REPO" "$ROOT" -- --branch "$REF" --single-branch --quiet || fail CLONE_FAILED
    fi
  else
    if [[ "$REF_KIND" == "commit" ]]; then
      git clone --no-checkout --quiet "$SOURCE" "$ROOT" || fail CLONE_FAILED
    else
      git clone --branch "$REF" --single-branch --quiet "$SOURCE" "$ROOT" || fail CLONE_FAILED
    fi
  fi
fi

inside="$(git -C "$ROOT" rev-parse --is-inside-work-tree 2>/dev/null || true)"
[[ "$inside" == "true" ]] || fail SDK_CHECKOUT_INVALID
dirty="$(git -C "$ROOT" status --porcelain=v1 2>/dev/null || true)"
[[ -z "$dirty" ]] || fail SDK_CHECKOUT_DIRTY

origin="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
if [[ "$SOURCE" == "$REPO" ]]; then
  case "$origin" in
    "https://github.com/$REPO"|"https://github.com/$REPO.git"|"git@github.com:$REPO.git") ;;
    *) fail SDK_ORIGIN_MISMATCH ;;
  esac
fi

if [[ "$REF_KIND" == "commit" ]]; then
  git -C "$ROOT" fetch origin "$REF" --depth=1 --quiet || {
    git -C "$ROOT" fetch origin main --prune --quiet || fail FETCH_REF_FAILED
  }
  git -C "$ROOT" cat-file -e "$REF^{commit}" 2>/dev/null || fail EXACT_COMMIT_NOT_FETCHED
  git -C "$ROOT" checkout --detach --quiet "$REF" || fail EXACT_COMMIT_CHECKOUT_FAILED
  head="$(git -C "$ROOT" rev-parse HEAD)"
  [[ "$head" == "$REF" ]] || fail "SDK_HEAD_MISMATCH_${head}_EXPECTED_$REF"
  branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
  [[ -z "$branch" ]] || fail "EXACT_COMMIT_EXPECTED_DETACHED_HEAD_GOT_$branch"
else
  branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
  [[ "$branch" == "$REF" ]] || fail "SDK_BRANCH_NOT_REQUESTED_${branch:-DETACHED}_EXPECTED_$REF"
  git -C "$ROOT" fetch origin "$REF" --prune --quiet || fail FETCH_REF_FAILED
  git -C "$ROOT" merge --ff-only --quiet "origin/$REF" || fail SDK_NOT_FAST_FORWARDABLE
  head="$(git -C "$ROOT" rev-parse HEAD)"
fi

install_receipt="$(mktemp)"
trap 'rm -f "$install_receipt"' EXIT
"$NODE" "$ROOT/bin/xi.mjs" install >"$install_receipt" || fail CLI_INSTALL_FAILED

export PATH="$HOME/.local/bin:$PATH"
hash -r 2>/dev/null || true
[[ -x "$HOME/.local/bin/xi-io" ]] || fail CLI_WRAPPER_MISSING

export XIIO_NODE="$NODE"
self_test="$("$HOME/.local/bin/xi-io" self-test)" || {
  printf '%s\n' "$self_test" >&2
  fail CLI_SELF_TEST_FAILED
}

printf 'XIIO_CLI_BOOTSTRAP=PASS\nSDK_ROOT=%s\nSDK_REF=%s\nSDK_REF_KIND=%s\nSDK_HEAD=%s\nCLI=%s\nNODE=%s\n' "$ROOT" "$REF" "$REF_KIND" "$head" "$HOME/.local/bin/xi-io" "$NODE"
printf '%s\n' "$self_test"
