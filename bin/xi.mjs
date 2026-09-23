#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compilePortfolioBaseline, compileDistributedAcks, compileOrgBurnMap } from '../src/baseline/compiler.mjs';
import { compileProductCapabilityBaseline } from '../src/baseline/product-capability.mjs';
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
import { readLocalCrmCurrent } from '../src/bridges/crm-current.mjs';
import { compileDependencyCube } from '../src/graphs/dependency-cube.mjs';
import { compileIbalAckRotfl } from '../src/ibal/ack-rotfl-compiler.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };

const SDK_VERSION=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

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
  xi-io compass                 Resolve HOME/common/Studio/framework/currentness/runtime truth
  xi-io self-test               Test installed CLI, workspace guard, registries, and local runtime
  xi-io models                  List installed Ollama models
  xi-io install                 Install xi-io + xi wrappers into ~/.local/bin

Interactive slash commands:
  /help /workspace /tools /commands /ack /model /models /status /clear /exit

Pure compilers:
  xi-io baseline compile --input <snapshot.json> [--out <baseline.json>]
  xi-io product compile --input <products.json> [--out <product-baseline.json>]
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

async function doctor() {
  const { localRuntimeStatus, localToolCatalog } = await import('./xi-local-agent.mjs');
  const runtime = await localRuntimeStatus();
  const local = localToolCatalog();
  const runner = runnerStatus();
  const compassState = await compass({persist:true});
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
      'PHYSICAL_PATH != CURRENT_GENERATION'
    ],
    workspace:runtime.cwd,
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
} else if (top === 'doctor' || top === 'workspace') {
  const targetDir=process.argv[3] || null;
  if(targetDir){
    if(!isDirectory(targetDir)) throw new Error('workspace directory not found');
    process.chdir(fs.realpathSync(path.resolve(targetDir)));
  }
  await doctor();
} else if (top === 'self-test') {
  await selfTest();
} else if (top === 'models') {
  const { localRuntimeStatus } = await import('./xi-local-agent.mjs');
  const status=await localRuntimeStatus();
  process.stdout.write((status.available_models||[]).join('\n')+'\n');
} else if (top === 'install') {
  installLocalCli();
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
