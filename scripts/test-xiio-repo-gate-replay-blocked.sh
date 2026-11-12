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
  if [ "$1" = clone ]; then mkdir -p "${@: -1}"; exit 0; fi
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

for mode in auth generic; do
  mkdir -p "$TEMP/out-$mode"
  actual_rc=0
  XIIO_TEST_FAIL_MODE="$mode" XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" \
    XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-$mode" \
    bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" \
    >"$TEMP/out-$mode/stdout.log" || actual_rc=$?
  [ "$actual_rc" = 2 ] || { echo "FAIL: $mode returned $actual_rc, expected 2"; exit 1; }
  node - "$TEMP/out-$mode/xiio-gate-receipt.json" "$mode" "$SHA" <<'NODE'
const fs=require('fs');
const crypto=require('crypto');
const [path,mode,sha]=process.argv.slice(2);
const r=JSON.parse(fs.readFileSync(path,'utf8'));
const reason=mode==='auth'?'AUTHENTICATED_CHECKOUT_UNAVAILABLE':'CHECKOUT_FAILED';
const wake=mode==='auth'?'authenticated_checkout_on_qualified_worker':'checkout_surface_ready';
for(const [k,v] of Object.entries({schema:'xiio.repo-gate-receipt/v1',outcome:'blocked',first_red:reason,head_sha:sha,work_ref:'game:159#sprite:188'})) {
  if(r[k]!==v) throw Error(`${mode} ${k}: expected ${v}, got ${r[k]}`);
}
if(r.wake?.condition!==wake || r.wake?.resume_same_work!==true || r.wake?.required_head!==sha)
  throw Error(`${mode}: bad wake binding`);
if(r.cadence_return?.outcome_class!=='PROVIDER_UNAVAILABLE' ||
   r.cadence_return?.applied!==false ||
   r.cadence_return?.provider_effect_state!=='NOT_PERFORMED' ||
   r.cadence_return?.wake_refs?.[0]!==r.wake?.ref ||
   r.wake?.native_readback_required!==true)
  throw Error(`${mode}: Cadence wake candidate invalid or misrepresented as applied`);
const reg=r.wake?.cadence_registration;
if(reg?.occurrence_ref!=='game:159#sprite:188'||reg?.provider!=='github-checkout'||
   reg?.acquisition_ref!==`github-commit:${r.repository}@${sha}`)
  throw Error(`${mode}: wake does not retain exact acquisition and Work`);
const expected='provider-availability:'+crypto.createHash('sha256')
  .update(JSON.stringify([reg.occurrence_ref,reg.provider,reg.acquisition_ref,reg.wake_condition_ref]))
  .digest('hex').slice(0,24);
if(r.wake.ref!==expected)throw Error(`${mode}: wake ref mismatches Cadence #44 projection`);
if(r.runner!==null || r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error(`${mode}: blocker misrepresented as executed or approved`);
console.log(`PASS: ${mode} failed checkout creates typed exact-work wake receipt`);
NODE
done

mkdir -p "$TEMP/out-unbound"
unbound_rc=0
XIIO_TEST_FAIL_MODE=auth XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" \
  XIIO_REPLAY_OUT="$TEMP/out-unbound" \
  bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" \
  >"$TEMP/out-unbound/stdout.log" || unbound_rc=$?
[ "$unbound_rc" = 2 ] || { echo 'FAIL: missing Work was admitted'; exit 1; }
node - "$TEMP/out-unbound/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.work_ref!==null||r.wake?.resume_same_work!==false||r.wake?.ref!==null||
  r.wake?.cadence_registration!==null||r.cadence_return!==null)
  throw Error('unbound Work improperly produced a Cadence wake');
console.log('PASS: unbound Work cannot fabricate a resumable Cadence event');
NODE

mkdir -p "$TEMP/out-success"
XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" \
  XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-success" \
  bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" true \
  >"$TEMP/out-success/stdout.log"
node - "$TEMP/out-success/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='success'||r.head_sha!=='975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e'||
   r.replay?.fresh_clone!==true||r.replay?.gate_exit!==0||
   r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error('successful qualified-form replay receipt misclassified');
console.log('PASS: completed replay preserves unapproved evidence boundary');
NODE

# Both a passing and failing gate must refuse to complete when its receipt is
# unwritable, including when the evidence file path is already a directory.
for gate in true 'exit 17'; do
  tag=$(echo "$gate" | tr -cd '0-9a-zA-Z')
  mkdir -p "$TEMP/out-receipt-$tag/xiio-gate-receipt.json"
  actual_rc=0
  XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" \
    XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-receipt-$tag" \
    bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" "$gate" \
      >"$TEMP/out-receipt-$tag/stdout.log" 2>"$TEMP/out-receipt-$tag/stderr.log" || actual_rc=$?
  [ "$actual_rc" = 2 ] || { echo "FAIL: unwritable receipt for $gate returned $actual_rc"; exit 1; }
  grep -q 'first_red=RECEIPT_WRITE_FAILED' "$TEMP/out-receipt-$tag/stdout.log" || exit 1
  echo "PASS: $gate refuses missing receipt"
done

mkdir -p "$TEMP/out-gate-red"
gate_rc=0
XIIO_TEST_FAIL_MODE=success XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" \
  XIIO_REPLAY_WORK_REF='game:159#sprite:188' XIIO_REPLAY_OUT="$TEMP/out-gate-red" \
  bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" 'exit 17' \
    >"$TEMP/out-gate-red/stdout.log" || gate_rc=$?
[ "$gate_rc" = 1 ] || { echo "FAIL: gate rejection returned $gate_rc"; exit 1; }
node - "$TEMP/out-gate-red/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='failure'||r.replay?.gate_exit!==17||r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error('gate failure lost or replay equivalence manufactured');
console.log('PASS: failed gate retains truthful receipt');
NODE

invalid_rc=0
bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 short-sha \
  >"$TEMP/invalid.log" || invalid_rc=$?
[ "$invalid_rc" = 2 ] || { echo "FAIL: invalid SHA admitted"; exit 1; }
grep -q 'first_red=SHA_NOT_FULL_40_HEX' "$TEMP/invalid.log" || exit 1
echo 'PASS: partial SHA rejected before checkout'
