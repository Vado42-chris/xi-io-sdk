#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeProviderFailure } from '../src/providers/state.mjs';
import { compileIbalCanary } from '../src/ibal/canary.mjs';
import { compileImpactFormation } from '../src/ibal/impact-formation.mjs';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';
import { compileContinuationDirective, compileContinuationLoop } from '../src/cadence/self-drive.mjs';
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
assert.equal(discovery.value.commands.length, 14);
assert.equal(discovery.value.semantic_aliases, 'RESOLVABLE_THROUGH_COMMAND_LEXICON');
assert.equal(discovery.value.vocabulary, 'EXACT_PUBLIC_EXPORT_NAMES');
assert.equal(new Set(discovery.value.commands.map(x => x.command)).size, 14);
assert(discovery.value.commands.some(x => x.command === 'compileImpactFormation' && x.specifier === '@xi-io/sdk/ibal/impact-formation'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationCycle' && x.specifier === '@xi-io/sdk/cadence'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationDirective' && x.specifier === '@xi-io/sdk/cadence/self-drive'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationLoop' && x.specifier === '@xi-io/sdk/cadence/self-drive'));
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

const impactInput = {
  schema: 'xiio.sdk.impact-formation/v1',
  root: { root_ref: 'root:cli-canary', generation: 'g1', golden_priority_ref: 'golden:cli-canary', formation_profile_ref: 'formation:TRINITY_V1' },
  nodes: [{
    ref: 'subject:cli-canary', direction: 'CURRENT', state: 'AFFECTED', currentness: 'CURRENT', priority: 'P0',
    risk: 1, user_impact: 2, time_pressure: 2, fanout: 1, cognitive_load: 2,
    human_facing: true, independent_review_required: true, ux_review_required: true,
    parallel_safe: true, runnable: true, dependencies: [],
  }],
};
const impact = invoke(['compileImpactFormation'], { args: [impactInput] });
assert.equal(impact.code, 0);
assert.deepEqual(impact.value.result, compileImpactFormation(impactInput));
assert.equal(impact.value.result.detonation_denominator, 3);
assert.equal(impact.value.result.exact_materializable_principal_count, null);

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

const directiveInput = { ...continuationInput, owner_heartbeat_count: 0 };
const directive = invoke(['compileContinuationDirective'], { args: [directiveInput] });
assert.equal(directive.code, 0);
assert.deepEqual(directive.value.result, compileContinuationDirective(directiveInput));
assert.equal(directive.value.result.stop_class, 'CONTINUE');
assert.equal(directive.value.result.next_packet.work_ref, 'next:work');
assert.equal(directive.value.result.next_packet.owner_ingress_required, false);
assert.equal(directive.value.result.next_packet.provider_effect, false);
assert.equal(directive.value.result.reconciliation_state, 'NOT_REQUIRED');
assert.equal(directive.value.result.destructive_follow_on_allowed, true);

const heartbeatInput = { ...continuationInput, owner_heartbeat_count: 1 };
const heartbeatDirective = invoke(['compileContinuationDirective'], { args: [heartbeatInput] });
assert.equal(heartbeatDirective.code, 0);
assert.deepEqual(heartbeatDirective.value.result, compileContinuationDirective(heartbeatInput));
assert.equal(heartbeatDirective.value.result.status, 'FAIL_CURRENT');
assert.equal(heartbeatDirective.value.result.owner_heartbeat_bug, true);
assert.equal(heartbeatDirective.value.result.stop_class, 'CONTINUE');
assert.equal(heartbeatDirective.value.result.yield_allowed, false);
assert.equal(heartbeatDirective.value.result.next_packet.work_ref, 'next:work');
assert.equal(heartbeatDirective.value.result.next_packet.owner_ingress_required, false);

const heartbeatLoopInput = { cycles: [heartbeatInput] };
const heartbeatLoop = invoke(['compileContinuationLoop'], { args: [heartbeatLoopInput] });
assert.equal(heartbeatLoop.code, 0);
assert.deepEqual(heartbeatLoop.value.result, compileContinuationLoop(heartbeatLoopInput));
assert.equal(heartbeatLoop.value.result.status, 'FAIL_CURRENT');
assert.equal(heartbeatLoop.value.result.owner_heartbeat_bug, true);
assert.equal(heartbeatLoop.value.result.loop_state, 'HOST_CONTINUE_REQUIRED');
assert.equal(heartbeatLoop.value.result.yield_allowed, false);
assert.equal(heartbeatLoop.value.result.awaiting_host_action, true);
assert.equal(heartbeatLoop.value.result.next_packet.work_ref, 'next:work');
assert.equal(heartbeatLoop.value.result.stop_contract.includes('FAIL_CURRENT'), false);

const partialEffectInput = {
  ...continuationInput,
  owner_heartbeat_count: 0,
  effect_state: 'PARTIAL_EFFECT_UNKNOWN',
  reconciliation_required: true,
};
const partialEffectDirective = invoke(['compileContinuationDirective'], { args: [partialEffectInput] });
assert.equal(partialEffectDirective.code, 0);
assert.deepEqual(partialEffectDirective.value.result, compileContinuationDirective(partialEffectInput));
assert.equal(partialEffectDirective.value.result.status, 'FAIL_CURRENT');
assert.equal(partialEffectDirective.value.result.reconciliation_state, 'RECONCILE_REQUIRED');
assert.equal(partialEffectDirective.value.result.reconciliation_required, true);
assert.equal(partialEffectDirective.value.result.destructive_follow_on_allowed, false);
assert.equal(partialEffectDirective.value.result.stop_class, 'CONTINUE');
assert.equal(partialEffectDirective.value.result.yield_allowed, false);
assert.equal(partialEffectDirective.value.result.next_packet.action, 'RECONCILE_EFFECT');
assert.equal(partialEffectDirective.value.result.next_packet.work_ref, null);
assert.equal(partialEffectDirective.value.result.next_packet.destructive_follow_on_allowed, false);
assert.deepEqual(partialEffectDirective.value.result.next_packet.allowed_operation_classes, ['READ_ONLY_RECONCILIATION']);
assert(partialEffectDirective.value.result.bugs.includes('EFFECT_UNKNOWN_REQUIRES_RECONCILIATION'));

const partialEffectLoop = invoke(['compileContinuationLoop'], { args: [{ cycles: [partialEffectInput] }] });
assert.equal(partialEffectLoop.code, 0);
assert.deepEqual(partialEffectLoop.value.result, compileContinuationLoop({ cycles: [partialEffectInput] }));
assert.equal(partialEffectLoop.value.result.status, 'FAIL_CURRENT');
assert.equal(partialEffectLoop.value.result.loop_state, 'HOST_CONTINUE_REQUIRED');
assert.equal(partialEffectLoop.value.result.reconciliation_required, true);
assert.equal(partialEffectLoop.value.result.destructive_follow_on_allowed, false);
assert.equal(partialEffectLoop.value.result.awaiting_host_action, true);
assert.equal(partialEffectLoop.value.result.next_packet.action, 'RECONCILE_EFFECT');
assert.equal(partialEffectLoop.value.result.stop_contract.includes('RECONCILE_REQUIRED'), false);

const failedNoEffectInput = {
  ...continuationInput,
  owner_heartbeat_count: 0,
  effect_state: 'FAILED_NO_EFFECT',
};
const failedNoEffectDirective = invoke(['compileContinuationDirective'], { args: [failedNoEffectInput] });
assert.equal(failedNoEffectDirective.code, 0);
assert.deepEqual(failedNoEffectDirective.value.result, compileContinuationDirective(failedNoEffectInput));
assert.equal(failedNoEffectDirective.value.result.reconciliation_required, false);
assert.equal(failedNoEffectDirective.value.result.destructive_follow_on_allowed, true);
assert.equal(failedNoEffectDirective.value.result.next_packet.action, 'EXECUTE_WORK');

const waitInput = structuredClone(directiveInput);
waitInput.backlog = [{ id: 'provider:wait', state: 'TRUE_WAIT', wake_when: 'provider://return/next' }];
const loopInput = { cycles: [directiveInput, waitInput] };
const loop = invoke(['compileContinuationLoop'], { args: [loopInput] });
assert.equal(loop.code, 0);
assert.deepEqual(loop.value.result, compileContinuationLoop(loopInput));
assert.equal(loop.value.result.status, 'CURRENT');
assert.equal(loop.value.result.loop_state, 'TRUE_WAIT');
assert.equal(loop.value.result.yield_allowed, true);
assert.equal(loop.value.result.owner_heartbeat_bug, false);

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

console.log(JSON.stringify({ status: 'PASS', public_commands: 14, positive_cases: 18, hostile_cases: 12, provider_effects: 0, authenticated_registry_claims: 0 }));
