#!/usr/bin/env bash
# Exact-head replay candidate for the incumbent xi-io reusable repo gate.
# Evidence is never a release waiver or a replacement for owner qualification.
set -uo pipefail

REPO=${1:?owner/repo}; SHA=${2:?commit sha}; GATE=${3:-}; WD=${4:-.}
REQUIRED_GATE_CSV=${XIIO_REPLAY_REQUIRED_GATES:-}
REQUESTED_GATE_CSV=${XIIO_REPLAY_REQUESTED_GATES:-}
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "XIIO_REPLAY=BLOCKED first_red=INVALID_REPO_REF"; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "XIIO_REPLAY=BLOCKED first_red=SHA_NOT_FULL_40_HEX"; exit 2; }
if [ -n "$GATE" ] && [ -n "$REQUESTED_GATE_CSV" ]; then
  echo "XIIO_REPLAY=BLOCKED first_red=AMBIGUOUS_GATE_INPUT"
  exit 2
fi
OUT=${XIIO_REPLAY_OUT:-$PWD/xiio-replay-$(echo "$REPO" | tr / _)-${SHA:0:12}}
mkdir -p "$OUT" || exit 2
OUT=$(realpath -e "$OUT") || exit 2
# A replay receipt is an immutable attempt result. Reusing an output directory
# must not erase the prior evidence or turn a later attempt into the same one.
if [ -f "$OUT/xiio-gate-receipt.json" ] || [ -L "$OUT/xiio-gate-receipt.json" ]; then
  echo "XIIO_REPLAY=BLOCKED first_red=RECEIPT_ALREADY_EXISTS"
  exit 2
fi
WORK=$(mktemp -d) || exit 2
trap 'rm -r -- "$WORK"' EXIT
LOG="$OUT/gate.log"
: > "$LOG"
step(){ echo "+ $*" | tee -a "$LOG"; }

# A blocked attempt remains a resumable occurrence of the same admitted Work,
# not a new ticket, successful check, or permission to change runner/billing policy.
blocked(){
  local reason=$1 wake=$2
  local log_sha
  log_sha=$(sha256sum "$LOG" | cut -d' ' -f1)
  XIIO_BLOCK_REASON="$reason" XIIO_BLOCK_WAKE="$wake" XIIO_BLOCK_LOG_SHA="$log_sha" \
  REPO="$REPO" SHA="$SHA" OUT="$OUT" node -e '
    const e=process.env;
    const crypto=require("node:crypto");
    const workRef=e.XIIO_REPLAY_WORK_REF||null;
    const wakeRegistration=workRef?{
      occurrence_ref:workRef,
      provider:"github-checkout",
      acquisition_ref:"github-commit:"+e.REPO+"@"+e.SHA,
      wake_condition_ref:"checkout-availability:"+e.XIIO_BLOCK_WAKE,
    }:null;
    // Same deterministic projection used by Cadence #44 provider-availability-wake.
    const wakeRef=wakeRegistration?"provider-availability:"+crypto.createHash("sha256")
      .update(JSON.stringify(Object.values(wakeRegistration))).digest("hex").slice(0,24):null;
    const r={schema:"xiio.repo-gate-receipt/v1",repository:e.REPO,head_sha:e.SHA,
      ref:null,event:"replay",run_id:null,runner:null,command:null,outcome:"blocked",
      first_red:e.XIIO_BLOCK_REASON,written_at:new Date().toISOString(),
      work_ref:workRef,
      required_gates:[],
      requested_gates:[],
      executed_gates:[],
      gate_profile_status:"NOT_EVALUATED",
      release_qualified:false,
      wake:{ref:wakeRef,refs:wakeRef?[wakeRef]:[],condition:e.XIIO_BLOCK_WAKE,
        required_repo:e.REPO,required_head:e.SHA,
        resume_same_work:Boolean(workRef),native_readback_required:true,
        cadence_registration:wakeRegistration,
        dispatch_adapter:null,qualified_worker:null},
      cadence_return:wakeRef?{outcome_class:"PROVIDER_UNAVAILABLE",wake_refs:[wakeRef],
        provider_effect_state:"NOT_PERFORMED",applied:false}:null,
      hard:["BLOCKED != GATE_PASS","REPLAY_RECEIPT != GITHUB_CHECK",
        "WAKE != DISPATCH","RECEIPT != OWNER_ACCEPTANCE",
        "GATE_PROFILE_COMPLETE != EXECUTOR_QUALIFIED"],
      replay:{schema:"xiio.repo-gate-replay/v1",gate_workflow:".github/workflows/xiio-repo-gate.yml",
        log_sha256:e.XIIO_BLOCK_LOG_SHA,fresh_clone:false,
        equivalence_status:"UNAPPROVED_PENDING_OWNER_REVIEW"}};
    require("fs").writeFileSync(e.OUT+"/xiio-gate-receipt.json",JSON.stringify(r,null,2));
    console.log("XIIO_REPLAY=BLOCKED first_red="+r.first_red+" wake="+r.wake.condition);
  ' || echo "XIIO_REPLAY=BLOCKED first_red=$reason wake=$wake receipt_write_failed=true"
  return 2
}

# Checkout is deliberately fresh. The authorized worker supplies its normal
# credential helper, if any. Never export a connector token to git or stdout.
step git clone "https://github.com/$REPO" '[temporary checkout]'
if ! GIT_TERMINAL_PROMPT=0 git clone -q "https://github.com/$REPO" "$WORK/src" >>"$LOG" 2>&1; then
  if grep -Eiq 'could not read Username|Authentication failed|terminal prompts disabled|Permission denied|repository not found' "$LOG"; then
    blocked AUTHENTICATED_CHECKOUT_UNAVAILABLE authenticated_checkout_on_qualified_worker
  else
    blocked CHECKOUT_FAILED checkout_surface_ready
  fi
  exit 2
fi
if ! git -C "$WORK/src" checkout -q "$SHA" >>"$LOG" 2>&1; then
  blocked EXACT_HEAD_NOT_MATERIALIZED exact_head_available_on_qualified_worker
  exit 2
fi
TREE=$(git -C "$WORK/src" rev-parse "$SHA^{tree}") || { blocked TREE_READBACK_FAILED exact_head_available_on_qualified_worker; exit 2; }
SOURCE_ROOT=$(realpath -e "$WORK/src") || { blocked SOURCE_ROOT_MISSING checkout_surface_ready; exit 2; }
TARGET=$(realpath -e "$SOURCE_ROOT/$WD" 2>>"$LOG") || { blocked WORKING_DIRECTORY_MISSING valid_gate_directory; exit 2; }
case "$TARGET" in
  "$SOURCE_ROOT"|"$SOURCE_ROOT"/*) [ -d "$TARGET" ] || { blocked WORKING_DIRECTORY_NOT_DIRECTORY valid_gate_directory; exit 2; } ;;
  *) blocked WORKING_DIRECTORY_ESCAPE valid_gate_directory; exit 2 ;;
esac
cd "$TARGET" || exit 2
NODE_V=$(node -v 2>/dev/null || echo none)
[[ "$NODE_V" == v22.* ]] || { blocked "NODE_NOT_22:$NODE_V" qualified_node22_runtime; exit 2; }
BUN_V=none
if [ -f bun.lock ] || [ -f bun.lockb ]; then
  BUN_V=$(bun --version 2>/dev/null || echo missing)
  [ "$BUN_V" = missing ] && { blocked BUN_REQUIRED qualified_bun_runtime; exit 2; }
fi

INSTALL_RC=0
if [ -f bun.lock ] || [ -f bun.lockb ]; then step bun install --frozen-lockfile; bun install --frozen-lockfile >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f pnpm-lock.yaml ]; then step pnpm install --frozen-lockfile; (corepack enable && pnpm install --frozen-lockfile) >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f package-lock.json ]; then step npm ci; npm ci --no-audit --no-fund >>"$LOG" 2>&1 || INSTALL_RC=$?
elif [ -f package.json ]; then step npm install --no-audit --no-fund; npm install --no-audit --no-fund >>"$LOG" 2>&1 || INSTALL_RC=$?
fi
normalize_gate_csv() {
  local csv=$1
  node - "$csv" <<'NODE'
const raw=process.argv[2]||"";
const parts=raw===""?[]:raw.split(",");
if(parts.some(x=>!/^[A-Za-z0-9:_-]+$/.test(x))) process.exit(2);
if(new Set(parts).size!==parts.length) process.exit(3);
process.stdout.write(JSON.stringify(parts));
NODE
}

REQUIRED_GATES_JSON=$(normalize_gate_csv "$REQUIRED_GATE_CSV") || {
  rc=$?
  if [ "$rc" = 3 ]; then blocked DUPLICATE_REQUIRED_GATE exact_release_gate_profile
  else blocked INVALID_REQUIRED_GATE exact_release_gate_profile
  fi
  exit 2
}
REQUESTED_GATES_JSON=$(normalize_gate_csv "$REQUESTED_GATE_CSV") || {
  rc=$?
  if [ "$rc" = 3 ]; then blocked DUPLICATE_REQUESTED_GATE exact_release_gate_profile
  else blocked INVALID_REQUESTED_GATE exact_release_gate_profile
  fi
  exit 2
}
if [ "$REQUIRED_GATES_JSON" != "[]" ] && [ "$REQUESTED_GATES_JSON" = "[]" ]; then
  blocked REQUESTED_GATE_LIST_REQUIRED exact_release_gate_profile
  exit 2
fi
if [ "$REQUESTED_GATES_JSON" != "[]" ] && [ ! -f package.json ]; then
  blocked PACKAGE_JSON_REQUIRED exact_release_gate_profile
  exit 2
fi
if [ "$REQUIRED_GATES_JSON" != "[]" ] || [ "$REQUESTED_GATES_JSON" != "[]" ]; then
  REQUIRED_GATES_JSON="$REQUIRED_GATES_JSON" REQUESTED_GATES_JSON="$REQUESTED_GATES_JSON" node - <<'NODE' || {
const fs=require("fs");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
for(const [kind,key] of [["required","REQUIRED_GATES_JSON"],["requested","REQUESTED_GATES_JSON"]]){
  for(const gate of JSON.parse(process.env[key])){
    if(typeof pkg.scripts?.[gate] !== "string" || !pkg.scripts[gate].trim()){
      process.exit(kind==="required"?21:22);
    }
  }
}
NODE
    rc=$?
    if [ "$rc" = 21 ]; then blocked REQUIRED_GATE_NOT_DECLARED exact_release_gate_profile
    else blocked REQUESTED_GATE_NOT_DECLARED exact_release_gate_profile
    fi
    exit 2
  }
fi

CMD="$GATE"
GATE_RC=2
EXECUTED_GATES_JSON='[]'
if [ "$INSTALL_RC" = 0 ] && [ "$REQUESTED_GATES_JSON" != "[]" ]; then
  GATE_RC=0
  mapfile -t REQUESTED_GATES < <(REQUESTED_GATES_JSON="$REQUESTED_GATES_JSON" node -e 'for(const x of JSON.parse(process.env.REQUESTED_GATES_JSON)) console.log(x)')
  for gate in "${REQUESTED_GATES[@]}"; do
    cmd="npm run $gate"
    step "$cmd"
    rc=0
    npm run "$gate" >>"$LOG" 2>&1 || rc=$?
    EXECUTED_GATES_JSON=$(EXECUTED_GATES_JSON="$EXECUTED_GATES_JSON" GATE_NAME="$gate" GATE_COMMAND="$cmd" GATE_EXIT="$rc" node -e '
      const xs=JSON.parse(process.env.EXECUTED_GATES_JSON);
      xs.push({gate:process.env.GATE_NAME,command:process.env.GATE_COMMAND,exit:+process.env.GATE_EXIT});
      process.stdout.write(JSON.stringify(xs));')
    if [ "$rc" -ne 0 ]; then GATE_RC=$rc; break; fi
  done
  CMD=$(REQUESTED_GATES_JSON="$REQUESTED_GATES_JSON" node -e 'process.stdout.write(JSON.parse(process.env.REQUESTED_GATES_JSON).map(x=>"npm run "+x).join(" && "))')
elif [ "$INSTALL_RC" = 0 ]; then
  if [ -z "$CMD" ] && [ -f package.json ]; then
    for s in check verify test; do node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)" && { CMD="npm run $s"; break; }; done
  fi
  if [ -n "$CMD" ]; then
    step "$CMD"
    bash -eo pipefail -c "$CMD" >>"$LOG" 2>&1
    GATE_RC=$?
  fi
fi

OUTCOME=$([ "$INSTALL_RC" = 0 ] && [ "$GATE_RC" = 0 ] && echo success || echo failure)
PROFILE_EVAL=$(REQUIRED_GATES_JSON="$REQUIRED_GATES_JSON" EXECUTED_GATES_JSON="$EXECUTED_GATES_JSON" OUTCOME="$OUTCOME" node - <<'NODE'
const required=JSON.parse(process.env.REQUIRED_GATES_JSON);
const executed=JSON.parse(process.env.EXECUTED_GATES_JSON);
if(!required.length){
  process.stdout.write(JSON.stringify({status:"NO_REQUIRED_GATE_PROFILE",complete:false,missing:[]}));
  process.exit(0);
}
const attempted=new Map(executed.map(x=>[x.gate,x.exit]));
const missing=required.filter(x=>!attempted.has(x));
const failed=required.filter(x=>attempted.has(x) && attempted.get(x)!==0);
if(missing.length){
  process.stdout.write(JSON.stringify({status:"INCOMPLETE_REQUIRED_GATES",complete:false,missing}));
} else if(failed.length || process.env.OUTCOME!=="success"){
  process.stdout.write(JSON.stringify({status:"REQUIRED_GATE_FAILURE",complete:false,missing:[]}));
} else {
  process.stdout.write(JSON.stringify({status:"GATE_PROFILE_COMPLETE_PENDING_EXECUTOR_QUALIFICATION",complete:true,missing:[]}));
}
NODE
)
GATE_PROFILE_STATUS=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_EVAL).status)')
GATE_PROFILE_COMPLETE=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(String(JSON.parse(process.env.PROFILE_EVAL).complete))')
MISSING_GATES_JSON=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.env.PROFILE_EVAL).missing))')
LOG_SHA=$(sha256sum "$LOG" | cut -d' ' -f1)
export REPO SHA CMD OUTCOME TREE WD INSTALL_RC GATE_RC NODE_V BUN_V LOG_SHA OUT
export REQUIRED_GATES_JSON REQUESTED_GATES_JSON EXECUTED_GATES_JSON GATE_PROFILE_STATUS GATE_PROFILE_COMPLETE MISSING_GATES_JSON
RECEIPT_RC=0
node -e '
const e=process.env,r={schema:"xiio.repo-gate-receipt/v1",repository:e.REPO,head_sha:e.SHA,
 ref:null,event:"replay",run_id:null,runner:"replay:"+require("os").hostname(),command:e.CMD||null,
 outcome:e.OUTCOME,written_at:new Date().toISOString(),work_ref:e.XIIO_REPLAY_WORK_REF||null,
 required_gates:JSON.parse(e.REQUIRED_GATES_JSON),requested_gates:JSON.parse(e.REQUESTED_GATES_JSON),
 executed_gates:JSON.parse(e.EXECUTED_GATES_JSON),missing_required_gates:JSON.parse(e.MISSING_GATES_JSON),
 gate_profile_status:e.GATE_PROFILE_STATUS,gate_profile_complete:e.GATE_PROFILE_COMPLETE==="true",
 release_qualified:false,
 hard:["GATE_PASS != LIVE","RECEIPT != OWNER_ACCEPTANCE","REPLAY_RECEIPT != GITHUB_CHECK",
   "GATE_PROFILE_COMPLETE != EXECUTOR_QUALIFIED","VERIFY_PASS != RELEASE_GATE_COMPLETE"],
 replay:{schema:"xiio.repo-gate-replay/v1",gate_workflow:".github/workflows/xiio-repo-gate.yml",tree_sha:e.TREE,
  working_directory:e.WD,install_exit:+e.INSTALL_RC,gate_exit:+e.GATE_RC,node:e.NODE_V,bun:e.BUN_V,
  os:process.platform+"-"+process.arch,log_sha256:e.LOG_SHA,fresh_clone:true,
  equivalence_status:"UNAPPROVED_PENDING_OWNER_REVIEW"}};
require("fs").writeFileSync(e.OUT+"/xiio-gate-receipt.json",JSON.stringify(r,null,2)); console.log(JSON.stringify(r));' || RECEIPT_RC=$?
# A successful gate without its durable source-bound receipt is NEVER success.
# Preserve a failing gate's own status while also refusing lost evidence.
if [ "$RECEIPT_RC" -ne 0 ] || [ ! -s "$OUT/xiio-gate-receipt.json" ]; then
  echo "XIIO_REPLAY=BLOCKED first_red=RECEIPT_WRITE_FAILED"
  exit 2
fi
if [ "$OUTCOME" != success ]; then exit 1; fi
if [ "$REQUIRED_GATES_JSON" != "[]" ] && [ "$GATE_PROFILE_COMPLETE" != true ]; then
  echo "XIIO_REPLAY=INCOMPLETE first_red=REQUIRED_GATES_NOT_ALL_EXECUTED"
  exit 3
fi
exit 0
