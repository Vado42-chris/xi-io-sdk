#!/usr/bin/env bash
set -euo pipefail
SCRIPT=${1:?replay script}
SHA=975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e
TEMP=$(mktemp -d)
REAL_NODE=$(command -v node)
trap 'rm -rf -- "$TEMP"' EXIT
mkdir -p "$TEMP/bin"

cat > "$TEMP/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = clone ]; then
  dest="${@: -1}"
  mkdir -p "$dest"
  cat > "$dest/package.json" <<'JSON'
{"scripts":{"verify":"true","qa:release":"true"}}
JSON
  exit 0
fi
if [ "$1" = -C ] && [ "$3" = checkout ]; then exit 0; fi
if [ "$1" = -C ] && [ "$3" = rev-parse ]; then
  echo 0123456789abcdef0123456789abcdef01234567
  exit 0
fi
exit 1
MOCK
chmod +x "$TEMP/bin/git"

cat > "$TEMP/bin/node" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -v ]; then
  echo v22.0.0
else
  exec "$XIIO_TEST_REAL_NODE" "$@"
fi
MOCK
chmod +x "$TEMP/bin/node"

cat > "$TEMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = install ] || [ "$1" = ci ]; then exit 0; fi
if [ "$1" = run ] && [ "$2" = verify ]; then exit 0; fi
if [ "$1" = run ] && [ "$2" = qa:release ]; then exit "${XIIO_TEST_QA_RC:-0}"; fi
exit 1
MOCK
chmod +x "$TEMP/bin/npm"

run_replay() {
  local out=$1 requested=$2 qa_rc=${3:-0}
  mkdir -p "$out"
  local rc=0
  XIIO_TEST_REAL_NODE="$REAL_NODE" XIIO_TEST_QA_RC="$qa_rc" PATH="$TEMP/bin:$PATH" \
    XIIO_REPLAY_OUT="$out" \
    XIIO_REPLAY_WORK_REF='game:159' \
    XIIO_REPLAY_REQUIRED_GATES='verify,qa:release' \
    XIIO_REPLAY_REQUESTED_GATES="$requested" \
    bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" \
      >"$out/stdout.log" 2>"$out/stderr.log" || rc=$?
  echo "$rc"
}

OUT1="$TEMP/verify-only"
rc=$(run_replay "$OUT1" 'verify')
[ "$rc" = 3 ] || { echo "FAIL: verify-only returned $rc, expected 3"; exit 1; }
node - "$OUT1/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='success') throw Error('verify itself should have passed');
if(r.gate_profile_status!=='INCOMPLETE_REQUIRED_GATES') throw Error(r.gate_profile_status);
if(r.gate_profile_complete!==false || r.release_qualified!==false) throw Error('partial gate was credited');
if(JSON.stringify(r.required_gates)!==JSON.stringify(['verify','qa:release'])) throw Error('required denominator drift');
if(JSON.stringify(r.requested_gates)!==JSON.stringify(['verify'])) throw Error('requested gates drift');
if(JSON.stringify(r.missing_required_gates)!==JSON.stringify(['qa:release'])) throw Error('missing browser gate not exposed');
if(r.executed_gates?.length!==1 || r.executed_gates[0].gate!=='verify' || r.executed_gates[0].exit!==0)
  throw Error('actual execution record incorrect');
console.log('PASS: verify can pass while release gate profile remains incomplete');
NODE

OUT2="$TEMP/full"
rc=$(run_replay "$OUT2" 'verify,qa:release')
[ "$rc" = 0 ] || { echo "FAIL: full gate list returned $rc"; exit 1; }
node - "$OUT2/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.gate_profile_status!=='GATE_PROFILE_COMPLETE_PENDING_EXECUTOR_QUALIFICATION')
  throw Error(r.gate_profile_status);
if(r.gate_profile_complete!==true || r.release_qualified!==false)
  throw Error('engine crossed qualification authority boundary');
if(r.executed_gates?.map(x=>x.gate).join(',')!=='verify,qa:release')
  throw Error('actual gate order/readback incorrect');
if(r.executed_gates.some(x=>x.exit!==0)) throw Error('passing gates recorded red');
console.log('PASS: complete gate profile remains pending #337 executor qualification');
NODE

OUT3="$TEMP/browser-red"
rc=$(run_replay "$OUT3" 'verify,qa:release' 17)
[ "$rc" = 1 ] || { echo "FAIL: browser-red returned $rc"; exit 1; }
node - "$OUT3/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='failure'||r.gate_profile_status!=='REQUIRED_GATE_FAILURE') throw Error('failed browser gate misclassified');
if(r.missing_required_gates?.length!==0) throw Error('failed gate reported as missing');
if(r.executed_gates?.at(-1)?.gate!=='qa:release'||r.executed_gates.at(-1).exit!==17)
  throw Error('browser failure not recorded');
if(r.release_qualified!==false) throw Error('failed gate credited');
console.log('PASS: executed browser failure is distinct from missing browser gate');
NODE
