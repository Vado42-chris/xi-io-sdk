#!/usr/bin/env node
import { commandCatalog } from '../lexicon/baseline-commands.mjs';
import manifest from '../../package.json' with { type: 'json' };
import * as Providers from '../providers/state.mjs';
import * as Wakes from '../wakes/envelope.mjs';
import * as Ibal from '../ibal/canary.mjs';
import * as ImpactFormation from '../ibal/impact-formation.mjs';
import * as Cadence from '../cadence/continuation.mjs';
import * as SelfDrive from '../cadence/self-drive.mjs';
import * as RejoinRefresh from '../transport/rejoin-refresh.mjs';
import * as Lexicon from '../lexicon/resolve-token.mjs';
import * as Adoption from '../adoption/primitive-plan.mjs';
import * as Callables from '../callables/resolve.mjs';

const MAX_BYTES = 1_048_576;
const modules = [
  ['@xi-io/sdk/providers', Providers],
  ['@xi-io/sdk/wakes', Wakes],
  ['@xi-io/sdk/ibal', Ibal],
  ['@xi-io/sdk/ibal/impact-formation', ImpactFormation],
  ['@xi-io/sdk/cadence', Cadence],
  ['@xi-io/sdk/cadence/self-drive', SelfDrive],
  ['@xi-io/sdk/transport/rejoin-refresh', RejoinRefresh],
  ['@xi-io/sdk/command-lexicon/resolve', Lexicon],
  ['@xi-io/sdk/adoption', Adoption],
  ['@xi-io/sdk/callables', Callables],
];
const arity = {
  normalizeProviderFailure: [1, 1],
  normalizeWakeEnvelope: [1, 1],
  evaluateWakeProgress: [1, 2],
  compileIbalCanary: [1, 1],
  compileImpactFormation: [1, 1],
  compileContinuationCycle: [1, 1],
  compileContinuationDirective: [1, 1],
  compileContinuationLoop: [1, 1],
  compileRejoinTransportRefresh: [1, 1],
  resolveLexiconCommand: [1, 1],
  derivePrimitiveAdoptionPlan: [1, 1],
  deriveAffectedPrimitiveConsumers: [1, 1],
  resolveCallable: [2, 2],
  callableUuidFor: [2, 2],
  listCallablePrimitives: [1, 1],
};
const commands = new Map();
for (const [specifier, module] of modules) {
  for (const [name, callable] of Object.entries(module)) {
    if (!Object.hasOwn(arity, name)) continue;
    if (commands.has(name) || typeof callable !== 'function') throw new Error('CLI callable binding invalid');
    commands.set(name, { specifier, callable, arity: arity[name] });
  }
}
if (commands.size !== Object.keys(arity).length) throw new Error('CLI callable binding incomplete');

export function commandLexicon() {
  return {
    schema: 'xiio.sdk.command-lexicon/v1',
    namespace: commandCatalog().namespace,
    command_id: 'sdk.call',
    version: manifest.version,
    vocabulary: 'EXACT_PUBLIC_EXPORT_NAMES',
    semantic_aliases: 'RESOLVABLE_THROUGH_COMMAND_LEXICON',
    provider_effect: false,
    authority_granted: false,
    commands: [...commands].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, entry]) => ({
      command: name,
      specifier: entry.specifier,
      export: name,
      positional_json_args: { min: entry.arity[0], max: entry.arity[1] },
    })),
  };
}

function checkInputTree(value) {
  const stack = [[value, 0]];
  let visited = 0;
  while (stack.length) {
    const [item, depth] = stack.pop();
    if (++visited > 20_000 || depth > 32) throw new Error('INPUT_BOUNDS');
    if (!item || typeof item !== 'object') continue;
    for (const [key, child] of Object.entries(item)) {
      if (/authorization|api[-_]?key|password|secret|token|cookie/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('SENSITIVE_INPUT');
      stack.push([child, depth + 1]);
    }
  }
}

async function readInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BYTES) throw new Error('INPUT_BOUNDS');
    chunks.push(buffer);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !Array.isArray(input.args)) throw new Error('INVALID_INPUT');
  checkInputTree(input);
  return input.args;
}

export async function runCli(argv, { stdin = process.stdin, stdout = process.stdout } = {}) {
  const emit = value => stdout.write(`${JSON.stringify(value)}\n`);
  if (argv.length === 1 && ['--commands', '--help'].includes(argv[0])) {
    emit(commandLexicon());
    return 0;
  }
  const command = argv[0];
  const binding = argv.length === 1 ? commands.get(command) : null;
  if (!binding) {
    emit({ schema: 'xiio.sdk.command-result/v1', status: 'REJECTED', reason: 'UNKNOWN_COMMAND', provider_effect: false });
    return 2;
  }
  try {
    const args = await readInput(stdin);
    if (args.length < binding.arity[0] || args.length > binding.arity[1]) throw new Error('INVALID_INPUT');
    const result = binding.callable(...args);
    checkInputTree(result);
    emit({ schema: 'xiio.sdk.command-result/v1', status: 'COMPUTED', command, callable: `${binding.specifier}#${command}`, lexicon: { namespace: commandCatalog().namespace, command_id: 'sdk.call', version: manifest.version }, provider_effect: false, authority_granted: false, result });
    return 0;
  } catch {
    emit({ schema: 'xiio.sdk.command-result/v1', status: 'REJECTED', reason: 'INVALID_INPUT', provider_effect: false });
    return 2;
  }
}
