#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap } from '../src/baseline/compiler.mjs';
import { compileProductCapabilityBaseline } from '../src/baseline/product-capability.mjs';
import { compilePortableSemanticFile } from '../src/documents/portable-semantic-file.mjs';
import { compileFlatpackPacket, reduceFlatpackArtifact, expandFlatpackArtifact } from '../src/flatpack/executable-packet.mjs';
import { compilePortableArtifactCube } from '../src/documents/portable-artifact-cube.mjs';
import { prepareRegisteredPrimitiveShipment } from '../src/documents/prepare-primitive-shipment.mjs';
import { prepareExternalArtifactShipment } from '../src/documents/prepare-external-artifact-shipment.mjs';
import { artifactProfileCatalog, resolveArtifactProfile, resolveArtifactProfileByMediaType } from '../src/documents/artifact-profile-catalog.mjs';
import { bindHexFloorCurrentness } from '../src/currentness/hex-floor.mjs';
import { compileFractalConsumerReceiptEnvelope } from '../src/receipts/fractal-consumer.mjs';
import { compileFleetDeliveryGate } from '../src/baseline/fleet-delivery.mjs';
import { compileFourScaleScorecard } from '../src/scorecards/four-scale.mjs';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';
import { compileMiniPromptStack, applyMiniPromptReceipt } from '../src/cadence/mini-prompt-stack.mjs';
import { compileStudioHeadlessTopology, compileStudioRoster } from '../src/install/studio-headless-topology.mjs';
import { compileWorkEgressProjection } from '../src/work/egress.mjs';
import { normalizeBaselineCommand, commandCatalog } from '../src/lexicon/baseline-commands.mjs';
import { validateRotflDistributedAck, attachRotflContextToAckSet } from '../src/acks/distributed.mjs';
import { compileLessonPromotion } from '../src/lessons/promotion.mjs';
import { compileGraduationPreflight, profileCatalog } from '../src/preflight/graduation.mjs';
import { compileProgressGateGraduation, progressGatedRoleCatalog } from '../src/preflight/progress-gated-roles.mjs';
import { rotflOrderCatalog } from '../src/preflight/order-of-operations.mjs';
import { runCli, commandLexicon } from '../src/cli/public-exports.mjs';
import { recoverAriesRunner, discoverRunnerServices, discoverRunnerListener } from '../src/recovery/aries-runner.mjs';
import { recoverInboxRuntime } from '../src/recovery/inbox-runtime.mjs';
import { compileLocalCompass, writeCompassReceipt } from '../src/compass/local-truth.mjs';
import { inspectMachineTopology, prepareCargoExecution } from '../src/compass/machine-topology.mjs';
import { readLocalCrmCurrent } from '../src/bridges/crm-current.mjs';
import { compileDependencyCube } from '../src/graphs/dependency-cube.mjs';
import { compileIbalAckRotfl } from '../src/ibal/ack-rotfl-compiler.mjs';
import { reduceMultiplicativeFactors, compileTransitionProofMatrix } from '../src/evaluation/transition-proof-reducer.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };

const SDK_VERSION=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

const CLI_EXIT=Object.freeze({PASS:0,WAIT:1,REJECT:2,INTERNAL:3});
function cliExitForState(state){
  return state==='PASS'?CLI_EXIT.PASS:
    ['PASS_WITH_WAITS','WAIT','TRUE_WAIT','PARTIAL'].includes(state)?CLI_EXIT.WAIT:
    ['FAIL','FAIL_CURRENT','BLOCKED','REJECTED','INVALID'].includes(state)?CLI_EXIT.REJECT:
    CLI_EXIT.INTERNAL;
}
function emitCliResult(command,result,{error=null,stable=false}={}){
  const state=String(result?.state||'INTERNAL');
  const exit_code=cliExitForState(state);
  const body={
    ...(result||{}),
    ...(error?{error}:{}),
    ok:exit_code===0,
    command,
    ...(stable?{}:{timestamp:new Date().toISOString()}),
    exit_code,
    provider_effect:false,
    authority_granted:false,
  };
  process.stdout.write(JSON.stringify(body,null,2)+'\n');
  process.exitCode=exit_code;
  return body;
}
async function readStdinText(){
  const chunks=[];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function fatalCliError(error) {
  const firstRed=String(error?.message || error || 'UNKNOWN_CLI_FAILURE').replace(/\s+/g,' ').slice(0,512);
  if (process.env.XIIO_CLI_DEBUG === '1' && error?.stack) {
    process.stderr.write(String(error.stack) + '\n');
  } else {
    process.stderr.write(JSON.stringify({
      schema:'xiio.cli.error/v1',
      status:'BLOCKED',
      first_red:firstRed,
      provider_effect:false,
      authority_granted:false,
    },null,2)+'\n');
  }
  process.exit(2);
}
process.on('uncaughtException', fatalCliError);
process.on('unhandledRejection', fatalCliError);

function usage(code = 0) {
  const text = `xi-io local operator + SDK CLI

Start here:
  xi-io --version               Show canonical SDK CLI version
  xi-io                         Open local Ollama operator in the current directory
  xi-io <directory>             Open local Ollama operator in that directory
  xi-io --execute               Open with bounded edit/run tools enabled
  xi-io --model llama3.1:8b     Choose an installed Ollama model for this session
  xi-io <directory> --execute   Open that workspace with bounded tools enabled

Human registries:
  xi-io registry                Show command + local tool registries
  xi-io registry commands       Show ACK/baseline/cadence command registry
  xi-io registry ack            Show ACK commands only
  xi-io registry tools          Show local Ollama workspace tools
  xi-io registry sdk            Show exact public SDK callables
  xi-io registry primitives     Show public SDK primitive catalog
  xi-io doctor                  Show workspace/Ollama/tool readiness + disk-truth compass
  xi-io status --json           Read-only CLI/compass/Hex/Studio/Inbox status envelope
  xi-io search status            Read local Search runtime status
  xi-io lifecycle status          Read Studio materialized ROTFL lifecycle
  xi-io lifecycle next            Project current lifecycle selection/returns
  xi-io lifecycle explain         Explain current projection/evidence without recompute
  xi-io search --target files --query <text> [--limit N] [--custody 1]
                                Discover through Inbox local API; --custody 1 explicitly requests local BINS writes
  xi-io gates --check --json    Evaluate fail-closed command-floor gate summary
  xi-io verify --stdin --json   Verify one JSON artifact from stdin
  xi-io verify --file PATH --json
                                Verify one JSON artifact from a file
  xi-io cargo --execute [--workspace DIR] -- <cargo args...>
  xi-io zed ibal status --json  Read binding + live 3-factor Zed/Ibal state
  xi-io zed ibal recover --json Repair binding, launch Zed, run one ACP attempt, reduce first zero
                                Execute Cargo only after explicit local-effect admission inside selected workspace
  xi-io compass                 Resolve HOME/common/Studio/framework/currentness/runtime truth
  xi-io self-test               Test installed CLI, workspace guard, registries, and local runtime
  xi-io models                  List installed Ollama models
  xi-io install                 Install xi-io + xi wrappers into ~/.local/bin

Interactive slash commands:
  /help /workspace /tools /commands /ack /model /models /status /clear /exit

Pure compilers:
  xi-io baseline compile --input <snapshot.json> [--out <baseline.json>]
  xi-io product compile --input <products.json> [--out <product-baseline.json>]
  xi-io flatpack compile --input <packet.json> [--out <flatpack.json>]
  xi-io flatpack reduce --input <packet.json> [--out <reduction.json>]
  xi-io flatpack expand --input <stage1.json> [--out <expansion.json>]
  xi-io receipt fractal --consumer <id> --scale <MICRO|MESO|MACRO|META> --input <vector.json> --producer <ref> --observer <ref> --source <ref> [--readback <ref>] [--out <receipt.json>]
  xi-io file compile --input <file.json> [--out <portable-file.json>]
  xi-io file cube --input <shipping.json> [--out <artifact-cube.json>]
  xi-io file profiles [--out <profiles.json>]
  xi-io file profile --id <profile_id> [--out <profile.json>]
  xi-io file profile --media <mime/type> [--out <profile.json>]
  xi-io file prepare --primitive <id> --generation <sha> [--out <shipment.json>]
  xi-io file prepare --descriptor <json> --file <id> --role <role> --source <ref> --generation <gen> [--profile <id>]
  xi-io fleet delivery --input <fleet-delivery.json> [--out <fleet-gate.json>]
  xi-io 100s compile --input <four-scale.json> [--out <scorecard.json>]
  xi-io preflight compile --input <graduation.json> [--out <preflight.json>]
  xi-io preflight profiles [--out <profiles.json>]
  xi-io preflight role --input <role-graduation.json> [--out <receipt.json>]
  xi-io preflight roles [--out <roles.json>]
  xi-io crm current [--root <root>] [--require <KR-1,KR-2>] [--limit <N>]
  xi-io graph cube --input <dependency-cube.json> [--out <projection.json>]
  xi-io ibal compile-acks --input <ack-pack.json> [--out <rotfl-pack.json>]
  xi-io cadence continue --input <continuation.json> [--out <continuation-result.json>]
  xi-io studio topology --input <install.json> [--out <topology.json>]
  xi-io studio roster --input <registry.json> [--out <roster.json>]
  xi-io stack compile --input <mini-prompt.json> [--out <punchcards.json>]
  xi-io stack reap --input <punchcards.json> --card <C001> --receipt <ref> [--verified true]
  xi-io work egress --input <work-egress.json> [--out <projection.json>]
  xi-io ack distribute --baseline <baseline.json> --rotfl <rotfl-context.json> [--out <acks.json>]
  xi-io ack validate --input <ack.json> [--out <validation.json>]
  xi-io ack order [--out <order.json>]
  xi-io burnmap compile --baseline <baseline.json> [--returns <returns.json>] [--out <burnmap.json>]
  xi-io lesson promote --input <lesson.json> [--out <promotion.json>]

Runtime recovery:
  xi-io runner status                    Fast service/listener observation
  xi-io runner discover                  Existing-runner discovery, no mutation
  xi-io runner diagnose                  Alias of runner discover
  xi-io runner recover [--repo owner/repo --run <id> --job <id> --head <sha>]
                                        Recover existing Aries runner + exact provider readback
  xi-io recover aries-runner             Compatibility plan/check form
  xi-io recover aries-runner --execute [--repo owner/repo --run <id> --job <id> --head <sha>]
  xi-io recover inbox-runtime             Plan exact-current :8791 recovery
  xi-io recover inbox-runtime --execute   Preserve dirty donor, use clean current Inbox, restart, require 8/8

Product runtime:
  xi-io hex status                        Probe Hex loopback :8798
  xi-io hex floor [--file PATH] --json    Read exact HEX floor; default ~/.local/state/xi-io/hex/floor.current.json
  xi-io hex start                         Start existing installed Hex RC
  xi-io hex install                       Install/rejoin Hex RC from current framework
  xi-io hex open                          Open Hex in Studio suite
  xi-io inbox status                      Probe Inbox :8791 health
  xi-io inbox recover                     Recover exact-current Inbox runtime
  xi-io inbox open                        Recover if needed, then open Inbox inside Studio
  xi-io studio status                     Probe Studio :3099
  xi-io studio fractal --json             Read exact Studio fractal receipt ledger
  xi-io studio start                      Start installed Studio shell and require :3099 readback
  xi-io studio open                       Open local Studio
  xi-io studio inbox                      Recover Inbox and open Studio Inbox wrapper

Provider-neutral Ibal envelopes:
  xi-io baseline census|classify|hydrate|qualify|main|destew|sdk|score|burn|return|ratchet [--subject <ref>]

Local Ollama:
  xi-io chat [--execute]
  xi-io                         # same human-facing local operator

Public SDK calculations:
  xi-io sdk commands
  xi-io sdk call <export>       # JSON stdin: {"args":[...]}

Compatibility alias (existing scripts/tests):
  xi baseline compile
  xi product compile
  xi fleet delivery
  xi 100s compile
  xi preflight compile
  xi preflight profiles
  xi preflight role
  xi preflight roles
  xi crm current
  xi graph cube
  xi ibal compile-acks
  xi cadence continue
  xi studio topology
  xi studio roster
  xi stack compile
  xi stack reap
  xi work egress
  xi ack distribute
  xi ack validate
  xi ack order
  xi burnmap compile
  xi lesson promote
  xi sdk commands
  xi sdk call

The local operator uses Ollama only. No automatic cloud fallback.
Workspace tools are bounded to the selected directory.
CLI_COMMAND != AUTHORITY · ACK_PACKET != DELIVERY · RESULT != RETURN != APPLY_RETURN
`;
  (code ? process.stderr : process.stdout).write(text);
  process.exit(code);
}

function args(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`--${key} requires a value`);
      flags[key] = next;
      i += 1;
    } else positionals.push(value);
  }
  return { flags, positionals };
}

function readJson(file, label) {
  if (!file) throw new Error(`${label} path is required`);
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function writeOutput(value, out) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (!out || out === '-') process.stdout.write(payload);
  else fs.writeFileSync(path.resolve(out), payload, 'utf8');
}

function compileBaselineCommandEnvelope(command, flags, trailingPositionals = []) {
  return {
    schema: 'xiio.sdk.baseline-command-envelope/v1',
    command: { id: command.id, verb: command.verb, cli: command.cli, aliases: command.aliases, hashtags: command.hashtags, effect_class: command.effect },
    subject_ref: flags.subject || null,
    baseline_ref: flags.baseline || null,
    resource_ref: flags.resource || null,
    capability_profile_ref: flags.capability || null,
    provider_family: flags.provider || 'ANY_QUALIFIED',
    agent_ref: flags.agent || null,
    args: trailingPositionals,
    state: 'COMPILED_NOT_EXECUTED',
    attempt: 0,
    authority: { source_mutation: false, provider_effect: false, merge: false, deploy: false },
    required_return: {
      schema: 'xiio.sdk.distributed-return/v1',
      fields: ['subject_ref', 'baseline_generation', 'ack_state', 'attempt', 'result_ref', 'return_target_ref', 'blockers', 'observed_at'],
    },
    next: 'IBAL_OR_QUALIFIED_HOST_ADAPTER_RESOLVES_CURRENT_INPUTS_AND_WORKER_FORMATION',
  };
}

function humanCli(value) {
  return String(value || '').replace(/^xi\b/, 'xi-io');
}

function isDirectory(value) {
  if (!value || value.startsWith('-')) return false;
  try { return fs.statSync(path.resolve(value)).isDirectory(); } catch { return false; }
}

async function launchLocalOperator(argv = []) {
  let workspaceArg = null;
  const valueFlags = new Set(['--model','--input']);
  const booleanFlags = new Set(['--execute','--once']);
  for (let i=0;i<argv.length;i+=1) {
    const value=argv[i];
    if (value === 'chat' || value === 'shell' || booleanFlags.has(value)) continue;
    if (valueFlags.has(value)) {
      const selected=argv[i+1];
      if(!selected || selected.startsWith('--')) throw new Error(`${value} requires a value`);
      if (value === '--model') process.env.XIIO_OLLAMA_MODEL=selected;
      i+=1;
      continue;
    }
    if (value.startsWith('-')) continue;
    if (workspaceArg) throw new Error('only one workspace directory may be selected');
    workspaceArg=value;
  }
  if (workspaceArg) {
    const resolved=path.resolve(workspaceArg);
    if(!isDirectory(resolved)) throw new Error('workspace directory not found');
    process.chdir(fs.realpathSync(resolved));
  }
  const { main } = await import('./xi-local-agent.mjs');
  await main();
}

async function registry(kind = 'all') {
  const commands = commandCatalog();
  if (kind === 'commands' || kind === 'all' || kind === 'ack') {
    process.stdout.write(kind === 'ack' ? 'ACK command registry\n' : 'Command registry\n');
    for (const row of commands.commands) {
      if (kind === 'ack' && !row.id.startsWith('ack.')) continue;
      process.stdout.write(`  ${humanCli(row.cli).padEnd(28)} ${row.effect.padEnd(20)} ${row.purpose}\n`);
    }
  }
  if (kind === 'tools' || kind === 'all') {
    const { localToolCatalog } = await import('./xi-local-agent.mjs');
    const local = localToolCatalog();
    process.stdout.write('\nLocal Ollama workspace tools\n');
    for (const row of local.tools) {
      process.stdout.write(`  ${row.name.padEnd(28)} ${row.execute_required?'[--execute]':'[read]'}  ${row.description}\n`);
    }
  }
  if (kind === 'sdk' || kind === 'all') {
    const publicSdk = commandLexicon();
    process.stdout.write('\nPublic SDK callables\n');
    for (const row of publicSdk.commands) {
      process.stdout.write(`  ${row.command.padEnd(34)} ${row.specifier}\n`);
    }
  }
  if (kind === 'primitives') {
    process.stdout.write(JSON.stringify(primitiveCatalog, null, 2) + '\n');
  }
}

function installLocalCli() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const home=os.homedir();
  const binDir=path.join(home,'.local','bin');
  const shareDir=path.join(home,'.local','share','xi-io','cli');
  const stateDir=path.join(process.env.XDG_STATE_HOME || path.join(home,'.local','state'),'xi-io','cli');
  const rootFile=path.join(shareDir,'sdk.path');
  fs.mkdirSync(binDir,{recursive:true});
  fs.mkdirSync(shareDir,{recursive:true});
  fs.mkdirSync(stateDir,{recursive:true});
  fs.writeFileSync(rootFile,root+'\n',{encoding:'utf8',mode:0o600});

  const wrapper=[
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'ROOT_FILE="$HOME/.local/share/xi-io/cli/sdk.path"',
    'wrapper_fail(){ printf \'%s\\n\' \'{"schema":"xiio.cli.wrapper-error/v1","status":"BLOCKED","provider_effect":false,"authority_granted":false}\' >&2; exit 2; }',
    '[[ -r "$ROOT_FILE" ]] || wrapper_fail',
    'ROOT=""',
    'IFS= read -r ROOT < "$ROOT_FILE" || true',
    'ROOT="${ROOT%$\'\\r\'}"',
    '[[ -n "$ROOT" && -r "$ROOT/bin/xi.mjs" ]] || wrapper_fail',
    'NODE="${XIIO_NODE:-$HOME/.nvm/versions/node/v24.11.1/bin/node}"',
    'if [[ ! -x "$NODE" ]]; then NODE="$(command -v node || true)"; fi',
    '[[ -n "$NODE" && -x "$NODE" ]] || wrapper_fail',
    'export XIIO_INVOKED_AS="$(basename "$0")"',
    'exec "$NODE" "$ROOT/bin/xi.mjs" "$@"',
    '',
  ].join('\n');

  const bins=['xi-io','xiio','xi'];
  for(const name of bins){
    const dest=path.join(binDir,name);
    try{ if(fs.existsSync(dest)) fs.unlinkSync(dest); }catch{}
    fs.writeFileSync(dest,wrapper,{encoding:'utf8',mode:0o755});
    fs.chmodSync(dest,0o755);
  }

  const envFile=path.join(shareDir,'env.sh');
  const envScript=[
    '# xi-io CLI PATH',
    'case ":$PATH:" in',
    '  *":$HOME/.local/bin:"*) ;;',
    '  *) export PATH="$HOME/.local/bin:$PATH" ;;',
    'esac',
    '',
  ].join('\n');
  fs.writeFileSync(envFile,envScript,{encoding:'utf8',mode:0o600});

  const shell=path.basename(process.env.SHELL || 'bash');
  const shellRc=shell==='zsh'
    ? path.join(home,'.zshrc')
    : shell==='bash'
      ? path.join(home,'.bashrc')
      : null;
  let shellRcState='UNSUPPORTED_SHELL';
  if(shellRc){
    const marker='# xi-io-cli-managed-path';
    const sourceLine=`[ -r "$HOME/.local/share/xi-io/cli/env.sh" ] && . "$HOME/.local/share/xi-io/cli/env.sh" ${marker}`;
    let current='';
    try{current=fs.readFileSync(shellRc,'utf8');}catch{}
    if(!current.includes(marker)){
      const prefix=current && !current.endsWith('\n')?'\n':'';
      fs.appendFileSync(shellRc,prefix+sourceLine+'\n',{encoding:'utf8'});
      shellRcState='ADDED';
    } else {
      shellRcState='ALREADY_PRESENT';
    }
  }

  const receipt={
    schema:'xiio.cli.install/v1',
    installed:true,
    sdk_root:root,
    root_file:rootFile,
    env_file:envFile,
    shell_rc:shellRc,
    shell_rc_state:shellRcState,
    bins:bins.map((name)=>path.join(binDir,name)),
    default_entry:'xi-io',
    human_aliases:['xiio','xi'],
    workspace_semantics:'CURRENT_DIRECTORY_OR_EXPLICIT_DIRECTORY',
    ollama_semantics:'LOCAL_ONLY_NO_AUTOMATIC_CLOUD_FALLBACK',
    commands:['xi-io','xi-io --execute','xi-io <directory>','xi-io registry','xi-io compass','xi-io doctor'],
    activate_current_shell:'export PATH="$HOME/.local/bin:$PATH"',
    authority_granted:false,
    provider_effect:false,
  };
  fs.writeFileSync(path.join(stateDir,'install.current.json'),JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

function runnerStatus() {
  const services=discoverRunnerServices();
  const listener=discoverRunnerListener();
  const listenerCount=listener?.lines || 0;
  const state=listenerCount>0?'PASS':services.length>0?'PARTIAL':'TRUE_WAIT';
  return {
    schema:'xiio.cli.runner-status/v1',
    state,
    listener_count:listenerCount,
    services:services.map(({scope,unit,state:service_state})=>({scope,unit,state:service_state})),
    first_red:listenerCount>0?null:services.length>0?'RUNNER_SERVICE_PRESENT_LISTENER_ABSENT':'NO_LISTENER_OR_RUNNER_SERVICE_OBSERVED',
    next:listenerCount>0?'OBSERVE_PROVIDER_JOB':'xiio runner discover',
    provider_effect:false,
    authority_granted:false,
  };
}

async function compass({persist=true}={}) {
  const sdkRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const value=await compileLocalCompass({sdkRoot});
  const receipt=persist?writeCompassReceipt(value):null;
  return {
    ...value,
    receipt:receipt?receipt.current:null,
  };
}

function stableStatusProjection(value){
  if(Array.isArray(value)) return value.map(stableStatusProjection);
  if(value && typeof value==='object'){
    const out={};
    for(const [key,val] of Object.entries(value)){
      if(['observed_at','timestamp','generated_at','updated_at','checked_at','started_at','finished_at'].includes(key)) continue;
      out[key]=stableStatusProjection(val);
    }
    return out;
  }
  return value;
}



function lifecycleProjectionPath(){
  return process.env.XIIO_LIFECYCLE_PATH
    || path.join(os.homedir(),'.local','state','xi-io','studio','lifecycle.current.json');
}

function lifecycleProjection(){
  const file=lifecycleProjectionPath();
  if(!fs.existsSync(file)){
    return {
      schema:'xiio.cli.lifecycle/v1',
      state:'TRUE_WAIT',
      projection_path:file,
      lifecycle:null,
      first_red:'LIFECYCLE_PROJECTION_MISSING',
      provider_effect:false,
      authority_granted:false,
      hard:[
        'MISSING_LIFECYCLE_PROJECTION != OWNER_QUESTION',
        'CLI != LIFECYCLE_OWNER',
      ]
    };
  }
  try{
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    if(value?.schema!=='xiio.studio.rotfl-lifecycle/v1'){
      return {
        schema:'xiio.cli.lifecycle/v1',
        state:'FAIL_CURRENT',
        projection_path:file,
        lifecycle:null,
        first_red:'LIFECYCLE_SCHEMA_INVALID',
        observed_schema:value?.schema||null,
        provider_effect:false,
        authority_granted:false,
      };
    }
    return {
      schema:'xiio.cli.lifecycle/v1',
      state:'PASS',
      projection_path:file,
      lifecycle:value,
      first_red:value.first_red||null,
      provider_effect:false,
      authority_granted:false,
      hard:[
        'CLI_PROJECTS_LIFECYCLE_DOES_NOT_RECOMPUTE',
        'COLD_GHOST_NONSELECTABLE',
        'DETONATION_READY != EFFECT_AUTHORITY',
      ]
    };
  }catch(error){
    return {
      schema:'xiio.cli.lifecycle/v1',
      state:'FAIL_CURRENT',
      projection_path:file,
      lifecycle:null,
      first_red:'LIFECYCLE_PROJECTION_INVALID_JSON',
      error:String(error?.message||error),
      provider_effect:false,
      authority_granted:false,
    };
  }
}

function remoteDesktopProjectionPath(){
  return process.env.XIIO_REMOTE_DESKTOP_STATE_PATH
    || path.join(os.homedir(),'.local','state','xi-io','remote-desktop.current.json');
}

function remoteDesktopStatus(){
  const file=remoteDesktopProjectionPath();
  if(!fs.existsSync(file)){
    return {
      schema:'xiio.cli.remote-desktop-status/v1',
      state:'TRUE_WAIT',
      projection_path:file,
      plugin_auth_state:'UNKNOWN',
      device_registration_state:'UNKNOWN',
      live_device_session_state:'UNKNOWN',
      aries_machine_state:'UNKNOWN',
      first_red:'REMOTE_DESKTOP_STATE_PROJECTION_MISSING',
      provider_effect:false,
      authority_granted:false,
      hard:[
        'MISSING_PROJECTION != NOT_AUTHENTICATED',
        'REMOTE_DEVICE_OFFLINE != ARIES_OFFLINE'
      ]
    };
  }
  try{
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    const auth=value?.authentication?.state || 'UNKNOWN';
    const registration=value?.device_registration?.state || 'UNKNOWN';
    const session=value?.live_device_session?.state || 'UNKNOWN';
    const machine=value?.aries_machine_state?.state || 'UNKNOWN';
    const fail=['FAIL','FAIL_CURRENT','BLOCKED','INVALID'].includes(session);
    const wait=['WAIT','TRUE_WAIT','UNKNOWN'].includes(session);
    return {
      schema:'xiio.cli.remote-desktop-status/v1',
      state:fail?'FAIL_CURRENT':wait?'PASS_WITH_WAITS':'PASS',
      projection_path:file,
      provider:value?.provider || 'UNKNOWN',
      plugin_auth_state:auth,
      device_registration_state:registration,
      live_device_session_state:session,
      aries_machine_state:machine,
      device_id:value?.device_registration?.device_id || null,
      device_name:value?.device_registration?.device_name || null,
      transport_broadcast_v1:value?.device_registration?.advertised_capabilities?.transport_broadcast_v1 === true,
      auth_token_state:value?.device_registration?.auth_token_state || null,
      last_seen:value?.live_device_session?.last_seen || null,
      first_red:fail?'REMOTE_LIVE_DEVICE_SESSION_FAIL_CURRENT':wait?'REMOTE_LIVE_DEVICE_SESSION_WAIT':null,
      provider_effect:false,
      authority_granted:false,
      hard:[
        'PLUGIN_AUTH_OK != DEVICE_REGISTERED',
        'DEVICE_REGISTERED != LIVE_DEVICE_SESSION',
        'AUTH_OK + SESSION_MISSING => RESTORE_SESSION',
        'REMOTE_DEVICE_OFFLINE != ARIES_OFFLINE'
      ]
    };
  }catch(error){
    return {
      schema:'xiio.cli.remote-desktop-status/v1',
      state:'FAIL_CURRENT',
      projection_path:file,
      plugin_auth_state:'UNKNOWN',
      device_registration_state:'UNKNOWN',
      live_device_session_state:'UNKNOWN',
      aries_machine_state:'UNKNOWN',
      first_red:'REMOTE_DESKTOP_STATE_PROJECTION_INVALID',
      error:String(error?.message||error),
      provider_effect:false,
      authority_granted:false
    };
  }
}

async function statusSnapshot() {
  const sdkRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const [rawMap,rawHex,rawStudio,rawInbox]=await Promise.all([
    compileLocalCompass({sdkRoot}),
    productRuntime('hex','status'),
    productRuntime('studio','status'),
    productRuntime('inbox','status'),
  ]);
  const remoteDesktop=remoteDesktopStatus();
  const map=stableStatusProjection(rawMap);
  const hex=stableStatusProjection(rawHex);
  const studio=stableStatusProjection(rawStudio);
  const inbox=stableStatusProjection(rawInbox);
  const runner=runnerStatus();
  const topology=inspectMachineTopology({workspace:process.cwd()});
  const invokedAs=String(process.env.XIIO_INVOKED_AS || 'direct-bin');
  const productStates={hex:hex.state,studio:studio.state,inbox:inbox.state};
  const hardFail=Object.values(productStates).some((v)=>v==='FAIL'||v==='BLOCKED')
    || topology.state==='FAIL_CURRENT';
  const waits=Object.values(productStates).filter((v)=>v==='TRUE_WAIT'||v==='FAIL_CURRENT').length
    + (runner.state==='TRUE_WAIT'||runner.state==='PARTIAL'?1:0)
    + (topology.state==='PASS_WITH_WAITS'?1:0);
  return {
    schema:'xiio.cli.status/v1',
    state:hardFail?'FAIL_CURRENT':waits?'PASS_WITH_WAITS':'PASS',
    invoked_as:invokedAs,
    sdk_version:SDK_VERSION,
    sdk_root:sdkRoot,
    xi:{
      source_generation:map?.roots?.sdk?.selected?.generation || map?.roots?.sdk?.selected?.sha || null,
      framework_generation:map?.roots?.framework?.selected?.generation || map?.roots?.framework?.selected?.sha || null,
      source_currentness:map?.roots?.sdk?.selected?.state || map?.roots?.sdk?.state || 'UNKNOWN',
      evidence_ref:map?.receipt || null
    },
    io:{
      runner_state:runner.state,
      machine_topology_state:topology.state,
      products:{hex:hex.state,studio:studio.state,inbox:inbox.state},
      provider_ingress_state:'OBSERVED_LOCAL_ONLY',
      provider_egress_state:'NOT_EVALUATED',
      remote_desktop:{
        plugin_auth_state:remoteDesktop.plugin_auth_state,
        device_registration_state:remoteDesktop.device_registration_state,
        live_device_session_state:remoteDesktop.live_device_session_state,
        aries_machine_state:remoteDesktop.aries_machine_state
      },
      readback_ref:null
    },
    compass:map,
    machine_topology:topology,
    runner,
    remote_desktop:remoteDesktop,
    products:{hex,studio,inbox},
    local_effect:true,
    provider_effect:false,
    authority_granted:false,
    hard:[
      'XI_IO_ALIAS_PARITY_REQUIRED',
      'XI_SOURCE_STATUS != IO_PROVIDER_STATUS',
      'STATUS != EFFECT_AUTHORITY',
      'SOURCE != RUNNING != LIVE != USABLE',
      'PORT_BOUND != QUALIFIED_RUNTIME',
      'SOURCE_MOUNT_NOEXEC != TARGET_CACHE_NOEXEC',
      'NATIVE_DEP_SOURCE_DECLARED != HOST_METADATA_AVAILABLE',
      'REMOTE_DESKTOP_AUTH_OK != LIVE_DEVICE_SESSION',
      'REMOTE_DEVICE_OFFLINE != ARIES_OFFLINE',
    ],
  };
}

async function gatesCheck(){
  const status=await statusSnapshot();
  const cells=[
    {id:'CLI_STATUS',state:status.state,evidence_ref:'status'},
    {id:'XI_SOURCE_BOUND',state:status.xi?.source_currentness==='CURRENT'?'PASS':'WAIT',evidence_ref:status.xi?.evidence_ref||null},
    {id:'IO_MACHINE_TOPOLOGY',state:status.machine_topology?.state||'UNKNOWN',evidence_ref:'machine_topology'},
    {id:'HEX_RUNTIME',state:status.products?.hex?.state||'UNKNOWN',evidence_ref:'product:hex'},
    {id:'STUDIO_RUNTIME',state:status.products?.studio?.state||'UNKNOWN',evidence_ref:'product:studio'},
    {id:'INBOX_RUNTIME',state:status.products?.inbox?.state||'UNKNOWN',evidence_ref:'product:inbox'},
    {id:'PROVIDER_INGRESS',state:status.io?.provider_ingress_state||'UNKNOWN',evidence_ref:'io:ingress'},
    {id:'PROVIDER_EGRESS',state:status.io?.provider_egress_state||'UNKNOWN',evidence_ref:'io:egress'},
    {id:'REMOTE_PLUGIN_AUTH',state:status.remote_desktop?.plugin_auth_state||'UNKNOWN',evidence_ref:'remote_desktop:auth'},
    {id:'REMOTE_DEVICE_REGISTRATION',state:status.remote_desktop?.device_registration_state||'UNKNOWN',evidence_ref:'remote_desktop:device'},
    {id:'REMOTE_LIVE_SESSION',state:status.remote_desktop?.live_device_session_state||'UNKNOWN',evidence_ref:'remote_desktop:session'},
  ];
  const hardFail=cells.some(c=>['FAIL','FAIL_CURRENT','BLOCKED','REJECTED','INVALID'].includes(c.state));
  const waits=cells.filter(c=>['WAIT','TRUE_WAIT','PARTIAL','PASS_WITH_WAITS','UNKNOWN','NOT_EVALUATED','OBSERVED_LOCAL_ONLY'].includes(c.state));
  return {schema:'xiio.cli.gates-check/v1',state:hardFail?'FAIL_CURRENT':waits.length?'PASS_WITH_WAITS':'PASS',cells,first_red:cells.find(c=>['FAIL','FAIL_CURRENT','BLOCKED','REJECTED','INVALID','WAIT','TRUE_WAIT','PARTIAL','PASS_WITH_WAITS','UNKNOWN','NOT_EVALUATED'].includes(c.state))?.id||null,silent_remainder:0,hard:['XI_SOURCE_STATUS != IO_PROVIDER_STATUS','PORT_BOUND != QUALIFIED_RUNTIME','UNKNOWN != PASS','PROVIDER_INGRESS != PROVIDER_EGRESS','STATUS != EFFECT_AUTHORITY']};
}

function verifyArtifact(value,{source_ref='stdin'}={}){
  if(value===null || typeof value!=='object' || Array.isArray(value)) return {schema:'xiio.cli.verify/v1',state:'INVALID',source_ref,first_red:'TOP_LEVEL_OBJECT_REQUIRED',checks:[]};
  const checks=[{id:'JSON_OBJECT',state:'PASS'},{id:'SCHEMA_DECLARED',state:typeof value.schema==='string'&&value.schema.trim()?'PASS':'WAIT'}];
  if('silent_remainder' in value) checks.push({id:'SILENT_REMAINDER',state:Number(value.silent_remainder)===0?'PASS':'FAIL'});
  if('false_green' in value) checks.push({id:'FALSE_GREEN',state:Number(value.false_green)===0?'PASS':'FAIL'});
  if('denominator' in value) checks.push({id:'DENOMINATOR_POSITIVE',state:Number(value.denominator)>0?'PASS':'FAIL'});
  const fail=checks.find(c=>c.state==='FAIL');
  const wait=checks.find(c=>c.state==='WAIT');
  return {schema:'xiio.cli.verify/v1',state:fail?'FAIL':wait?'PASS_WITH_WAITS':'PASS',source_ref,checks,first_red:fail?.id||wait?.id||null,silent_remainder:0,provider_effect:false,authority_granted:false};
}

async function doctor() {
  const { localRuntimeStatus, localToolCatalog } = await import('./xi-local-agent.mjs');
  const runtime = await localRuntimeStatus();
  const local = localToolCatalog();
  const runner = runnerStatus();
  const compassState = await compass({persist:true});
  const topology = inspectMachineTopology({workspace:process.cwd()});
  process.stdout.write(JSON.stringify({
    schema:'xiio.cli.human-doctor/v2',
    status:runtime.ollama_state.startsWith('READY_') ? 'PARTIAL_LOCAL_DEPENDENCY_RUNNING' : 'WAIT_LOCAL_DEPENDENCY',
    state_ladder:{
      installed:{
        state:'PASS',
        proof:'xi-io CLI process is executing from installed SDK root'
      },
      dependency_running:{
        state:runtime.ollama_state.startsWith('READY_')?'PASS':'WAIT',
        proof:runtime.ollama_state,
        scope:'OLLAMA_ONLY'
      },
      operator_running:{
        state:'PASS',
        proof:'xi-io doctor process is running locally',
        scope:'CURRENT_CLI_PROCESS_ONLY'
      },
      runtime_executed:{
        state:runtime.execution==='BOUNDED'?'PARTIAL':'NOT_PROVEN',
        proof:runtime.execution,
        note:'Execution mode availability is not proof that a target workflow/runtime path executed.'
      },
      deployed:{state:'NOT_OBSERVED',proof:null},
      live:{state:'NOT_OBSERVED',proof:null},
      usable:{state:'NOT_PROVEN',proof:null}
    },
    hard_state_separation:[
      'INSTALLED != RUNNING',
      'DEPENDENCY_RUNNING != OPERATOR_RUNNING',
      'OPERATOR_RUNNING != RUNTIME_EXECUTED',
      'RUNTIME_EXECUTED != DEPLOYED',
      'DEPLOYED != LIVE',
      'LIVE != USABLE',
      'OLLAMA_READY != XIIO_RUNTIME_READY',
      'PREVIEW != EXECUTION',
      'LOCAL_RUNNING != OUTSIDE_ORIGIN_LIVE',
      'DECLARED_PATH != PHYSICAL_PATH',
      'PHYSICAL_PATH != CURRENT_GENERATION',
      'SOURCE_MOUNT_NOEXEC != CARGO_TARGET_NOEXEC',
      'CHMOD != EXEC_PERMISSION',
      'NATIVE_DEP_SOURCE_DECLARED != HOST_METADATA_AVAILABLE',
      'SOURCE_BUILD_PASS != PACKAGED_RUNTIME_PASS'
    ],
    workspace:runtime.cwd,
    machine_topology:topology,
    cargo_target_dir:topology.cargo_target?.path||null,
    cargo_target_strategy:topology.cargo_target?.strategy||null,
    model:runtime.model,
    ollama_endpoint:runtime.ollama_endpoint,
    ollama_state:runtime.ollama_state,
    execution:runtime.execution,
    runner,
    compass:compassState,
    local_tools:local.tools,
    ack_commands:commandCatalog().commands
      .filter((row)=>row.id.startsWith('ack.'))
      .map((row)=>humanCli(row.cli)),
    command_registry_count:commandCatalog().commands.length,
    public_sdk_callable_count:commandLexicon().commands.length,
    primitive_catalog_count:Array.isArray(primitiveCatalog.primitives)?primitiveCatalog.primitives.length:0,
    provider_effect:false,
    automatic_cloud_fallback:false,
    installed_bins:[
      path.join(os.homedir(),'.local','bin','xi-io'),
      path.join(os.homedir(),'.local','bin','xiio'),
      path.join(os.homedir(),'.local','bin','xi'),
    ].map((bin)=>({bin,exists:fs.existsSync(bin)})),
    sdk_root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),
  }, null, 2) + '\n');
}


async function searchRuntime(argv=[]){
  const { flags }=args(argv);
  const action=argv[0]&&!argv[0].startsWith('--')?argv[0]:'query';
  const origin=String(process.env.XIIO_INBOX_ORIGIN||'http://127.0.0.1:8791').replace(/\/$/,'');
  if(action==='status'){
    return {schema:'xiio.cli.search/v1',...(await simpleProbe(origin+'/api/search/status',3000)),effect_authority:0};
  }
  const target=String(flags.target||'repos');
  const query=String(flags.query||'').trim();
  const limit=String(flags.limit||'25');
  if(!query) return {schema:'xiio.cli.search/v1',state:'BLOCKED',first_red:'SEARCH_QUERY_REQUIRED',effect_authority:0};
  let fractalVector=null;
  if(flags.vector){
    fractalVector=readJson(flags.vector,'--vector');
    const required=['packet_id','generation','semantic_digest','blast_radius_digest','affected_refs','return_targets','first_red'];
    if(!fractalVector||typeof fractalVector!=='object'||Array.isArray(fractalVector)){
      return {schema:'xiio.cli.search/v1',state:'BLOCKED',first_red:'FRACTAL_VECTOR_OBJECT_REQUIRED',effect_authority:0};
    }
    for(const key of required){
      if(!(key in fractalVector)){
        return {schema:'xiio.cli.search/v1',state:'BLOCKED',first_red:'FRACTAL_VECTOR_FIELD_REQUIRED:'+key,effect_authority:0};
      }
    }
  }
  const url=new URL(origin+'/api/search/query');
  url.searchParams.set('target',target);
  url.searchParams.set('q',query);
  url.searchParams.set('limit',limit);
  const custodyRequested=flags.custody===true || String(flags.custody||'').toLowerCase()==='true' || String(flags.custody||'')==='1';
  if(fractalVector){
    const encoded=JSON.stringify(fractalVector);
    if(Buffer.byteLength(encoded,'utf8')>8192){
      return {schema:'xiio.cli.search/v1',state:'BLOCKED',first_red:'FRACTAL_VECTOR_TOO_LARGE',effect_authority:0};
    }
    url.searchParams.set('fractal_vector',encoded);
  }
  if(custodyRequested) url.searchParams.set('custody','1');
  const token=String(process.env.XIIO_SEARCH_API_TOKEN||'');
  try{
    const response=await fetch(url,{
      headers:{
        accept:'application/json',
        ...(token?{authorization:'Bearer '+token}:{})
      },
      signal:AbortSignal.timeout(15000)
    });
    const body=await response.json().catch(()=>null);
    if(response.status===401){
      return {
        schema:'xiio.cli.search/v1',
        state:'TRUE_WAIT',
        first_red:'SEARCH_SESSION_OR_TOKEN_REQUIRED',
        target,
        query,
        status:response.status,
        provider_effect:false,
        effect_authority:0,
        next:'Bind an existing local Search session or XIIO_SEARCH_API_TOKEN; do not invent credentials.'
      };
    }
    if(!response.ok){
      return {schema:'xiio.cli.search/v1',state:'FAIL_CURRENT',first_red:body?.code||'SEARCH_API_FAILED',target,query,status:response.status,body,effect_authority:0};
    }
    return {
      ...body,
      schema:body?.schema||'xiio.cli.search/v1',
      transport:'CLI_TO_INBOX_SEARCH_API',
      target_id:body?.target_id||target,
      requested_fractal_vector:fractalVector,
      local_effect_requested:custodyRequested,
      local_effect:body?.local_effect_performed===true,
      provider_effect:false,
      effect_authority:0
    };
  }catch(error){
    return {schema:'xiio.cli.search/v1',state:'TRUE_WAIT',first_red:'INBOX_SEARCH_API_UNREACHABLE',target,query,error:String(error?.message||error),effect_authority:0};
  }
}

async function simpleProbe(url,timeout=2500){
  try{
    const response=await fetch(url,{headers:{accept:'application/json,text/plain,*/*'},signal:AbortSignal.timeout(timeout)});
    const text=await response.text();
    let json=null; try{json=JSON.parse(text);}catch{}
    return {state:response.ok?'PASS':'FAIL',status:response.status,url,json,body_preview:text.slice(0,500)};
  }catch(error){
    return {state:'TRUE_WAIT',status:null,url,reason:'UNREACHABLE',error:String(error?.message||error)};
  }
}
function installedHexBin(name){
  return path.join(os.homedir(),'.local','share','xi-io','hex-rc','current','bin',name);
}
function runDetached(command,args=[]){
  const result=spawnSync('bash',['-lc','nohup "$1" >/tmp/xiio-launch.log 2>&1 &', 'xiio-launch', command],{encoding:'utf8'});
  return {state:result.status===0?'PASS':'FAIL',status:result.status,stderr:String(result.stderr||'').trim()};
}
function openUrl(url){
  const opener=process.platform==='linux'?'xdg-open':process.platform==='darwin'?'open':null;
  if(!opener)return {state:'TRUE_WAIT',reason:'NO_SUPPORTED_URL_OPENER',url};
  const result=spawnSync(opener,[url],{encoding:'utf8',timeout:5000});
  return {state:result.status===0?'PASS':'FAIL',status:result.status,url,stderr:String(result.stderr||'').trim()};
}
async function frameworkRootFromCompass(){
  const sdkRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const map=await compileLocalCompass({sdkRoot});
  return {map,root:map?.roots?.framework?.selected?.path||null};
}
function processCount(pattern){
  const r=spawnSync('pgrep',['-fc',pattern],{encoding:'utf8'});
  const n=Number(String(r.stdout||'0').trim()||0);
  return Number.isFinite(n)?n:0;
}
function ndjsonLineCount(file){
  try{
    const raw=fs.readFileSync(file,'utf8');
    if(!raw.trim()) return 0;
    return raw.split(/\r?\n/).filter(Boolean).length;
  }catch{return 0;}
}
function readJsonMaybe(file){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
}
async function zedIbalRuntime(action='status'){
  const home=os.homedir();
  const ledger=path.join(home,'.local','state','xi-io','ibal-acp-001a','events','operations.ndjson');
  const baseline={
    zed_process_count:processCount('zed-editor|/zed([[:space:]]|$)|zed\\.app/bin/zed'),
    acp_agent_count:processCount('acp-agent/agent\\.mjs'),
    event_count:ndjsonLineCount(ledger),
  };
  const {map,root}=await frameworkRootFromCompass();
  if(!root) return {
    schema:'xiio.cli.zed-ibal/v1',state:'TRUE_WAIT',first_red:'FRAMEWORK_ROOT_UNRESOLVED',
    baseline,compass:map,provider_effect:false,authority_granted:false,
  };
  const configurePath=path.join(root,'tools','hex-operator','rc','bin','zed-ibal-configure.mjs');
  const recoverPath=path.join(root,'scripts','punchcard-plan-bridge-zed-ibal-controls.mjs');
  if(!fs.existsSync(configurePath)||!fs.existsSync(recoverPath)) return {
    schema:'xiio.cli.zed-ibal/v1',state:'BLOCKED',first_red:'ZED_IBAL_FRAMEWORK_PRIMITIVE_MISSING',
    root,baseline,provider_effect:false,authority_granted:false,
  };
  const mod=await import(pathToFileURL(configurePath).href+`?xiio=${Date.now()}`);
  let source=mod.zedIbalStatus();
  let configure=null;
  const sourceReady=()=>Boolean(
    source?.zed?.agent_servers_ok && source?.acp?.wrapper_ok && source?.acp?.agent_ok
    && source?.acp?.node_ok && source?.ollama?.ok
  );
  if(action==='recover' && !sourceReady()){
    configure=mod.configureZedIbal();
    source=mod.zedIbalStatus();
  }
  const bindingApplied=sourceReady();
  const matrix=compileTransitionProofMatrix({
    transitions:['T1_LOAD','T2_SPAWN','T3_SESSION'],
    proof_planes:['SOURCE','PROCESS','READBACK'],
    proven_cell_ids:bindingApplied
      ? ['T1_LOAD::SOURCE','T2_SPAWN::SOURCE','T3_SESSION::SOURCE']
      : [],
    cells:[
      {id:'T1_LOAD::PROCESS',state:baseline.zed_process_count>0?'PASS':'WAIT',evidence_ref:'pgrep:zed'},
      {id:'T1_LOAD::READBACK',state:'WAIT'},
      {id:'T2_SPAWN::PROCESS',state:baseline.acp_agent_count>0?'PASS':'WAIT',evidence_ref:'pgrep:acp-agent'},
      {id:'T2_SPAWN::READBACK',state:'WAIT'},
      {id:'T3_SESSION::PROCESS',state:'WAIT'},
      {id:'T3_SESSION::READBACK',state:'WAIT'},
    ],
  });
  if(action!=='recover') return {
    schema:'xiio.cli.zed-ibal/v1',
    state:bindingApplied?'PASS_WITH_WAITS':'FAIL_CURRENT',
    first_red:bindingApplied?(baseline.zed_process_count>0?'ACP_SPAWNED':'ZED_RUNNING'):'BINDING_APPLIED',
    root,source,binding_applied:bindingApplied,baseline,matrix,
    active_factors:['ZED_RUNNING','ACP_SPAWNED','ACP_SESSION_DELTA'],
    provider_effect:false,authority_granted:false,
  };
  if(!bindingApplied) return {
    schema:'xiio.cli.zed-ibal/v1',state:'BLOCKED',first_red:'BINDING_APPLY_FAILED',
    root,source,configure,baseline,matrix,provider_effect:false,authority_granted:false,
  };

  if(baseline.zed_process_count===0 && source?.zed?.binary){
    try{
      const child=spawn(source.zed.binary,[root],{
        detached:true,stdio:'ignore',env:{...process.env,HOME:home}
      });
      child.unref();
    }catch{}
  }

  const run=spawnSync(process.execPath,[recoverPath,'--recover'],{
    cwd:root,
    encoding:'utf8',
    timeout:360000,
    maxBuffer:8*1024*1024,
    env:{
      ...process.env,
      HOME:home,
      IBAL_ACP_NODE:source?.acp?.node || process.execPath,
      PATH:`${path.dirname(source?.acp?.node||process.execPath)}:/usr/bin:/bin:${process.env.PATH||''}`,
    },
  });
  const receiptPath=path.join(root,'engines','punchcard-plan-bridge','out','zed-ibal-controls-receipt.preview.json');
  const recoverReceipt=readJsonMaybe(receiptPath);
  const after={
    zed_process_count:processCount('zed-editor|/zed([[:space:]]|$)|zed\\.app/bin/zed'),
    acp_agent_count:processCount('acp-agent/agent\\.mjs'),
    event_count:ndjsonLineCount(ledger),
  };
  const sessionId=recoverReceipt?.result?.sessionId || null;
  const spawned=Boolean(Number(recoverReceipt?.result?.pid)>0 || after.acp_agent_count>baseline.acp_agent_count);
  const sessionDelta=Boolean(sessionId && after.event_count>baseline.event_count);
  const reduced=reduceMultiplicativeFactors([
    {id:'ZED_RUNNING',value:after.zed_process_count>0,evidence_ref:'pgrep:zed'},
    {id:'ACP_SPAWNED',value:spawned,evidence_ref:recoverReceipt?'zed-ibal-controls-receipt':null},
    {id:'ACP_SESSION_DELTA',value:sessionDelta,evidence_ref:sessionId?`session:${sessionId}`:null},
  ]);
  return {
    schema:'xiio.cli.zed-ibal/v1',
    state:reduced.state==='PASS'?'PASS':'FAIL_CURRENT',
    first_red:reduced.first_zero,
    root,source,configure,baseline,after,
    binding_applied:true,
    original_matrix:{original_denominator:9,proven_source_cells:3,active_denominator:6},
    active_factors:['ZED_RUNNING','ACP_SPAWNED','ACP_SESSION_DELTA'],
    reduced,
    recover:{
      exit_code:run.status,
      signal:run.signal,
      stdout_tail:String(run.stdout||'').split(/\r?\n/).slice(-40),
      stderr_tail:String(run.stderr||'').split(/\r?\n/).slice(-40),
      receipt_path:receiptPath,
      session_id:sessionId,
    },
    event_delta:after.event_count-baseline.event_count,
    provider_effect:false,
    authority_granted:false,
  };
}

async function productRuntime(family,action){
  if(family==='hex'){
    if(action==='status'||!action) return {schema:'xiio.cli.hex/v1',...(await simpleProbe('http://127.0.0.1:8798/health')),effect_authority:0};
    if(action==='start'){
      const script=installedHexBin('ibal-control-start.sh');
      if(!fs.existsSync(script)) return {schema:'xiio.cli.hex/v1',state:'TRUE_WAIT',first_red:'HEX_RC_NOT_INSTALLED',next:'xi-io hex install',effect_authority:0};
      const run=runDetached(script);
      const health=await new Promise(async resolve=>{for(let i=0;i<30;i+=1){const p=await simpleProbe('http://127.0.0.1:8798/health',1000);if(p.state==='PASS')return resolve(p);await new Promise(r=>setTimeout(r,200));}resolve(await simpleProbe('http://127.0.0.1:8798/health',1000));});
      return {schema:'xiio.cli.hex/v1',state:health.state==='PASS'?'PASS':'FAIL_CURRENT',launch:run,health,effect_authority:0};
    }
    if(action==='install'){
      const {map,root}=await frameworkRootFromCompass();
      if(!root) return {schema:'xiio.cli.hex/v1',state:'TRUE_WAIT',first_red:'FRAMEWORK_ROOT_UNRESOLVED',compass:map,next:'xi-io compass',effect_authority:0};
      const script=path.join(root,'scripts','install-hex-rc.mjs');
      if(!fs.existsSync(script)) return {schema:'xiio.cli.hex/v1',state:'BLOCKED',first_red:'HEX_INSTALLER_MISSING',framework_root:root,effect_authority:0};
      const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
      const health=await simpleProbe('http://127.0.0.1:8798/health',2000);
      return {schema:'xiio.cli.hex/v1',state:run.status===0&&health.state==='PASS'?'PASS':'FAIL_CURRENT',framework_root:root,installer_status:run.status,stdout:String(run.stdout||'').slice(-4000),stderr:String(run.stderr||'').slice(-4000),health,effect_authority:0};
    }
    if(action==='open'){
      const suite=installedHexBin('hex-suite-open.sh');
      if(fs.existsSync(suite)) return {schema:'xiio.cli.hex/v1',...runDetached(suite),target:'STUDIO_HEX_WRAPPER',effect_authority:0};
      return {schema:'xiio.cli.hex/v1',...openUrl('http://127.0.0.1:8798/'),target:'HEX_LOOPBACK',effect_authority:0};
    }
  }
  if(family==='inbox'){
    if(action==='status'||!action) return {schema:'xiio.cli.inbox/v1',...(await simpleProbe('http://127.0.0.1:8791/api/health')),effect_authority:0};
    if(action==='recover'){
      const result=recoverInboxRuntime({execute:true});
      return {schema:'xiio.cli.inbox/v1',...result};
    }
    if(action==='open'){
      let health=await simpleProbe('http://127.0.0.1:8791/api/health');
      let recovery=null;
      if(health.state!=='PASS'){recovery=recoverInboxRuntime({execute:true});health=await simpleProbe('http://127.0.0.1:8791/api/health',3000);}
      const target='http://127.0.0.1:3099/child-wrapper.html?product=inbox';
      const opened=openUrl(target);
      return {schema:'xiio.cli.inbox/v1',state:health.state==='PASS'&&opened.state==='PASS'?'PASS':'FAIL_CURRENT',health,recovery,studio_wrapper:opened,effect_authority:0};
    }
  }
  if(family==='studio'){
    if(action==='status'||!action) return {schema:'xiio.cli.studio/v1',...(await simpleProbe('http://127.0.0.1:3099/')),effect_authority:0};
    if(action==='start'){
      const script=installedHexBin('studio-start.sh');
      if(!fs.existsSync(script)) return {schema:'xiio.cli.studio/v1',state:'TRUE_WAIT',first_red:'STUDIO_START_PRIMITIVE_NOT_INSTALLED',next:'xi-io hex install',effect_authority:0};
      const run=spawnSync('bash',[script],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:{...process.env,HOME:os.homedir()}});
      const health=await simpleProbe('http://127.0.0.1:3099/',2000);
      const pass=run.status===0 && health.state==='PASS';
      return {
        schema:'xiio.cli.studio/v1',
        state:pass?'PASS':'FAIL_CURRENT',
        first_red:pass?null:(run.status!==0?'STUDIO_START_SCRIPT_FAILED':'STUDIO_3099_READBACK_FAILED'),
        start:{status:run.status,stdout:String(run.stdout||'').slice(-4000),stderr:String(run.stderr||'').slice(-4000),script},
        health,
        effect_authority:0,
        hard:['START_SCRIPT_EXIT_0 != STUDIO_READBACK','OPEN != START','LOCAL_3099_PASS != PUBLIC_LIVE'],
      };
    }
    if(action==='open') return {schema:'xiio.cli.studio/v1',...openUrl('http://127.0.0.1:3099/'),effect_authority:0};
    if(action==='inbox') return productRuntime('inbox','open');
  }
  return {schema:'xiio.cli.product-runtime/v1',state:'FAIL',first_red:'UNKNOWN_PRODUCT_RUNTIME_COMMAND',family,action,effect_authority:0};
}

function parseCargoTopArgs(argv){
  let workspace=process.cwd();
  let execute=false;
  const cargoArgs=[];
  for(let i=0;i<argv.length;i+=1){
    const token=argv[i];
    if(token==='--execute'){
      execute=true;
      continue;
    }
    if(token==='--workspace'){
      const next=argv[i+1];
      if(!next) throw new Error('--workspace requires a directory');
      workspace=next;
      i+=1;
      continue;
    }
    if(token==='--'){
      cargoArgs.push(...argv.slice(i+1));
      break;
    }
    cargoArgs.push(token);
  }
  if(cargoArgs.length===0) throw new Error('cargo arguments required; example: xi-io cargo -- build --release');
  return {workspace,cargoArgs,execute};
}

function withinRoot(root,target){
  const rel=path.relative(root,target);
  return rel==='' || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel));
}

function runCargoThroughTopology(argv=[]){
  const {workspace,cargoArgs,execute}=parseCargoTopArgs(argv);
  if(!isDirectory(workspace)) throw new Error('cargo workspace directory not found');
  const selectedRoot=fs.realpathSync(process.cwd());
  const root=fs.realpathSync(path.resolve(workspace));
  if(!withinRoot(selectedRoot,root)){
    const blocked={schema:'xiio.cli.cargo/v2',state:'BLOCKED',first_red:'WORKSPACE_OUTSIDE_SELECTED_ROOT',selected_workspace:selectedRoot,workspace:root,local_effect:false,provider_effect:false,authority_granted:false};
    process.stdout.write(JSON.stringify(blocked,null,2)+'\n');
    process.exitCode=13;
    return blocked;
  }
  if(!execute){
    const blocked={schema:'xiio.cli.cargo/v2',state:'BLOCKED',first_red:'EXECUTION_NOT_ADMITTED',selected_workspace:selectedRoot,workspace:root,cargo_args:cargoArgs,local_effect:false,provider_effect:false,authority_granted:false};
    process.stdout.write(JSON.stringify(blocked,null,2)+'\n');
    process.exitCode=13;
    return blocked;
  }
  const prep=prepareCargoExecution({workspace:root,create:true});
  if(prep.state!=='PASS'){
    process.stdout.write(JSON.stringify(prep,null,2)+'\n');
    process.exitCode=13;
    return prep;
  }
  const which=spawnSync('bash',['-lc','command -v cargo'],{encoding:'utf8'});
  const cargo=String(which.stdout||'').trim();
  if(which.status!==0 || !cargo){
    const blocked={schema:'xiio.cli.cargo/v1',state:'BLOCKED',first_red:'CARGO_MISSING',workspace:root,topology:prep.topology,provider_effect:false,authority_granted:false};
    process.stdout.write(JSON.stringify(blocked,null,2)+'\n');
    process.exitCode=13;
    return blocked;
  }
  const startedAt=new Date().toISOString();
  const run=spawnSync(cargo,cargoArgs,{
    cwd:root,
    env:{...process.env,...prep.env},
    stdio:'inherit',
  });
  const receipt={
    schema:'xiio.cli.cargo/v2',
    state:run.status===0?'PASS':'FAIL_CURRENT',
    first_red:run.status===0?null:'CARGO_COMMAND_FAILED',
    workspace:root,
    cargo,
    cargo_args:cargoArgs,
    cargo_target_dir:prep.cargo_target_dir,
    tmpdir:prep.tmpdir,
    started_at:startedAt,
    finished_at:new Date().toISOString(),
    exit_code:Number.isInteger(run.status)?run.status:null,
    signal:run.signal||null,
    provider_effect:false,
    authority_granted:false,
    hard:[
      'DOCTOR_STATUS_READ_ONLY',
      'CARGO_REQUIRES_EXPLICIT_EXECUTE',
      'CARGO_WORKSPACE_MUST_BE_WITHIN_SELECTED_ROOT',
      'CARGO_EXECUTION_OWNS_CACHE_MATERIALIZATION',
      'SOURCE_MOUNT_NOEXEC != TARGET_CACHE_NOEXEC',
      'NATIVE_DEP_PREFLIGHT_REQUIRED',
      'BUILD_PASS != PACKAGED_RUNTIME_PASS'
    ]
  };
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=run.status===0?0:(Number.isInteger(run.status)?run.status:13);
  return receipt;
}

async function selfTest() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const rows=[];
  const add=(id,state,evidence=null,firstRed=null)=>rows.push({id,state,evidence,first_red:firstRed});
  const required=[
    ['package.json','PACKAGE_JSON'],
    ['bin/xi.mjs','CLI_ENTRY'],
    ['bin/xi-local-agent.mjs','LOCAL_AGENT'],
    ['src/catalog/primitives.json','PRIMITIVE_CATALOG'],
  ];
  for(const [rel,id] of required){
    add(id,fs.existsSync(path.join(root,rel))?'PASS':'FAIL',rel,fs.existsSync(path.join(root,rel))?null:'MISSING_FILE');
  }
  const nodeMajor=Number(String(process.versions.node||'0').split('.')[0]);
  add('NODE_RUNTIME',Number.isInteger(nodeMajor)&&nodeMajor>=22?'PASS':'FAIL',process.versions.node,nodeMajor>=22?null:'NODE_22_PLUS_REQUIRED');

  const runtime=await (await import('./xi-local-agent.mjs')).localRuntimeStatus();
  add('OLLAMA_LOCAL',runtime.ollama_state.startsWith('READY_')?'PASS':'WAIT',runtime.ollama_state,runtime.ollama_state.startsWith('READY_')?null:'OLLAMA_NOT_READY');

  const catalog=commandCatalog();
  add('COMMAND_REGISTRY',Array.isArray(catalog.commands)&&catalog.commands.length>0?'PASS':'FAIL',String(catalog.commands?.length||0),catalog.commands?.length?null:'COMMAND_REGISTRY_EMPTY');
  add('PRIMITIVE_REGISTRY',Array.isArray(primitiveCatalog.primitives)&&primitiveCatalog.primitives.length>0?'PASS':'FAIL',String(primitiveCatalog.primitives?.length||0),primitiveCatalog.primitives?.length?null:'PRIMITIVE_REGISTRY_EMPTY');

  const guard=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'chat','--once','--input','../xiio-self-test-escape'],{
    cwd:process.cwd(),
    encoding:'utf8',
    timeout:10_000,
    maxBuffer:1_048_576,
    env:{...process.env,XIIO_OLLAMA_MODEL:'xiio-self-test-do-not-call'},
  });
  let guardBody=null;
  try{guardBody=JSON.parse(guard.stdout||'{}');}catch{}
  const guardPass=guard.status!==0
    && guardBody?.schema==='xiio.cli.local-one-shot/v1'
    && guardBody?.status==='BLOCKED'
    && guardBody?.first_red==='PATH_DENIED'
    && guardBody?.provider_effect===false;
  add('WORKSPACE_ESCAPE_GUARD',guardPass?'PASS':'FAIL',guardPass?'PATH_DENIED':'UNEXPECTED',guardPass?null:'PATH_GUARD_NOT_PROVEN');

  const home=os.homedir();
  const binPath=path.join(home,'.local','bin','xi-io');
  const rootFile=path.join(home,'.local','share','xi-io','cli','sdk.path');
  const installed=fs.existsSync(binPath)&&fs.existsSync(rootFile);
  if(installed){
    let pointer='';
    try{pointer=fs.readFileSync(rootFile,'utf8').trim();}catch{}
    add('INSTALL_POINTER',pointer===root?'PASS':'FAIL',pointer===root?'CURRENT_ROOT':'DIFFERENT_ROOT',pointer===root?null:'INSTALL_POINTER_DRIFT');
    const wrapper=spawnSync(binPath,['registry','ack'],{
      cwd:os.tmpdir(),
      encoding:'utf8',
      timeout:10_000,
      env:{...process.env,HOME:home},
    });
    add('INSTALLED_WRAPPER',wrapper.status===0&&/ACK command registry/.test(wrapper.stdout)?'PASS':'FAIL',String(wrapper.status),wrapper.status===0?null:'WRAPPER_EXEC_FAILED');
  } else {
    add('INSTALL_POINTER','WAIT','NOT_INSTALLED','RUN_XI_IO_INSTALL');
    add('INSTALLED_WRAPPER','WAIT','NOT_INSTALLED','RUN_XI_IO_INSTALL');
  }

  const fail=rows.filter(x=>x.state==='FAIL');
  const wait=rows.filter(x=>x.state==='WAIT');
  const receipt={
    schema:'xiio.cli.self-test/v1',
    state:fail.length?'FAIL':wait.length?'PASS_WITH_WAITS':'PASS',
    pass:rows.filter(x=>x.state==='PASS').length,
    wait:wait.length,
    fail:fail.length,
    rows,
    workspace:process.cwd(),
    sdk_root:root,
    model:runtime.model,
    provider_effect:false,
    authority_granted:false,
    automatic_cloud_fallback:false,
    next:fail[0]?.first_red||wait[0]?.first_red||'READY',
  };
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=fail.length?2:0;
}


if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) usage(0);
if (process.argv.length === 3 && process.argv[2] === '--version') { process.stdout.write(SDK_VERSION+'\n'); process.exit(0); }

const top = process.argv[2] || null;
const topArgs = process.argv.slice(2);

if (
  top === null
  || top === 'chat'
  || top === 'shell'
  || top === '--execute'
  || top === '--model'
  || isDirectory(top)
) {
  await launchLocalOperator(topArgs);
} else if (top === 'registry') {
  const kind = process.argv[3] || 'all';
  if (!['all','commands','ack','tools','sdk','primitives'].includes(kind)) usage(1);
  await registry(kind);
} else if (top === 'compass') {
  process.stdout.write(JSON.stringify(await compass({persist:true}),null,2)+'\n');
} else if (top === 'status') {
  const result=await statusSnapshot();
  emitCliResult('status',result,{stable:true});
} else if (top === 'gates') {
  const action=process.argv[3] || null;
  if(action!=='--check' && action!=='check') usage(1);
  const result=await gatesCheck();
  emitCliResult('gates.check',result);
} else if (top === 'verify') {
  const argv=process.argv.slice(3);
  let sourceRef='stdin';
  let raw='';
  if(argv.includes('--stdin')) raw=await readStdinText();
  else {
    const fileIndex=argv.indexOf('--file');
    if(fileIndex<0 || !argv[fileIndex+1]) usage(1);
    sourceRef=path.resolve(argv[fileIndex+1]);
    raw=fs.readFileSync(sourceRef,'utf8');
  }
  try{
    const value=JSON.parse(raw);
    const result=verifyArtifact(value,{source_ref:sourceRef});
    emitCliResult('verify',result);
  }catch(error){
    emitCliResult('verify',{schema:'xiio.cli.verify/v1',state:'INVALID',source_ref:sourceRef,checks:[],first_red:'INVALID_JSON',silent_remainder:0},{error:{code:'INVALID_JSON',message:String(error.message||error)}});
  }
} else if (top === 'zed') {
  const family=process.argv[3] || null;
  const action=process.argv[4] || 'status';
  if(family!=='ibal' || !['status','recover'].includes(action)) usage(1);
  const result=await zedIbalRuntime(action);
  emitCliResult(`zed.ibal.${action}`,result);
} else if (top === 'doctor' || top === 'workspace') {
  const targetDir=process.argv[3] || null;
  if(targetDir){
    if(!isDirectory(targetDir)) throw new Error('workspace directory not found');
    process.chdir(fs.realpathSync(path.resolve(targetDir)));
  }
  await doctor();
} else if (top === 'cargo') {
  runCargoThroughTopology(process.argv.slice(3));
} else if (top === 'self-test') {
  await selfTest();
} else if (top === 'models') {
  const { localRuntimeStatus } = await import('./xi-local-agent.mjs');
  const status=await localRuntimeStatus();
  process.stdout.write((status.available_models||[]).join('\n')+'\n');
} else if (top === 'install') {
  installLocalCli();
} else if (top === 'studio' && process.argv[3] === 'fractal') {
  const ledgerPath=process.env.XIIO_FRACTAL_RECEIPT_LEDGER_PATH || path.join(
    os.homedir(),'.local','state','xi-io','studio','fractal-receipts.current.json'
  );
  try{
    const ledger=readJson(ledgerPath,'Studio fractal receipt ledger');
    if(ledger?.schema!=='xiio.studio.fractal-consumer-receipt-ledger/v1'){
      emitCliResult('studio.fractal',{
        schema:'xiio.cli.studio-fractal-ledger/v1',
        state:'BLOCKED',
        first_red:'FRACTAL_RECEIPT_LEDGER_SCHEMA_INVALID',
        path:ledgerPath,
        observed_schema:ledger?.schema||null,
        provider_effect:false,
        authority_granted:false,
      },{stable:true});
    }else{
      emitCliResult('studio.fractal',{
        schema:'xiio.cli.studio-fractal-ledger/v1',
        state:'PASS',
        path:ledgerPath,
        ledger,
        generation:ledger.generation,
        closure_100:ledger.closure_100===true,
        expected_receipt_denominator:ledger.expected_receipt_denominator,
        verified_count:ledger.verified_count,
        wait_count:ledger.wait_count,
        fail_count:ledger.fail_count,
        first_red:ledger.first_red||null,
        canonical_vector:ledger.canonical_vector,
        provider_effect:false,
        authority_granted:false,
        hard:[
          'CLI_PROJECTS_RECEIPT_LEDGER_DOES_NOT_RECOMPUTE',
          'MISSING_LEDGER!=PASS',
          'LEDGER_CLOSURE!=AUTHORITY'
        ]
      },{stable:true});
    }
  }catch(error){
    emitCliResult('studio.fractal',{
      schema:'xiio.cli.studio-fractal-ledger/v1',
      state:'TRUE_WAIT',
      path:ledgerPath,
      first_red:'FRACTAL_RECEIPT_LEDGER_UNREADABLE',
      error:String(error?.message||error),
      provider_effect:false,
      authority_granted:false,
    },{stable:true});
  }
} else if (top === 'hex' && process.argv[3] === 'floor') {
  const raw=process.argv.slice(4).filter((value)=>value!=='--json');
  const { flags }=args(raw);
  const floorPath=flags.file || process.env.XIIO_HEX_FLOOR_PATH || path.join(os.homedir(),'.local','state','xi-io','hex','floor.current.json');
  const floor=readJson(floorPath,'HEX floor');
  const binding=bindHexFloorCurrentness(floor);
  emitCliResult('hex.floor',{schema:'xiio.cli.hex-floor-read/v1',state:binding.state==='UNVERIFIED'||binding.state==='STALE'?'BLOCKED':'PASS',hex_floor:floor,binding,first_red:binding.blocker||null,provider_effect:false,authority_granted:false},{stable:true});
 } else if (top === 'lifecycle') {
  const action=process.argv[3] || 'status';
  const projection=lifecycleProjection();
  if(action==='status'){
    emitCliResult('lifecycle.status',projection,{stable:true});
  }else if(action==='next'){
    if(projection.state!=='PASS'){
      emitCliResult('lifecycle.next',projection,{stable:true});
    }else{
      const x=projection.lifecycle;
      emitCliResult('lifecycle.next',{
        schema:'xiio.cli.lifecycle-next/v1',
        state:'PASS',
        subject_ref:x.subject_ref,
        generation:x.generation,
        lifecycle_state:x.state,
        selectable:x.selectable,
        first_red:x.first_red,
        affected_refs:x.affected_refs||[],
        return_targets:x.return_targets||[],
        provider_effect:false,
        authority_granted:false,
      },{stable:true});
    }
  }else if(action==='explain'){
    if(projection.state!=='PASS'){
      emitCliResult('lifecycle.explain',projection,{stable:true});
    }else{
      const x=projection.lifecycle;
      emitCliResult('lifecycle.explain',{
        schema:'xiio.cli.lifecycle-explain/v1',
        state:'PASS',
        subject_ref:x.subject_ref,
        generation:x.generation,
        lifecycle_state:x.state,
        selectable:x.selectable,
        first_red:x.first_red,
        currentness:x.currentness,
        continuation:x.continuation,
        evidence:x.evidence,
        source_generations:x.source_generations,
        affected_refs:x.affected_refs||[],
        return_targets:x.return_targets||[],
        hard:x.hard||[],
        provider_effect:false,
        authority_granted:false,
      },{stable:true});
    }
  }else usage(1);
} else if (top === 'search') {
  const result=await searchRuntime(process.argv.slice(3));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode = ['FAIL','FAIL_CURRENT','BLOCKED'].includes(result.state) ? 2 : result.state==='TRUE_WAIT' ? 1 : 0;
} else if (top === 'hex' || top === 'inbox' || top === 'studio') {
  const action=process.argv[3] || 'status';
  const result=await productRuntime(top,action);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode = ['FAIL','FAIL_CURRENT','BLOCKED'].includes(result.state) ? 2 : 0;
} else if (top === 'runner') {
  const action=process.argv[3] || 'status';
  if (action === 'status') {
    process.stdout.write(JSON.stringify(runnerStatus(),null,2)+'\n');
  } else if (action === 'discover' || action === 'diagnose') {
    const result=recoverAriesRunner({execute:false});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode = result.state === 'BLOCKED' ? 2 : 0;
  } else if (action === 'recover') {
    const raw=process.argv.slice(4);
    const { flags }=args(raw);
    const result=recoverAriesRunner({
      execute:true,
      targetRepo:flags.repo || undefined,
      targetRunId:flags.run || undefined,
      targetJobId:flags.job || undefined,
      targetHeadSha:flags.head || undefined,
      waitSeconds:flags.wait?Number(flags.wait):undefined,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode = result.state === 'BLOCKED' ? 2 : 0;
  } else usage(1);
} else if (top === 'recover') {
  const target = process.argv[3] || null;
  const executeRecovery = process.argv.includes('--execute');
  const raw = process.argv.slice(4).filter((value)=>value!=='--execute');
  const { flags } = args(raw);
  if (target === 'aries-runner') {
    const result = recoverAriesRunner({
      execute:executeRecovery,
      targetRepo:flags.repo || undefined,
      targetRunId:flags.run || undefined,
      targetJobId:flags.job || undefined,
      targetHeadSha:flags.head || undefined,
      waitSeconds:flags.wait?Number(flags.wait):undefined,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode = result.state === 'BLOCKED' ? 2 : 0;
  } else if (target === 'inbox-runtime') {
    const result = recoverInboxRuntime({
      execute:executeRecovery,
      waitSeconds:flags.wait?Number(flags.wait):undefined,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode = result.state === 'BLOCKED' ? 2 : 0;
  } else usage(1);
} else if (top === 'sdk') {
  const argv = process.argv.slice(3);
  const call = argv.length === 1 && argv[0] === 'commands' ? ['--commands']
    : argv[0] === 'call' ? argv.slice(1) : [];
  process.exitCode = await runCli(call);
} else {
try {
  const { flags, positionals } = args(process.argv.slice(2));
  if (positionals.length < 2) usage(1);
  const [family, action, ...rest] = positionals;

  if (family === 'baseline' && action === 'compile') {
    writeOutput(compilePortfolioBaseline(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'file' && action === 'compile') {
    writeOutput(compilePortableSemanticFile(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'file' && action === 'cube') {
    writeOutput(compilePortableArtifactCube(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'file' && action === 'profiles') {
    writeOutput(artifactProfileCatalog(), flags.out);
  } else if (family === 'file' && action === 'profile') {
    if(flags.id) writeOutput(resolveArtifactProfile(flags.id), flags.out);
    else if(flags.media) writeOutput(resolveArtifactProfileByMediaType(flags.media), flags.out);
    else throw new Error('file profile requires --id or --media');
  } else if (family === 'file' && action === 'prepare') {
    if(flags.primitive){
      if(!flags.generation) throw new Error('file prepare --primitive requires --generation');
      writeOutput(prepareRegisteredPrimitiveShipment({
        primitive_id:flags.primitive,
        source_generation:flags.generation,
        source_ref:flags.source || undefined,
        file_id:flags.file || undefined,
        artifact_role:flags.role || undefined,
        cube_id:flags.cube || undefined,
      }), flags.out);
    } else if(flags.descriptor){
      if(!flags.file || !flags.role || !flags.source || !flags.generation) {
        throw new Error('file prepare --descriptor requires --file --role --source --generation');
      }
      writeOutput(prepareExternalArtifactShipment({
        descriptor:readJson(flags.descriptor,'--descriptor'),
        file_id:flags.file,
        artifact_role:flags.role,
        source_ref:flags.source,
        source_generation:flags.generation,
        profile_id:flags.profile || 'json.semantic.v1',
        cube_id:flags.cube || undefined,
      }), flags.out);
    } else throw new Error('file prepare requires --primitive or --descriptor');
  } else if (family === 'receipt' && action === 'fractal') {
    if(!flags.consumer||!flags.scale||!flags.input||!flags.producer||!flags.observer||!flags.source){
      throw new Error('receipt fractal requires --consumer --scale --input --producer --observer --source');
    }
    const vector=readJson(flags.input,'--input');
    writeOutput(compileFractalConsumerReceiptEnvelope({
      consumer_id:flags.consumer,
      scale:flags.scale,
      producer_ref:flags.producer,
      observer_ref:flags.observer,
      source_ref:flags.source,
      readback_ref:flags.readback||null,
      conserved:vector,
    }), flags.out);
  } else if (family === 'product' && action === 'compile') {
    writeOutput(compileProductCapabilityBaseline(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'fleet' && action === 'delivery') {
    writeOutput(compileFleetDeliveryGate(readJson(flags.input, '--input')), flags.out);
  } else if (family === '100s' && action === 'compile') {
    writeOutput(compileFourScaleScorecard(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'preflight' && action === 'compile') {
    writeOutput(compileGraduationPreflight(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'preflight' && action === 'profiles') {
    writeOutput(profileCatalog(), flags.out);
  } else if (family === 'preflight' && action === 'role') {
    writeOutput(compileProgressGateGraduation(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'preflight' && action === 'roles') {
    writeOutput(progressGatedRoleCatalog(), flags.out);
  } else if (family === 'crm' && action === 'current') {
    const limit = flags.limit == null ? null : Number(flags.limit);
    if (limit != null && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
    const requireIds = flags.require ? String(flags.require).split(',').map((x)=>x.trim()).filter(Boolean) : [];
    writeOutput(readLocalCrmCurrent({root:flags.root||null,limit,requireIds}), flags.out);
  } else if (family === 'graph' && action === 'cube') {
    writeOutput(compileDependencyCube(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'ibal' && action === 'compile-acks') {
    writeOutput(compileIbalAckRotfl(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'studio' && action === 'topology') {
    writeOutput(compileStudioHeadlessTopology(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'stack' && action === 'compile') {
    writeOutput(compileMiniPromptStack(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'stack' && action === 'reap') {
    writeOutput(applyMiniPromptReceipt(readJson(flags.input, '--input'), { card_id: flags.card, receipt_ref: flags.receipt, verified: flags.verified === 'true' }), flags.out);
  } else if (family === 'cadence' && action === 'continue') {
    writeOutput(compileContinuationCycle(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'work' && action === 'egress') {
    writeOutput(compileWorkEgressProjection(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'baseline') {
    const command = normalizeBaselineCommand(action);
    if (!command.verb || command.verb === 'compile') usage(1);
    writeOutput(compileBaselineCommandEnvelope(command, flags, rest), flags.out);
  } else if (family === 'ack' && action === 'distribute') {
    const baseline = readJson(flags.baseline, '--baseline');
    const rotfl = readJson(flags.rotfl, '--rotfl');
    writeOutput(attachRotflContextToAckSet(compileDistributedAcks(baseline), rotfl), flags.out);
  } else if (family === 'ack' && action === 'validate') {
    const envelope = readJson(flags.input, '--input');
    writeOutput({ schema: 'xiio.sdk.distributed-ack-validation/v1', ...validateRotflDistributedAck(envelope) }, flags.out);
  } else if (family === 'ack' && action === 'order') {
    writeOutput(rotflOrderCatalog(), flags.out);
  } else if (family === 'burnmap' && action === 'compile') {
    const baseline = readJson(flags.baseline, '--baseline');
    const returns = flags.returns ? readJson(flags.returns, '--returns') : [];
    writeOutput(compileOrgBurnMap(baseline, returns), flags.out);
  } else if (family === 'lesson' && action === 'promote') {
    writeOutput(compileLessonPromotion(readJson(flags.input, '--input')), flags.out);
  } else if (family === 'lexicon' && action === 'commands') {
    writeOutput(commandCatalog(), flags.out);
  } else usage(1);
} catch (error) {
  process.stderr.write('xi: invalid input or unsupported command\n');
  process.exit(2);
}
}
