#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
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
import { runCli, commandLexicon } from '../src/cli/public-exports.mjs';
import primitiveCatalog from '../src/catalog/primitives.json' with { type: 'json' };

function usage(code = 0) {
  const text = `xi-io local operator + SDK CLI

Start here:
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
  xi-io doctor                  Show workspace/Ollama/tool readiness
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
  xi-io cadence continue --input <continuation.json> [--out <continuation-result.json>]
  xi-io studio topology --input <install.json> [--out <topology.json>]
  xi-io studio roster --input <registry.json> [--out <roster.json>]
  xi-io stack compile --input <mini-prompt.json> [--out <punchcards.json>]
  xi-io stack reap --input <punchcards.json> --card <C001> --receipt <ref> [--verified true]
  xi-io work egress --input <work-egress.json> [--out <projection.json>]
  xi-io ack distribute --baseline <baseline.json> --rotfl <rotfl-context.json> [--out <acks.json>]
  xi-io ack validate --input <ack.json> [--out <validation.json>]
  xi-io burnmap compile --baseline <baseline.json> [--returns <returns.json>] [--out <burnmap.json>]
  xi-io lesson promote --input <lesson.json> [--out <promotion.json>]

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
  xi cadence continue
  xi studio topology
  xi studio roster
  xi stack compile
  xi stack reap
  xi work egress
  xi ack distribute
  xi ack validate
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
  for (let i=0;i<argv.length;i+=1) {
    const value=argv[i];
    if (value === 'chat' || value === 'shell' || value === '--execute') continue;
    if (value === '--model') {
      const selected=argv[i+1];
      if(!selected || selected.startsWith('--')) throw new Error('--model requires a value');
      process.env.XIIO_OLLAMA_MODEL=selected;
      i+=1;
      continue;
    }
    if (!value.startsWith('-')) {
      if (workspaceArg) throw new Error('only one workspace directory may be selected');
      workspaceArg=value;
    }
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
    '[[ -r "$ROOT_FILE" ]] || { echo "xi-io: missing $ROOT_FILE" >&2; exit 1; }',
    'ROOT="$(tr -d "\\r\\n" < "$ROOT_FILE")"',
    'NODE="${XIIO_NODE:-$HOME/.nvm/versions/node/v24.11.1/bin/node}"',
    '[[ -x "$NODE" ]] || NODE="$(command -v node)"',
    'exec "$NODE" "$ROOT/bin/xi.mjs" "$@"',
    '',
  ].join('\n');

  const bins=['xi-io','xi'];
  for(const name of bins){
    const dest=path.join(binDir,name);
    try{ if(fs.existsSync(dest)) fs.unlinkSync(dest); }catch{}
    fs.writeFileSync(dest,wrapper,{encoding:'utf8',mode:0o755});
    fs.chmodSync(dest,0o755);
  }

  const receipt={
    schema:'xiio.cli.install/v1',
    installed:true,
    sdk_root:root,
    root_file:rootFile,
    bins:bins.map((name)=>path.join(binDir,name)),
    default_entry:'xi-io',
    workspace_semantics:'CURRENT_DIRECTORY_OR_EXPLICIT_DIRECTORY',
    ollama_semantics:'LOCAL_ONLY_NO_AUTOMATIC_CLOUD_FALLBACK',
    commands:['xi-io','xi-io --execute','xi-io <directory>','xi-io registry','xi-io doctor'],
    authority_granted:false,
    provider_effect:false,
  };
  fs.writeFileSync(path.join(stateDir,'install.current.json'),JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}

async function doctor() {
  const { localRuntimeStatus, localToolCatalog } = await import('./xi-local-agent.mjs');
  const runtime = await localRuntimeStatus();
  const local = localToolCatalog();
  process.stdout.write(JSON.stringify({
    schema:'xiio.cli.human-doctor/v1',
    status:runtime.ollama_state.startsWith('READY_') ? 'READY_LOCAL' : 'WAIT_LOCAL_OLLAMA',
    workspace:runtime.cwd,
    model:runtime.model,
    ollama_endpoint:runtime.ollama_endpoint,
    ollama_state:runtime.ollama_state,
    execution:runtime.execution,
    local_tools:local.tools,
    ack_commands:commandCatalog().commands.filter((row)=>row.id.startsWith('ack.')).map((row)=>row.cli),
    command_registry_count:commandCatalog().commands.length,
    public_sdk_callable_count:commandLexicon().commands.length,
    primitive_catalog_count:Array.isArray(primitiveCatalog.primitives)?primitiveCatalog.primitives.length:0,
    provider_effect:false,
    automatic_cloud_fallback:false,
    installed_bins:[
      path.join(os.homedir(),'.local','bin','xi-io'),
      path.join(os.homedir(),'.local','bin','xi'),
    ].map((bin)=>({bin,exists:fs.existsSync(bin)})),
    sdk_root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),
  }, null, 2) + '\n');
}

if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) usage(0);

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
} else if (top === 'doctor' || top === 'workspace') {
  const targetDir=process.argv[3] || null;
  if(targetDir){
    if(!isDirectory(targetDir)) throw new Error('workspace directory not found');
    process.chdir(fs.realpathSync(path.resolve(targetDir)));
  }
  await doctor();
} else if (top === 'models') {
  const { localRuntimeStatus } = await import('./xi-local-agent.mjs');
  const status=await localRuntimeStatus();
  process.stdout.write((status.available_models||[]).join('\n')+'\n');
} else if (top === 'install') {
  installLocalCli();
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
