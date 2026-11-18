#!/usr/bin/env bash
set -euo pipefail
SCRIPT=${1:?replay script}
SHA=975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e
TEMP=$(mktemp -d)
REAL_NODE=$(command -v node)
trap 'rm -r -- "$TEMP"' EXIT
mkdir -p "$TEMP/bin"

cat > "$TEMP/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [ "${XIIO_TEST_FAIL_MODE:-auth}" = success ]; then
  if [ "$1" = clone ]; then
    dest="${@: -1}"
    mkdir -p "$dest/.xiio"
    cat > "$dest/package.json" <<'JSON'
{"scripts":{"verify":"node -e \"require('fs').writeFileSync('artifact.txt','verified-artifact')\""}}
JSON
    cat > "$dest/.xiio/replay-profile.json" <<'JSON'
{
  "schema":"xiio.repo-gate-profile/v1",
  "product_ref":"test:product",
  "head_sha":"975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e",
  "acceptance":{"status":"ACCEPTED","authority_ref":"test:owner"},
  "steps":[{"id":"verify","script":"verify","artifacts":[{"path":"artifact.txt"}]}]
}
JSON
    exit 0
  fi
  if [ "$1" = -C ] && [ "$3" = checkout ]; then exit 0; fi
  if [ "$1" = -C ] && [ "$3" = rev-parse ]; then echo 0123456789abcdef0123456789abcdef01234567; exit 0; fi
  exit 1
fi
if [ "${XIIO_TEST_FAIL_MODE:-auth}" = auth ]; then
  echo "fatal: could not read Username for 'https://github.com': terminal prompts disabled" >&2
else
  echo "fatal: transport unavailable" >&2
fi
exit 128
MOCK
chmod +x "$TEMP/bin/git"

cat > "$TEMP/bin/node" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -v ]; then echo v22.0.0; else exec "$XIIO_TEST_REAL_NODE" "$@"; fi
MOCK
chmod +x "$TEMP/bin/node"

cat > "$TEMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = install ] || [ "$1" = ci ]; then exit 0; fi
if [ "$1" = run ] && [ "$2" = verify ]; then
  rc="${XIIO_TEST_GATE_RC:-0}"
  if [ "$rc" = 0 ]; then printf 'verified-artifact' > artifact.txt; fi
  exit "$rc"
fi
exit 1
MOCK
chmod +x "$TEMP/bin/npm"

for mode in auth generic; do
  mkdir -p "$TEMP/out-$mode"
  actual_rc=0
  XIIO_TEST_FAIL_MODE="$mode" XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"     XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-$mode"     bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"     >"$TEMP/out-$mode/stdout.log" || actual_rc=$?
  [ "$actual_rc" = 2 ] || { echo "FAIL: $mode returned $actual_rc, expected 2"; exit 1; }
  node - "$TEMP/out-$mode/xiio-gate-receipt.json" "$mode" "$SHA" <<'NODE'
const fs=require('fs');
const crypto=require('crypto');
const [path,mode,sha]=process.argv.slice(2);
const r=JSON.parse(fs.readFileSync(path,'utf8'));
const reason=mode==='auth'?'AUTHENTICATED_CHECKOUT_UNAVAILABLE':'CHECKOUT_FAILED';
const wake=mode==='auth'?'authenticated_checkout_on_qualified_worker':'checkout_surface_ready';
for(const [k,v] of Object.entries({schema:'xiio.repo-gate-receipt/v1',outcome:'blocked',first_red:reason,head_sha:sha,work_ref:'game:159#sprite:188'}))
  if(r[k]!==v) throw Error(`${mode} ${k}: expected ${v}, got ${r[k]}`);
if(r.wake?.condition!==wake || r.wake?.resume_same_work!==true || r.wake?.required_head!==sha)
  throw Error(`${mode}: bad wake binding`);
const reg=r.wake?.cadence_registration;
const expected='provider-availability:'+crypto.createHash('sha256')
  .update(JSON.stringify([reg.occurrence_ref,reg.provider,reg.acquisition_ref,reg.wake_condition_ref]))
  .digest('hex').slice(0,24);
if(r.wake.ref!==expected) throw Error(`${mode}: wake ref mismatch`);
if(r.runner!==null || r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error(`${mode}: blocker misrepresented as executed or approved`);
NODE
done

mkdir -p "$TEMP/out-unbound"
unbound_rc=0
XIIO_TEST_FAIL_MODE=auth XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"   XIIO_REPLAY_OUT="$TEMP/out-unbound"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"   >"$TEMP/out-unbound/stdout.log" || unbound_rc=$?
[ "$unbound_rc" = 2 ] || { echo 'FAIL: missing Work was admitted'; exit 1; }

# The historical false-green: arbitrary shell input must be refused before replay.
mkdir -p "$TEMP/out-noop"
noop_rc=0
XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"   XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-noop"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" true   >"$TEMP/out-noop/stdout.log" || noop_rc=$?
[ "$noop_rc" = 2 ] || { echo "FAIL: arbitrary true returned $noop_rc"; exit 1; }
grep -q 'first_red=ARBITRARY_GATE_COMMAND_REFUSED' "$TEMP/out-noop/stdout.log" || exit 1

mkdir -p "$TEMP/out-success"
XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"   XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_REPLAY_WORK_REF='game:159#sprite:188'   XIIO_REPLAY_OUT="$TEMP/out-success"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"   >"$TEMP/out-success/stdout.log"
node - "$TEMP/out-success/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='success'||r.gate_profile_complete!==true||r.release_qualified!==false)
  throw Error('accepted profile replay misclassified');
if(r.required_gates?.join(',')!=='verify'||r.executed_gates?.[0]?.script!=='verify'||r.executed_gates[0].exit!==0)
  throw Error('profile step execution mismatch');
if(r.artifact_evidence?.length!==1||!/^[a-f0-9]{64}$/.test(r.artifact_evidence[0].sha256)||
   r.artifact_evidence[0].readback!=='LOCAL_FILE_SHA256')
  throw Error('artifact readback missing');
if(r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error('replay self-approved executor');
NODE

# Passing and failing profile steps both require a durable receipt.
for rc in 0 17; do
  tag="rc$rc"
  mkdir -p "$TEMP/out-receipt-$tag/xiio-gate-receipt.json"
  actual_rc=0
  XIIO_TEST_FAIL_MODE=success XIIO_TEST_GATE_RC="$rc" XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"     XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_REPLAY_WORK_REF='game:159#sprite:188'     XIIO_REPLAY_OUT="$TEMP/out-receipt-$tag"     bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"       >"$TEMP/out-receipt-$tag/stdout.log" 2>"$TEMP/out-receipt-$tag/stderr.log" || actual_rc=$?
  [ "$actual_rc" = 2 ] || { echo "FAIL: unwritable receipt rc=$rc returned $actual_rc"; exit 1; }
  grep -q 'first_red=RECEIPT_WRITE_FAILED' "$TEMP/out-receipt-$tag/stdout.log" || exit 1
done

mkdir -p "$TEMP/out-gate-red"
gate_rc=0
XIIO_TEST_FAIL_MODE=success XIIO_TEST_GATE_RC=17 XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"   XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_REPLAY_WORK_REF='game:159#sprite:188'   XIIO_REPLAY_OUT="$TEMP/out-gate-red"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"     >"$TEMP/out-gate-red/stdout.log" || gate_rc=$?
[ "$gate_rc" = 1 ] || { echo "FAIL: gate rejection returned $gate_rc"; exit 1; }
node - "$TEMP/out-gate-red/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='failure'||r.gate_profile_status!=='REQUIRED_GATE_FAILURE'||
   r.executed_gates?.[0]?.exit!==17||r.release_qualified!==false)
  throw Error('gate failure lost or replay qualification manufactured');
NODE

invalid_rc=0
bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 short-sha   >"$TEMP/invalid.log" || invalid_rc=$?
[ "$invalid_rc" = 2 ] || { echo "FAIL: invalid SHA admitted"; exit 1; }
grep -q 'first_red=SHA_NOT_FULL_40_HEX' "$TEMP/invalid.log" || exit 1

before=$(sha256sum "$TEMP/out-success/xiio-gate-receipt.json" | cut -d' ' -f1)
collision_rc=0
XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH"   XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_REPLAY_WORK_REF='game:159#sprite:188'   XIIO_REPLAY_OUT="$TEMP/out-success"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"     >"$TEMP/collision.log" || collision_rc=$?
[ "$collision_rc" = 2 ] || { echo 'FAIL: existing receipt overwritten'; exit 1; }
grep -q 'first_red=RECEIPT_ALREADY_EXISTS' "$TEMP/collision.log" || exit 1
after=$(sha256sum "$TEMP/out-success/xiio-gate-receipt.json" | cut -d' ' -f1)
[ "$before" = "$after" ] || { echo 'FAIL: existing receipt bytes changed'; exit 1; }

echo 'PASS: replay refuses arbitrary commands and preserves source-bound profile evidence'
