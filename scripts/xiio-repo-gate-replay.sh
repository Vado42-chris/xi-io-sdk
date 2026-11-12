#!/usr/bin/env bash
# Replay the xi-io reusable repo gate (.github/workflows/xiio-repo-gate.yml) off GitHub,
# on an exact commit, and write the same receipt schema plus replay evidence.
# For review under xi-io.net #337 (execution-surface qualification). It is NOT a waiver:
# a replay receipt counts only where the owner explicitly approves it as an equivalent.
#   REPLAY_RECEIPT != GITHUB_CHECK    GATE_PASS != LIVE    RECEIPT != OWNER_ACCEPTANCE
# Usage: xiio-repo-gate-replay.sh <owner/repo> <full-commit-sha> [gate_command] [working_directory]
set -uo pipefail
REPO=${1:?owner/repo}; SHA=${2:?commit sha}; GATE=${3:-}; WD=${4:-.}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "XIIO_REPLAY=BLOCKED first_red=SHA_NOT_FULL_40_HEX"; exit 2; }
OUT=${XIIO_REPLAY_OUT:-$PWD/xiio-replay-$(echo "$REPO" | tr / _)-${SHA:0:12}}
mkdir -p "$OUT"; WORK=$(mktemp -d); LOG="$OUT/gate.log"; : > "$LOG"
step(){ echo "+ $*" | tee -a "$LOG"; }
# 1. checkout (fresh clone, exact commit, no local state)
step git clone "https://github.com/$REPO" "$WORK/src"
git clone -q "https://github.com/$REPO" "$WORK/src" >>"$LOG" 2>&1 && git -C "$WORK/src" checkout -q "$SHA" >>"$LOG" 2>&1 || { echo "XIIO_REPLAY=BLOCKED first_red=CHECKOUT_FAILED"; exit 2; }
TREE=$(git -C "$WORK/src" rev-parse "$SHA^{tree}")
cd "$WORK/src/$WD" || exit 2
# 2. node major must match the gate (22)
NODE_V=$(node -v 2>/dev/null || echo none); [[ "$NODE_V" == v22.* ]] || { echo "XIIO_REPLAY=BLOCKED first_red=NODE_NOT_22:$NODE_V"; exit 2; }
BUN_V=none; if [ -f bun.lock ] || [ -f bun.lockb ]; then BUN_V=$(bun --version 2>/dev/null || echo missing); [ "$BUN_V" = missing ] && { echo "XIIO_REPLAY=BLOCKED first_red=BUN_REQUIRED"; exit 2; }; fi
# 3. install dependencies (same branch order as the gate)
INSTALL_RC=0
if [ -f bun.lock ] || [ -f bun.lockb ]; then step bun install --frozen-lockfile; bun install --frozen-lockfile >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f pnpm-lock.yaml ]; then step pnpm install --frozen-lockfile; (corepack enable && pnpm install --frozen-lockfile) >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f package-lock.json ]; then step npm ci; npm ci --no-audit --no-fund >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f package.json ]; then step npm install --no-audit --no-fund; npm install --no-audit --no-fund >>"$LOG" 2>&1 || INSTALL_RC=$?
fi
# 4. gate of record (same selection as the gate)
CMD="$GATE"
if [ -z "$CMD" ] && [ -f package.json ]; then for s in check verify test; do node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)" && { CMD="npm run $s"; break; }; done; fi
GATE_RC=2
if [ "$INSTALL_RC" = 0 ] && [ -n "$CMD" ]; then step "$CMD"; bash -eo pipefail -c "$CMD" >>"$LOG" 2>&1; GATE_RC=$?; fi
OUTCOME=$([ "$INSTALL_RC" = 0 ] && [ "$GATE_RC" = 0 ] && echo success || echo failure)
# 5. receipt: gate schema fields + replay evidence
LOG_SHA=$(sha256sum "$LOG" | cut -d' ' -f1)
export REPO SHA CMD OUTCOME TREE WD INSTALL_RC GATE_RC NODE_V BUN_V LOG_SHA OUT
node -e '
const e=process.env, r={schema:"xiio.repo-gate-receipt/v1",repository:e.REPO,head_sha:e.SHA,ref:null,event:"replay",
 run_id:null,runner:"replay:"+require("os").hostname(),command:e.CMD||null,outcome:e.OUTCOME,written_at:new Date().toISOString(),
 hard:["GATE_PASS != LIVE","RECEIPT != OWNER_ACCEPTANCE","REPLAY_RECEIPT != GITHUB_CHECK"],
 replay:{schema:"xiio.repo-gate-replay/v1",gate_workflow:".github/workflows/xiio-repo-gate.yml",tree_sha:e.TREE,
  working_directory:e.WD,install_exit:+e.INSTALL_RC,gate_exit:+e.GATE_RC,node:e.NODE_V,bun:e.BUN_V,os:process.platform+"-"+process.arch,
  log_sha256:e.LOG_SHA,fresh_clone:true,equivalence_status:"UNAPPROVED_PENDING_OWNER_REVIEW"}};
require("fs").writeFileSync(e.OUT+"/xiio-gate-receipt.json",JSON.stringify(r,null,2)); console.log(JSON.stringify(r));' \

rm -rf "$WORK"; [ "$OUTCOME" = success ]
