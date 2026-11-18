#!/usr/bin/env bash
set -euo pipefail
SCRIPT=${1:?replay script}
SHA=975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e
TEMP=$(mktemp -d)
REAL_NODE=$(command -v node)
trap 'rm -rf -- "$TEMP"' EXIT
mkdir -p "$TEMP/bin"

cat > "$TEMP/profile-template.json" <<'JSON'
{
  "schema":"xiio.repo-gate-profile/v1",
  "product_ref":"game:veilrift",
  "head_sha":"975d23a2e5c4fc61fa7da6320b8ff659ffdb4d2e",
  "acceptance":{"status":"ACCEPTED","authority_ref":"product-profile:test-owner"},
  "steps":[
    {"id":"verify","script":"verify","artifacts":[]},
    {"id":"qa-release","script":"qa:release","artifacts":[{"path":"artifacts/release.json"}]}
  ]
}
JSON

cat > "$TEMP/bin/git" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = clone ]; then
  dest="${@: -1}"
  mkdir -p "$dest/.xiio"
  if [ "${XIIO_TEST_PACKAGE_MODE:-full}" = verify_only ]; then
    cat > "$dest/package.json" <<'JSON'
{"scripts":{"verify":"true"}}
JSON
  else
    cat > "$dest/package.json" <<'JSON'
{"scripts":{"verify":"true","qa:release":"true"}}
JSON
  fi
  if [ "${XIIO_TEST_LOCK_MODE:-present}" = present ]; then
    printf '{"lockfileVersion":3,"packages":{}}\n' > "$dest/package-lock.json"
  fi
  cp "$XIIO_TEST_PROFILE_TEMPLATE" "$dest/.xiio/replay-profile.json"
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
if [ "$1" = -v ]; then echo v22.0.0; else exec "$XIIO_TEST_REAL_NODE" "$@"; fi
MOCK
chmod +x "$TEMP/bin/node"

cat > "$TEMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = install ] || [ "$1" = ci ]; then
  [ -n "${XIIO_TEST_INSTALL_MARKER:-}" ] && : > "$XIIO_TEST_INSTALL_MARKER"
  exit 0
fi
if [ "$1" = run ] && [ "$2" = verify ]; then exit 0; fi
if [ "$1" = run ] && [ "$2" = qa:release ]; then
  rc="${XIIO_TEST_QA_RC:-0}"
  if [ "$rc" = 0 ] && [ "${XIIO_TEST_ARTIFACT_MODE:-present}" = present ]; then
    mkdir -p artifacts
    printf '{"state":"PASS","source":"synthetic"}\n' > artifacts/release.json
  fi
  exit "$rc"
fi
exit 1
MOCK
chmod +x "$TEMP/bin/npm"

run_replay() {
  local out=$1
  mkdir -p "$out"
  local profile_sha custody="$out/profile-custody.json"
  profile_sha="$(sha256sum "$TEMP/profile-template.json" | cut -d' ' -f1)"
  cat > "$custody" <<JSON
{"schema":"xiio.repo-gate-profile-custody/v1","state":"ACCEPTED_READBACK","repository":"Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026","head_sha":"$SHA","profile_ref":".xiio/replay-profile.json","profile_sha256":"$profile_sha","authority_ref":"product-profile:test-owner","readback_ref":"readback:test-profile:$SHA"}
JSON
  local rc=0
  XIIO_TEST_REAL_NODE="$REAL_NODE" XIIO_TEST_PROFILE_TEMPLATE="$TEMP/profile-template.json" PATH="$TEMP/bin:$PATH"     XIIO_REPLAY_OUT="$out" XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_REPLAY_PROFILE_CUSTODY="$custody"     XIIO_REPLAY_WORK_REF='game:159'     XIIO_TEST_PACKAGE_MODE="${XIIO_TEST_PACKAGE_MODE:-full}"     XIIO_TEST_QA_RC="${XIIO_TEST_QA_RC:-0}"     XIIO_TEST_ARTIFACT_MODE="${XIIO_TEST_ARTIFACT_MODE:-present}"     XIIO_TEST_LOCK_MODE="${XIIO_TEST_LOCK_MODE:-present}"     XIIO_TEST_INSTALL_MARKER="${XIIO_TEST_INSTALL_MARKER:-}"     bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"       >"$out/stdout.log" 2>"$out/stderr.log" || rc=$?
  echo "$rc"
}

# No accepted product profile means there is no qualification denominator.
OUT0="$TEMP/no-profile"; mkdir -p "$OUT0"; rc=0
INSTALL_MARKER0="$OUT0/install-called"
XIIO_TEST_REAL_NODE="$REAL_NODE" XIIO_TEST_PROFILE_TEMPLATE="$TEMP/profile-template.json" PATH="$TEMP/bin:$PATH" XIIO_REPLAY_OUT="$OUT0" XIIO_TEST_INSTALL_MARKER="$INSTALL_MARKER0"   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"   >"$OUT0/stdout.log" 2>"$OUT0/stderr.log" || rc=$?
[ "$rc" = 2 ] || { echo "FAIL: no-profile returned $rc"; exit 1; }
grep -q 'first_red=GATE_PROFILE_REQUIRED' "$OUT0/stdout.log"
[ ! -e "$INSTALL_MARKER0" ] || { echo "FAIL: install ran before profile validation"; exit 1; }

# Checkout self-declaration is not independent profile acceptance.
OUTC="$TEMP/no-custody"; mkdir -p "$OUTC"; rc=0
INSTALL_MARKER_C="$OUTC/install-called"
XIIO_TEST_REAL_NODE="$REAL_NODE" XIIO_TEST_PROFILE_TEMPLATE="$TEMP/profile-template.json" PATH="$TEMP/bin:$PATH" \
  XIIO_REPLAY_OUT="$OUTC" XIIO_REPLAY_PROFILE='.xiio/replay-profile.json' XIIO_TEST_INSTALL_MARKER="$INSTALL_MARKER_C" \
  bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA" \
  >"$OUTC/stdout.log" 2>"$OUTC/stderr.log" || rc=$?
[ "$rc" = 2 ] || { echo "FAIL: no-custody returned $rc"; exit 1; }
grep -q 'first_red=GATE_PROFILE_CUSTODY_REQUIRED' "$OUTC/stdout.log"
[ ! -e "$INSTALL_MARKER_C" ] || { echo "FAIL: install ran without independent profile custody"; exit 1; }

# Accepted profile requires qa:release; product source omitting that named script is blocked.
OUT1="$TEMP/omitted-qa"
XIIO_TEST_PACKAGE_MODE=verify_only
rc=$(run_replay "$OUT1")
unset XIIO_TEST_PACKAGE_MODE
[ "$rc" = 2 ] || { echo "FAIL: omitted qa:release returned $rc"; exit 1; }
grep -q 'first_red=PROFILE_STEP_SCRIPT_NOT_DECLARED' "$OUT1/stdout.log"

# Full accepted profile executes every step and hashes the required artifact.
OUT2="$TEMP/full"
rc=$(run_replay "$OUT2")
[ "$rc" = 0 ] || { echo "FAIL: full profile returned $rc"; exit 1; }
node - "$OUT2/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.gate_profile_status!=='GATE_PROFILE_COMPLETE_PENDING_EXECUTOR_QUALIFICATION')
  throw Error(r.gate_profile_status);
if(r.gate_profile_complete!==true||r.release_qualified!==false)
  throw Error('profile completion crossed #337 authority boundary');
if(r.required_gates?.join(',')!=='verify,qa-release') throw Error('required denominator drift');
if(r.executed_gates?.map(x=>x.gate).join(',')!=='verify,qa-release') throw Error('step order drift');
if(r.executed_gates.some(x=>x.exit!==0)) throw Error('passing steps recorded red');
if(r.artifact_evidence?.length!==1) throw Error('required artifact not read back');
const a=r.artifact_evidence[0];
if(a.gate!=='qa-release'||a.path!=='artifacts/release.json'||!/^[a-f0-9]{64}$/.test(a.sha256)||a.bytes<=0)
  throw Error('artifact evidence incomplete');
if(r.replay?.equivalence_status!=='UNAPPROVED_PENDING_OWNER_REVIEW')
  throw Error('replay self-approved executor');
NODE

# An executed browser/release failure is a failure, not a missing step and not qualification.
OUT3="$TEMP/qa-red"
XIIO_TEST_QA_RC=17
rc=$(run_replay "$OUT3")
unset XIIO_TEST_QA_RC
[ "$rc" = 1 ] || { echo "FAIL: qa-red returned $rc"; exit 1; }
node - "$OUT3/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='failure'||r.gate_profile_status!=='REQUIRED_GATE_FAILURE') throw Error('qa failure misclassified');
if(r.executed_gates?.at(-1)?.gate!=='qa-release'||r.executed_gates.at(-1).exit!==17)
  throw Error('qa failure not recorded');
if(r.release_qualified!==false) throw Error('failed profile credited');
NODE

# A green step without its declared artifact is incomplete and cannot earn profile completion.
OUT4="$TEMP/missing-artifact"
XIIO_TEST_ARTIFACT_MODE=missing
rc=$(run_replay "$OUT4")
unset XIIO_TEST_ARTIFACT_MODE
[ "$rc" = 3 ] || { echo "FAIL: missing artifact returned $rc"; exit 1; }
node - "$OUT4/xiio-gate-receipt.json" <<'NODE'
const r=require(process.argv[2]);
if(r.outcome!=='incomplete'||r.gate_profile_status!=='INCOMPLETE_REQUIRED_ARTIFACTS')
  throw Error('missing artifact misclassified');
if(r.gate_profile_complete!==false||r.release_qualified!==false) throw Error('missing artifact credited');
if(!String(r.first_red).startsWith('REQUIRED_ARTIFACT_MISSING:qa-release:artifacts/release.json'))
  throw Error('first missing artifact not preserved');
NODE

# Accepted profile with package.json but no lockfile must refuse before dependency install.
OUTLOCK="$TEMP/no-lockfile"
XIIO_TEST_LOCK_MODE=missing
INSTALL_MARKER_LOCK="$OUTLOCK/install-called"
XIIO_TEST_INSTALL_MARKER="$INSTALL_MARKER_LOCK"
rc=$(run_replay "$OUTLOCK")
unset XIIO_TEST_LOCK_MODE XIIO_TEST_INSTALL_MARKER
[ "$rc" = 2 ] || { echo "FAIL: no-lockfile returned $rc"; exit 1; }
grep -q 'first_red=LOCKFILE_REQUIRED' "$OUTLOCK/stdout.log"
[ ! -e "$INSTALL_MARKER_LOCK" ] || { echo "FAIL: unlocked install executed"; exit 1; }

# Legacy caller-owned gate lists are no longer an admission surface.
OUT5="$TEMP/legacy-list"; mkdir -p "$OUT5"; rc=0
XIIO_TEST_REAL_NODE="$REAL_NODE" PATH="$TEMP/bin:$PATH" XIIO_REPLAY_OUT="$OUT5"   XIIO_REPLAY_REQUIRED_GATES='verify,qa:release'   bash "$SCRIPT" Vado42-chris/VeilRIFT-Pandora-s-Cube--Nov-7-2026 "$SHA"   >"$OUT5/stdout.log" 2>"$OUT5/stderr.log" || rc=$?
[ "$rc" = 2 ] || { echo "FAIL: legacy gate list returned $rc"; exit 1; }
grep -q 'first_red=LEGACY_GATE_LIST_REFUSED' "$OUT5/stdout.log"

echo 'PASS: accepted profile denominator, step execution and artifact readback fail closed'
