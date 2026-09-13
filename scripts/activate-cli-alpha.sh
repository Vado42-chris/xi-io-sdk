#!/usr/bin/env bash
set -euo pipefail

[[ -n "${BASH_VERSION:-}" ]] || { echo 'XIIO_CLI_ALPHA_BLOCKED=RUN_IN_BASH' >&2; exit 10; }
printf '%s\n' 'xi-io CLI activation, Bash -> xi -> local Ollama. Kiro is not used.'

SDK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO_ROOT="${XIIO_STUDIO_ROOT:-$(dirname "$SDK_ROOT")}" 
STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/xi-io/cli-alpha"
BIN_ROOT="$HOME/.local/bin"
TARGET="$BIN_ROOT/xi-io"
XI_TARGET="$BIN_ROOT/xi"
RECEIPT="$STATE_ROOT/activation-receipt.json"
BACKUP="$STATE_ROOT/xi-io.previous"
XI_BACKUP="$STATE_ROOT/xi.previous"

find_node() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -name node 2>/dev/null |
    sort -V | tail -n 1
}

NODE_BIN="$(find_node || true)"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || { echo 'XIIO_CLI_ALPHA_BLOCKED=NODE_NOT_FOUND' >&2; exit 20; }
[[ -f "$SDK_ROOT/bin/xi.mjs" ]] || { echo 'XIIO_CLI_ALPHA_BLOCKED=SDK_BINARY_MISSING' >&2; exit 21; }

mkdir -p "$STATE_ROOT" "$BIN_ROOT"
TMP_ROOT="$(mktemp -d "$STATE_ROOT/activation.XXXXXX")"
cleanup() { rm -rf -- "$TMP_ROOT"; }
trap cleanup EXIT

golden_state=PASS
if grep -R -n -F 'kiro-cli' "$SDK_ROOT/bin" "$SDK_ROOT/src" >/dev/null 2>&1; then
  echo 'XIIO_CLI_ALPHA_BLOCKED=KIRO_DEPENDENCY_DETECTED' >&2
  exit 11
fi
subterranean_state=PASS

# Golden track: the real SDK binary must discover and execute its public command surface.
"$NODE_BIN" "$SDK_ROOT/bin/xi.mjs" sdk commands > "$TMP_ROOT/sdk-commands.json" || golden_state=FAIL
"$NODE_BIN" -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if (!p || typeof p!=="object") process.exit(1);
' "$TMP_ROOT/sdk-commands.json" || golden_state=FAIL

# Studio registry is observational. Missing manifests remain visible rather than disappearing.
"$NODE_BIN" - "$STUDIO_ROOT" > "$TMP_ROOT/studio-registry.json" <<'NODE' || golden_state=FAIL
const fs=require('fs'), path=require('path');
const root=path.resolve(process.argv[2]);
const rows=[];
for (const e of fs.readdirSync(root,{withFileTypes:true})) {
  if (!e.isDirectory() || e.name.startsWith('.')) continue;
  const dir=path.join(root,e.name);
  const refs=['xiio/managed-project.manifest.json','xiio/planning-state.json','package.json'];
  const found=refs.find(r=>fs.existsSync(path.join(dir,r)))||null;
  if (!found && !/^\d+_xi-io|^xi-io/i.test(e.name)) continue;
  rows.push({directory:e.name,root:dir,identity_source:found,state:found?'DISCOVERED':'UNKNOWN_IDENTITY'});
}
rows.sort((a,b)=>a.directory.localeCompare(b.directory));
process.stdout.write(JSON.stringify({schema:'xiio.cli.studio-registry.alpha.v1',observed_at:new Date().toISOString(),studio_root:root,count:rows.length,entries:rows,authority:'DISCOVERY_ONLY'},null,2)+'\n');
NODE

# Subterranean track: malformed or unsupported commands must fail closed without echoing input.
marker="XIIO_SUBTERRANEAN_SECRET_MARKER_9f01"
set +e
printf '%s' "$marker" | "$NODE_BIN" "$SDK_ROOT/bin/xi.mjs" definitely-not-a-command \
  > "$TMP_ROOT/denied.out" 2> "$TMP_ROOT/denied.err"
denied_rc=$?
set -e
[[ "$denied_rc" -ne 0 ]] || subterranean_state=FAIL
if grep -R -F "$marker" "$TMP_ROOT/denied.out" "$TMP_ROOT/denied.err" >/dev/null; then subterranean_state=FAIL; fi

# Missing provider/runtime surfaces are typed states, never activation crashes.
ibal_state=UNREGISTERED
cadence_state=UNREGISTERED
reaper_state=UNREGISTERED
switchboard_state=UNREGISTERED
for dir in "$STUDIO_ROOT"/*; do
  [[ -d "$dir" ]] || continue
  remote="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
  case "$remote" in
    *xi-io-ibal*) ibal_state=DISCOVERED ;;
    *xi-io-cadence*) cadence_state=DISCOVERED ;;
    *xi-io-reaper*) reaper_state=DISCOVERED ;;
    *xi-io-Switchboard*) switchboard_state=DISCOVERED ;;
  esac
done

if [[ "$golden_state" != PASS || "$subterranean_state" != PASS ]]; then
  verdict=FAIL_SIMULATION
else
  verdict=PASS_SIMULATION
fi

"$NODE_BIN" - "$RECEIPT" "$verdict" "$golden_state" "$subterranean_state" \
  "$SDK_ROOT" "$STUDIO_ROOT" "$ibal_state" "$cadence_state" "$reaper_state" "$switchboard_state" <<'NODE'
const fs=require('fs'), path=require('path');
const [receipt,verdict,golden,subterranean,sdk,studio,ibal,cadence,reaper,switchboard]=process.argv.slice(2);
const body={schema:'xiio.cli.alpha-activation-receipt/v1',observed_at:new Date().toISOString(),verdict,tracks:{golden,subterranean},sdk_root:sdk,studio_root:studio,providers:{ibal,cadence,reaper,switchboard},effect_authority:false,installed:false,hard:['SIMULATION_PASS != LIVE','DISCOVERED != QUALIFIED','FAIL_CLOSED_BEFORE_INSTALL']};
fs.mkdirSync(path.dirname(receipt),{recursive:true});
fs.writeFileSync(receipt,JSON.stringify(body,null,2)+'\n',{mode:0o600});
NODE

[[ "$verdict" == PASS_SIMULATION ]] || { echo "XIIO_CLI_ALPHA_BLOCKED=$verdict" >&2; echo "RECEIPT=$RECEIPT"; exit 30; }

# Build and prove a durable launcher with an empty PATH. NVM must not be required in later shells.
cat > "$TMP_ROOT/xi-io" <<WRAPPER
#!/usr/bin/env bash
exec "$NODE_BIN" "$SDK_ROOT/bin/xi.mjs" "\$@"
WRAPPER
chmod 0755 "$TMP_ROOT/xi-io"
if ! env -i HOME="$HOME" "$TMP_ROOT/xi-io" sdk commands > "$TMP_ROOT/empty-path-sdk-commands.json"; then
  echo 'XIIO_CLI_ALPHA_BLOCKED=DURABLE_NODE_WRAPPER_FAILED' >&2
  exit 31
fi

# Atomic activation after both simulations pass. Preserve the previous executable.
if [[ -e "$TARGET" || -L "$TARGET" ]]; then cp -a -- "$TARGET" "$BACKUP"; fi
cp -- "$TMP_ROOT/xi-io" "$TARGET.next"
chmod 0755 "$TARGET.next"
mv -Tf -- "$TARGET.next" "$TARGET"
chmod 0755 "$SDK_ROOT/bin/xi.mjs"
if [[ -e "$XI_TARGET" || -L "$XI_TARGET" ]]; then cp -a -- "$XI_TARGET" "$XI_BACKUP"; fi
cp -- "$TARGET" "$XI_TARGET.next"
chmod 0755 "$XI_TARGET.next"
mv -Tf -- "$XI_TARGET.next" "$XI_TARGET"

"$NODE_BIN" - "$RECEIPT" <<'NODE'
const fs=require('fs'); const p=process.argv[2]; const x=JSON.parse(fs.readFileSync(p,'utf8'));
x.installed=true; x.installed_at=new Date().toISOString(); x.commands=[process.env.HOME+'/.local/bin/xi',process.env.HOME+'/.local/bin/xi-io'];
fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});
NODE

echo 'XIIO_CLI_ALPHA=ACTIVE'
echo "COMMANDS=$XI_TARGET,$TARGET"
echo "RECEIPT=$RECEIPT"
echo "GOLDEN=$golden_state SUBTERRANEAN=$subterranean_state"
