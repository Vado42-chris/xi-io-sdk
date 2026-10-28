#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeProviderFailure } from '../src/providers/state.mjs';
import { compileIbalCanary } from '../src/ibal/canary.mjs';
import { compileImpactFormation } from '../src/ibal/impact-formation.mjs';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';
import { compileContinuationDirective, compileContinuationLoop, compileRejoinSeams } from '../src/cadence/self-drive.mjs';
import { resolveLexiconCommand } from '../src/lexicon/resolve-token.mjs';
import { snap55 } from '../src/evaluation/hallbergmaths-snap55.mjs';

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
assert.equal(discovery.value.commands.length, 28);
assert.equal(discovery.value.semantic_aliases, 'RESOLVABLE_THROUGH_COMMAND_LEXICON');
assert.equal(discovery.value.vocabulary, 'EXACT_PUBLIC_EXPORT_NAMES');
assert.equal(new Set(discovery.value.commands.map(x => x.command)).size, 28);
assert(discovery.value.commands.some(x => x.command === 'compileImpactFormation' && x.specifier === '@xi-io/sdk/ibal/impact-formation'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationCycle' && x.specifier === '@xi-io/sdk/cadence'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationDirective' && x.specifier === '@xi-io/sdk/cadence/self-drive'));
assert(discovery.value.commands.some(x => x.command === 'compileContinuationLoop' && x.specifier === '@xi-io/sdk/cadence/self-drive'));
assert(discovery.value.commands.some(x => x.command === 'compileRejoinSeams' && x.specifier === '@xi-io/sdk/cadence/self-drive'));
assert(discovery.value.commands.some(x => x.command === 'resolveLexiconCommand' && x.specifier === '@xi-io/sdk/command-lexicon/resolve'));
assert(discovery.value.commands.some(x => x.command === 'compileFlatplaneCube' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileFlatpackPatch' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileSpinSet' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'detonateLogicGates' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileBlastwaveImpact' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileAftercareCard' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileReapDebtMeter' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileOwnerCogLedger' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileProjectionRebaseGate' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'compileCubeCoordinate' && x.specifier === '@xi-io/sdk/flatpack'));
assert(discovery.value.commands.some(x => x.command === 'snap55' && x.specifier === '@xi-io/sdk/evaluation/hallbergmaths-snap55'));
assert.equal(discovery.output, invoke(['--commands'], '').output);

// Read-only historical 5.5 computation through the real installed CLI entrypoint.
// This is not KM1–KM16 proof, provider authority, or native HEX window acceptance.
const snapNow = Date.UTC(2026, 9, 13);
const snapQuestions = [{id:'a',pillar:'autism'},{id:'b',pillar:'adhd'}];
const snapPacket = {questions:snapQuestions, responses:{a:0,b:4}, nowMs:snapNow,
  journal:[{timestamp:snapNow-3_600_000,sensoryEntropy:20}]};
const snapComputed = invoke(['snap55'], {args:[snapPacket]});
assert.equal(snapComputed.code,0);
assert.equal(snapComputed.value.status,'COMPUTED');
assert.equal(snapComputed.value.callable,'@xi-io/sdk/evaluation/hallbergmaths-snap55#snap55');
assert.equal(snapComputed.value.provider_effect,false);
assert.equal(snapComputed.value.authority_granted,false);
assert.deepEqual(snapComputed.value.result,snap55(snapPacket));
assert.equal(snapComputed.value.result.state,'SOURCE_BOUND_NUMERIC');
assert.equal(snapComputed.value.result.effect_authority,0);
assert(Number.isFinite(snapComputed.value.result.R));
const independentSnapBaseline = 32 / 84; // known answers: 0 × 13 + 4 × 8, max 4 × (13 + 8)
const independentSnapR = (1/4)*independentSnapBaseline + (65/100)*(20/100) + (1/10)*(5/100);
assert.ok(Math.abs(snapComputed.value.result.baseline-independentSnapBaseline)<1e-14,
  'independent weighted denominator must survive actual CLI transport');
assert.ok(Math.abs(snapComputed.value.result.R-independentSnapR)<1e-14,
  'read-only SNAP numerical answer must agree with independent known-answer arithmetic');

assert.equal(snapComputed.output,invoke(['snap55'],{args:[snapPacket]}).output,
  'same explicit timestamp and packet must preserve byte-identical output');
const snapImplicitNow=invoke(['snap55'],{args:[{
  questions:snapQuestions,responses:{a:0,b:4},
  journal:[{timestamp:snapNow-3_600_000,sensoryEntropy:20}]
}]});
assert.equal(snapImplicitNow.code,2,'ambient wall-clock timestamp is not a replayable desktop input');
assert.equal(snapImplicitNow.value.status,'REJECTED');
assert.equal(snapImplicitNow.value.reason,'INVALID_INPUT');
assert.equal(snapImplicitNow.value.provider_effect,false);

const snapUnknown = invoke(['snap55'], {args:[{...snapPacket,responses:{a:0}}]});
assert.equal(snapUnknown.code,0);
assert.equal(snapUnknown.value.result.state,'UNKNOWN_REQUIRED_RESPONSES');
assert.equal(snapUnknown.value.result.R,null);
assert.equal(snapUnknown.value.authority_granted,false);
const snapDuplicated = invoke(['snap55'], {args:[{...snapPacket,
 questions:[snapQuestions[0],{id:'a',pillar:'adhd'}]}]});
assert.equal(snapDuplicated.code,2);
assert.equal(snapDuplicated.value.status,'REJECTED');
assert.equal(snapDuplicated.value.reason,'INVALID_INPUT');
const snapInvalidTime = invoke(['snap55'], {args:[{...snapPacket,nowMs:null}]});
assert.equal(snapInvalidTime.code,2);
assert.equal(snapInvalidTime.value.status,'REJECTED');
// Exact millisecond JSON round-trip: no silent float/unsafe-integer time drift.
for(const nowMs of [Number.MAX_SAFE_INTEGER+1,snapNow+0.5]){
  const denied=invoke(['snap55'],{args:[{...snapPacket,nowMs}]});
  assert.equal(denied.code,2);
  assert.equal(denied.value.status,'REJECTED');
  assert.equal(denied.value.reason,'INVALID_INPUT');
  assert.equal(denied.value.provider_effect,false);
}
for(const timestamp of [Number.MAX_SAFE_INTEGER+1,snapNow-0.5]){
  const unknown=invoke(['snap55'],{args:[{...snapPacket,
    journal:[{timestamp,sensoryEntropy:20}]}]});
  assert.equal(unknown.code,0);
  assert.equal(unknown.value.result.state,'UNKNOWN_JOURNAL_DATA');
  assert.equal(unknown.value.result.R,null);
  assert.equal(unknown.value.result.excluded_future,0);
  assert.equal(unknown.value.authority_granted,false);
}
const snapInvalidJournal = invoke(['snap55'], {args:[{...snapPacket,
 journal:[{timestamp:'not-a-timestamp',sensoryEntropy:20}]}]});
assert.equal(snapInvalidJournal.code,0);
assert.equal(snapInvalidJournal.value.result.state,'UNKNOWN_JOURNAL_DATA');
assert.equal(snapInvalidJournal.value.result.R,null);


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

const rejoinInput = {
  ...directiveInput,
  phase_event: 'POST_EFFECT_READBACK',
  backlog: [{ id: 'SEAM_ONE', state: 'TRUE_WAIT', priority: 1, wake_when: 'receipt:seam-one' }],
  seams: [{ seam_ref: 'SEAM_ONE', kind: 'ACK', state: 'TRUE_WAIT', priority: 1, wake_receipt_ref: 'receipt:seam-one' }],
  seam_receipts: [{
    receipt_ref: 'receipt:seam-one',
    seam_ref: 'SEAM_ONE',
    root_ref: directiveInput.root_ref,
    subject_generation: directiveInput.subject_generation,
    current_generation: directiveInput.current_generation,
    authenticated: true,
    verified: true,
    provider_readback: true,
  }],
};
const rejoin = invoke(['compileRejoinSeams'], { args: [rejoinInput] });
assert.equal(rejoin.code, 0);
assert.deepEqual(rejoin.value.result, compileRejoinSeams(rejoinInput));
assert.equal(rejoin.value.result.next_action.action, 'COMPILE_RETURN');
assert.equal(rejoin.value.result.authority_granted, false);
assert.equal(rejoin.value.result.provider_effect, false);

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

console.log(JSON.stringify({ status: 'PASS', public_commands: 28, positive_cases: 20, hostile_cases: 19, provider_effects: 0, authenticated_registry_claims: 0 }));
