#!/usr/bin/env bash
# Exact-head replay candidate for the incumbent xi-io reusable repo gate.
# Evidence is never a release waiver or a replacement for owner qualification.
set -uo pipefail

REPO=${1:?owner/repo}; SHA=${2:?commit sha}; GATE=${3:-}; WD=${4:-.}
PROFILE_REF=${XIIO_REPLAY_PROFILE:-}
LEGACY_REQUIRED_GATE_CSV=${XIIO_REPLAY_REQUIRED_GATES:-}
LEGACY_REQUESTED_GATE_CSV=${XIIO_REPLAY_REQUESTED_GATES:-}
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "XIIO_REPLAY=BLOCKED first_red=INVALID_REPO_REF"; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "XIIO_REPLAY=BLOCKED first_red=SHA_NOT_FULL_40_HEX"; exit 2; }
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

# Replay never accepts caller-selected shell commands or inferred gate lists.
# The product owner supplies one accepted source-bound profile from the exact checkout.
if [ -n "$GATE" ]; then
  blocked ARBITRARY_GATE_COMMAND_REFUSED accepted_product_gate_profile
  exit 2
fi
if [ -n "$LEGACY_REQUIRED_GATE_CSV" ] || [ -n "$LEGACY_REQUESTED_GATE_CSV" ]; then
  blocked LEGACY_GATE_LIST_REFUSED accepted_product_gate_profile
  exit 2
fi

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
if [ -z "$PROFILE_REF" ]; then
  blocked GATE_PROFILE_REQUIRED accepted_product_gate_profile
  exit 2
fi
PROFILE_PATH=$(realpath -e "$SOURCE_ROOT/$PROFILE_REF" 2>>"$LOG") || {
  blocked GATE_PROFILE_MISSING accepted_product_gate_profile
  exit 2
}
case "$PROFILE_PATH" in
  "$SOURCE_ROOT"/*) [ -f "$PROFILE_PATH" ] || { blocked GATE_PROFILE_NOT_FILE accepted_product_gate_profile; exit 2; } ;;
  *) blocked GATE_PROFILE_ESCAPE accepted_product_gate_profile; exit 2 ;;
esac

PROFILE_NORMALIZED="$WORK/profile.normalized.json"
PROFILE_RC=0
XIIO_PROFILE_PATH="$PROFILE_PATH" XIIO_PROFILE_SHA="$SHA" node - <<'NODE' >"$PROFILE_NORMALIZED" || PROFILE_RC=$?
const fs=require("fs");
const crypto=require("crypto");
const path=require("path");
const p=JSON.parse(fs.readFileSync(process.env.XIIO_PROFILE_PATH,"utf8"));
const fail=(code)=>{ console.error(code); process.exit(20); };
if(p?.schema!=="xiio.repo-gate-profile/v1") fail("PROFILE_SCHEMA_UNSUPPORTED");
if(p?.acceptance?.status!=="ACCEPTED" || typeof p?.acceptance?.authority_ref!=="string" || !p.acceptance.authority_ref.trim())
  fail("PROFILE_NOT_ACCEPTED");
if(typeof p?.product_ref!=="string" || !p.product_ref.trim()) fail("PROFILE_PRODUCT_REF_MISSING");
if(p?.head_sha!==process.env.XIIO_PROFILE_SHA) fail("PROFILE_HEAD_SHA_MISMATCH");
if(!Array.isArray(p?.steps) || !p.steps.length) fail("PROFILE_STEPS_MISSING");
const ids=new Set();
const scripts=new Set();
for(const step of p.steps){
  if(!step || typeof step.id!=="string" || !/^[A-Za-z0-9:_-]+$/.test(step.id)) fail("PROFILE_STEP_ID_INVALID");
  if(ids.has(step.id)) fail("PROFILE_STEP_ID_DUPLICATE");
  ids.add(step.id);
  if(typeof step.script!=="string" || !/^[A-Za-z0-9:_-]+$/.test(step.script)) fail("PROFILE_STEP_SCRIPT_INVALID");
  if(scripts.has(step.script)) fail("PROFILE_STEP_SCRIPT_DUPLICATE");
  scripts.add(step.script);
  const artifacts=step.artifacts??[];
  if(!Array.isArray(artifacts)) fail("PROFILE_ARTIFACTS_INVALID");
  const artifactPaths=new Set();
  for(const artifact of artifacts){
    if(!artifact || typeof artifact.path!=="string" || !artifact.path.trim()) fail("PROFILE_ARTIFACT_PATH_INVALID");
    if(path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]+/).includes("..")) fail("PROFILE_ARTIFACT_PATH_ESCAPE");
    if(artifactPaths.has(artifact.path)) fail("PROFILE_ARTIFACT_DUPLICATE");
    artifactPaths.add(artifact.path);
  }
}
const raw=fs.readFileSync(process.env.XIIO_PROFILE_PATH);
process.stdout.write(JSON.stringify({
  ...p,
  profile_sha256:crypto.createHash("sha256").update(raw).digest("hex")
}));
NODE
if [ "$PROFILE_RC" -ne 0 ] || [ ! -s "$PROFILE_NORMALIZED" ]; then
  blocked GATE_PROFILE_INVALID accepted_product_gate_profile
  exit 2
fi

PROFILE_JSON=$(cat "$PROFILE_NORMALIZED")
PRODUCT_REF=$(PROFILE_JSON="$PROFILE_JSON" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_JSON).product_ref)')
PROFILE_AUTHORITY_REF=$(PROFILE_JSON="$PROFILE_JSON" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_JSON).acceptance.authority_ref)')
PROFILE_SHA256=$(PROFILE_JSON="$PROFILE_JSON" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_JSON).profile_sha256)')
REQUIRED_GATES_JSON=$(PROFILE_JSON="$PROFILE_JSON" node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.env.PROFILE_JSON).steps.map(x=>x.id)))')

if [ ! -f package.json ]; then
  blocked PACKAGE_JSON_REQUIRED accepted_product_gate_profile
  exit 2
fi
PROFILE_JSON="$PROFILE_JSON" node - <<'NODE' || {
const fs=require("fs");
const p=JSON.parse(process.env.PROFILE_JSON);
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
for(const step of p.steps){
  if(typeof pkg.scripts?.[step.script]!=="string" || !pkg.scripts[step.script].trim()){
    console.error("PROFILE_STEP_SCRIPT_NOT_DECLARED:"+step.id+":"+step.script);
    process.exit(21);
  }
}
NODE
  blocked PROFILE_STEP_SCRIPT_NOT_DECLARED exact_profile_step
  exit 2
}

GATE_RC=0
OUTCOME=success
EXECUTED_GATES_JSON='[]'
ARTIFACT_EVIDENCE_JSON='[]'
FIRST_RED=''
mapfile -t PROFILE_STEPS < <(PROFILE_JSON="$PROFILE_JSON" node -e 'for(const x of JSON.parse(process.env.PROFILE_JSON).steps) console.log(Buffer.from(JSON.stringify(x)).toString("base64"))')
for encoded in "${PROFILE_STEPS[@]}"; do
  step_json=$(printf '%s' "$encoded" | base64 -d)
  gate_id=$(STEP_JSON="$step_json" node -e 'process.stdout.write(JSON.parse(process.env.STEP_JSON).id)')
  gate_script=$(STEP_JSON="$step_json" node -e 'process.stdout.write(JSON.parse(process.env.STEP_JSON).script)')
  cmd="npm run $gate_script"
  step "$cmd"
  rc=0
  npm run "$gate_script" >>"$LOG" 2>&1 || rc=$?
  EXECUTED_GATES_JSON=$(EXECUTED_GATES_JSON="$EXECUTED_GATES_JSON" GATE_NAME="$gate_id" GATE_SCRIPT="$gate_script" GATE_COMMAND="$cmd" GATE_EXIT="$rc" node -e '
    const xs=JSON.parse(process.env.EXECUTED_GATES_JSON);
    xs.push({gate:process.env.GATE_NAME,script:process.env.GATE_SCRIPT,command:process.env.GATE_COMMAND,exit:+process.env.GATE_EXIT});
    process.stdout.write(JSON.stringify(xs));')
  if [ "$rc" -ne 0 ]; then
    GATE_RC=$rc
    OUTCOME=failure
    FIRST_RED="REQUIRED_GATE_FAILED:$gate_id"
    break
  fi

  mapfile -t STEP_ARTIFACTS < <(STEP_JSON="$step_json" node -e 'for(const x of (JSON.parse(process.env.STEP_JSON).artifacts??[])) console.log(x.path)')
  for artifact_ref in "${STEP_ARTIFACTS[@]}"; do
    artifact_path=$(realpath -e "$TARGET/$artifact_ref" 2>>"$LOG") || {
      OUTCOME=incomplete
      GATE_RC=3
      FIRST_RED="REQUIRED_ARTIFACT_MISSING:$gate_id:$artifact_ref"
      break 2
    }
    case "$artifact_path" in
      "$TARGET"/*) [ -f "$artifact_path" ] || {
        OUTCOME=incomplete
        GATE_RC=3
        FIRST_RED="REQUIRED_ARTIFACT_NOT_FILE:$gate_id:$artifact_ref"
        break 2
      } ;;
      *)
        OUTCOME=blocked
        GATE_RC=2
        FIRST_RED="REQUIRED_ARTIFACT_ESCAPE:$gate_id:$artifact_ref"
        break 2
        ;;
    esac
    artifact_sha=$(sha256sum "$artifact_path" | cut -d' ' -f1)
    artifact_bytes=$(wc -c <"$artifact_path" | tr -d ' ')
    ARTIFACT_EVIDENCE_JSON=$(ARTIFACT_EVIDENCE_JSON="$ARTIFACT_EVIDENCE_JSON" GATE_NAME="$gate_id" ARTIFACT_REF="$artifact_ref" ARTIFACT_SHA="$artifact_sha" ARTIFACT_BYTES="$artifact_bytes" node -e '
      const xs=JSON.parse(process.env.ARTIFACT_EVIDENCE_JSON);
      xs.push({gate:process.env.GATE_NAME,path:process.env.ARTIFACT_REF,sha256:process.env.ARTIFACT_SHA,bytes:+process.env.ARTIFACT_BYTES,readback:"LOCAL_FILE_SHA256"});
      process.stdout.write(JSON.stringify(xs));')
  done
done

CMD=$(PROFILE_JSON="$PROFILE_JSON" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_JSON).steps.map(x=>"npm run "+x.script).join(" && "))')
PROFILE_EVAL=$(REQUIRED_GATES_JSON="$REQUIRED_GATES_JSON" EXECUTED_GATES_JSON="$EXECUTED_GATES_JSON" OUTCOME="$OUTCOME" FIRST_RED="$FIRST_RED" node - <<'NODE'
const required=JSON.parse(process.env.REQUIRED_GATES_JSON);
const executed=JSON.parse(process.env.EXECUTED_GATES_JSON);
const attempted=new Map(executed.map(x=>[x.gate,x.exit]));
const missing=required.filter(x=>!attempted.has(x));
const failed=required.filter(x=>attempted.has(x) && attempted.get(x)!==0);
let status,complete=false;
if(process.env.OUTCOME==="incomplete"){
  status="INCOMPLETE_REQUIRED_ARTIFACTS";
}else if(process.env.OUTCOME==="blocked"){
  status="BLOCKED_REQUIRED_ARTIFACT_READBACK";
}else if(missing.length){
  status="INCOMPLETE_REQUIRED_GATES";
}else if(failed.length || process.env.OUTCOME==="failure"){
  status="REQUIRED_GATE_FAILURE";
}else{
  status="GATE_PROFILE_COMPLETE_PENDING_EXECUTOR_QUALIFICATION";
  complete=true;
}
process.stdout.write(JSON.stringify({status,complete,missing,first_red:process.env.FIRST_RED||null}));
NODE
)
GATE_PROFILE_STATUS=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_EVAL).status)')
GATE_PROFILE_COMPLETE=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(String(JSON.parse(process.env.PROFILE_EVAL).complete))')
MISSING_GATES_JSON=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.env.PROFILE_EVAL).missing))')
FIRST_RED=$(PROFILE_EVAL="$PROFILE_EVAL" node -e 'process.stdout.write(JSON.parse(process.env.PROFILE_EVAL).first_red||"")')
LOG_SHA=$(sha256sum "$LOG" | cut -d' ' -f1)
export REPO SHA CMD OUTCOME TREE WD INSTALL_RC GATE_RC NODE_V BUN_V LOG_SHA OUT
export PROFILE_REF PRODUCT_REF PROFILE_AUTHORITY_REF PROFILE_SHA256
export REQUIRED_GATES_JSON EXECUTED_GATES_JSON ARTIFACT_EVIDENCE_JSON GATE_PROFILE_STATUS GATE_PROFILE_COMPLETE MISSING_GATES_JSON FIRST_RED
RECEIPT_RC=0
node -e '
const e=process.env,r={schema:"xiio.repo-gate-receipt/v1",repository:e.REPO,head_sha:e.SHA,
 ref:null,event:"replay",run_id:null,runner:"replay:"+require("os").hostname(),command:e.CMD||null,
 outcome:e.OUTCOME,written_at:new Date().toISOString(),work_ref:e.XIIO_REPLAY_WORK_REF||null,
 product_ref:e.PRODUCT_REF,gate_profile_ref:e.PROFILE_REF,gate_profile_authority_ref:e.PROFILE_AUTHORITY_REF,
 gate_profile_sha256:e.PROFILE_SHA256,required_gates:JSON.parse(e.REQUIRED_GATES_JSON),
 executed_gates:JSON.parse(e.EXECUTED_GATES_JSON),artifact_evidence:JSON.parse(e.ARTIFACT_EVIDENCE_JSON),
 missing_required_gates:JSON.parse(e.MISSING_GATES_JSON),first_red:e.FIRST_RED||null,
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
if [ "$OUTCOME" = failure ]; then exit 1; fi
if [ "$OUTCOME" = blocked ]; then
  echo "XIIO_REPLAY=BLOCKED first_red=$FIRST_RED"
  exit 2
fi
if [ "$OUTCOME" = incomplete ] || [ "$GATE_PROFILE_COMPLETE" != true ]; then
  echo "XIIO_REPLAY=INCOMPLETE first_red=${FIRST_RED:-REQUIRED_PROFILE_NOT_COMPLETE}"
  exit 3
fi
exit 0
