#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeProviderFailure } from '../src/providers/state.mjs';
import { compileIbalCanary } from '../src/ibal/canary.mjs';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';
import { resolveLexiconCommand } from '../src/lexicon/resolve-token.mjs';

const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));
function invoke(command, input) {
  const run = spawnSync(process.execPath, [binary, ...(command[0] === '--commands' ? ['sdk', 'commands'] : ['sdk', 'call', ...command])], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 2_097_152,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.stderr, '');
  return { code: run.status, output: run.stdout, value: JSON.parse(run.stdout) };
}

const discovery = invoke(['--commands'], '');
assert.equal(discovery.code, 0);
assert.equal(discovery.value.commands.length, 11);
assert.equal(discovery.value.semantic_aliases, 'RESOLVABLE_THROUGH_COMMAND_LEXICON');
assert.equal(discovery.value.vocabulary, 'EXACT_PUBLIC_EXPORT_NAMES');
assert.equal(new Set(discovery.value.commands.map(x => x.command)).size, 11);
assert(discovery.value.commands.some(x => x.command === 'compileContinuationCycle' && x.specifier === '@xi-io/sdk/cadence'));
assert(discovery.value.commands.some(x => x.command === 'resolveLexiconCommand' && x.specifier === '@xi-io/sdk/command-lexicon/resolve'));
assert.equal(discovery.output, invoke(['--commands'], '').output);

const failure = { provider: 'External provider', http_status: 429, provider_status: 'RESOURCE_EXHAUSTED' };
const computed = invoke(['normalizeProviderFailure'], { args: [failure] });
assert.equal(computed.code, 0);
assert.equal(computed.value.status, 'COMPUTED');
assert.equal(computed.value.provider_effect, false);
assert.deepEqual(computed.value.result, normalizeProviderFailure(failure));

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ibal/switchboard-glass-box-canary.synthetic.json', import.meta.url)));
const canary = invoke(['compileIbalCanary'], { args: [fixture] });
assert.equal(canary.code, 0);
assert.deepEqual(canary.value.result, compileIbalCanary(fixture));
assert.equal(canary.value.result.provider_coverage.authenticated_registry_proof, false);
const incompleteLearning = structuredClone(fixture);
delete incompleteLearning.lesson_fractal.learning.peer_replay;
const learning = invoke(['compileIbalCanary'], { args: [incompleteLearning] });
assert.equal(learning.code, 0);
assert.equal(learning.value.status, 'COMPUTED');
assert.equal(learning.value.result.readiness, 'WAIT');
assert.equal(learning.value.result.lesson_fractal.learning.closed, false);
assert(learning.value.result.blockers.includes('LEARNING_INDEPENDENT_PEER_REPLAY_UNKNOWN'));

const continuationInput = {
  root_ref: 'root:cli-canary', worker_ref: 'worker:cli-canary',
  subject_generation: 'g1', current_generation: 'g1', phase_event: 'POST_RESULT', pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [{ id: 'next:work', state: 'RUNNABLE', priority: 1 }],
  returns: [], residue: [], occurrences: [],
  worker_inbox: { ref: 'inbox:worker/cli-canary', current: true, actionable_count: 0 },
};
const continuation = invoke(['compileContinuationCycle'], { args: [continuationInput] });
assert.equal(continuation.code, 0);
assert.deepEqual(continuation.value.result, compileContinuationCycle(continuationInput));
assert.equal(continuation.value.result.disposition, 'CONTINUE_WORK');
assert.equal(continuation.value.result.terminal, false);

for (const token of ['burn', 'overnight burn', '/babysit', '#babysit']) {
  const lex = invoke(['resolveLexiconCommand'], { args: [token] });
  assert.equal(lex.code, 0);
  assert.deepEqual(lex.value.result, resolveLexiconCommand(token));
  assert.equal(lex.value.result.state, 'RESOLVED');
  assert.equal(lex.value.authority_granted, false);
}

const wake = JSON.parse(fs.readFileSync(new URL('../fixtures/wakes/inbox-adoption.synthetic.json', import.meta.url)));
const progress = invoke(['evaluateWakeProgress'], { args: [wake, { returned: true }] });
assert.equal(progress.code, 0);
assert.equal(progress.value.result.false_green, true);
assert.equal(progress.value.result.applied, false);

let nested = {};
for (let i = 0; i < 34; i++) nested = { nested };
for (const [command, input] of [
  [['#worker'], { args: [] }],
  [['../src/providers/state.mjs'], { args: [] }],
  [['normalizeProviderFailure', '--source-current'], { args: [failure] }],
  [['normalizeProviderFailure'], '{invalid'],
  [['normalizeProviderFailure'], { args: [] }],
  [['normalizeProviderFailure'], { args: [failure, failure] }],
  [['normalizeProviderFailure'], { args: [failure], extra: true }],
  [['normalizeProviderFailure'], { args: [{ headers: { Authorization: 'sensitive-marker' } }] }],
  [['normalizeWakeEnvelope'], { args: [{ 'sensitive-marker': true }] }],
  [['normalizeProviderFailure'], { args: [nested] }],
  [['normalizeProviderFailure'], '{"args":[{"__proto__":{"safe":false}}]}'],
  [['normalizeProviderFailure'], ' '.repeat(1_048_577)],
]) {
  const denied = invoke(command, input);
  assert.equal(denied.code, 2);
  assert.equal(denied.value.status, 'REJECTED');
  assert.equal(denied.value.provider_effect, false);
  assert(!denied.output.includes('sensitive-marker'));
}

console.log(JSON.stringify({ status: 'PASS', public_commands: 11, positive_cases: 10, hostile_cases: 12, provider_effects: 0, authenticated_registry_claims: 0 }));
