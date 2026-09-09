#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileIbalCanary } from '../src/ibal/canary.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ibal/switchboard-glass-box-canary.synthetic.json', import.meta.url), 'utf8'));
const baseline = compileIbalCanary(fixture);
assert.equal(baseline.provider_denominator, 6);
assert.equal(baseline.provider_coverage.binding_state, 'SUPPLIED_UNVERIFIED');
assert.equal(baseline.provider_coverage.authenticated_registry_proof, false);
assert.equal(baseline.effects, 0);
assert.equal(baseline.authority_granted, false);
assert.equal(baseline.readiness, 'WAIT');
assert.deepEqual(baseline.blockers, ['EMAIL_ACCESS_NOT_QUALIFIED']);

const readyInput = structuredClone(fixture);
readyInput.email.access_state = 'QUALIFIED';
const ready = compileIbalCanary(readyInput);
assert.equal(ready.readiness, 'READY_FOR_SWITCHBOARD_PREFLIGHT');
assert.deepEqual(ready.blockers, []);

const unknownProvider = structuredClone(readyInput);
unknownProvider.provider_lessons[1].state = 'UNKNOWN';
assert.deepEqual(compileIbalCanary(unknownProvider).blockers, ['PROVIDER_LESSON_UNKNOWN']);

for (const [name, mutate] of [
  ['missing registry', x => delete x.provider_registry],
  ['duplicate registry ID', x => x.provider_registry.required_provider_ids.push('CHATGPT')],
  ['empty registry', x => x.provider_registry.required_provider_ids = []],
  ['missing registry generation', x => delete x.provider_registry.generation],
  ['missing registry ref', x => delete x.provider_registry.ref],
  ['undeclared provider', x => x.provider_lessons[0].provider = 'EXTERNAL_NEW'],
  ['duplicate provider', x => x.provider_lessons[5].provider = 'CHATGPT'],
  ['effect escalation', x => x.bridge.effect_ceiling = 'WRITE'],
  ['email authority', x => x.email.provider_write_authorized = true],
  ['recursion overflow', x => x.lesson_fractal.recursion_depth = 9],
  ['blast overflow', x => x.exit_loop.blast_counter = 22],
  ['unbounded timeout', x => x.exit_loop.timeout_ms = 86_400_001],
]) {
  const hostile = structuredClone(fixture);
  mutate(hostile);
  assert.throws(() => compileIbalCanary(hostile), undefined, name);
}

const missing = structuredClone(readyInput);
missing.provider_lessons.pop();
const incomplete = compileIbalCanary(missing);
assert.equal(incomplete.readiness, 'WAIT');
assert.deepEqual(incomplete.blockers, ['PROVIDER_LESSON_MISSING']);
assert.equal(incomplete.provider_denominator, 6);
assert.equal(incomplete.provider_coverage.observed_count, 5);
assert.deepEqual(incomplete.provider_coverage.missing_provider_ids, ['OLLAMA']);

const expanded = structuredClone(readyInput);
expanded.provider_registry.generation = 'synthetic:g2';
expanded.provider_registry.required_provider_ids.push('external-new:stable');
expanded.provider_lessons.push({ provider: 'external-new:stable', lesson_ref: 'lesson:new', adapter_ref: 'adapter:new', state: 'CURRENT' });
const expandedResult = compileIbalCanary(expanded);
assert.equal(expandedResult.provider_denominator, 7);
assert.equal(expandedResult.provider_coverage.registry.generation, 'synthetic:g2');
assert.equal(expandedResult.readiness, 'READY_FOR_SWITCHBOARD_PREFLIGHT');
assert.equal(expandedResult.authority_granted, false);

const one = structuredClone(readyInput);
one.provider_registry.required_provider_ids = ['unlisted-provider'];
one.provider_lessons = [{ provider: 'unlisted-provider', lesson_ref: 'lesson:one', adapter_ref: 'adapter:one', state: 'CURRENT' }];
assert.equal(compileIbalCanary(one).provider_denominator, 1);

const legacy = structuredClone(readyInput);
legacy.schema = 'xiio.sdk.ibal-canary/v1';
delete legacy.provider_registry;
const legacyResult = compileIbalCanary(legacy);
assert.equal(legacyResult.provider_denominator, null);
assert.equal(legacyResult.readiness, 'WAIT');
assert.deepEqual(legacyResult.blockers, ['PROVIDER_REGISTRY_UNBOUND']);

// Caller declarations do not mint registry authentication or effect authority.
expanded.provider_registry.authenticated_registry_proof = true;
expanded.provider_registry.provider_effect = true;
const declaredTrust = compileIbalCanary(expanded);
assert.equal(declaredTrust.provider_coverage.authenticated_registry_proof, false);
assert.equal(declaredTrust.authority_granted, false);
assert.equal(declaredTrust.provider_coverage.registry.provider_effect, undefined);

const exhausted = structuredClone(fixture);
exhausted.email.access_state = 'QUALIFIED';
exhausted.exit_loop.blast_counter = exhausted.exit_loop.max_blasts;
assert.deepEqual(compileIbalCanary(exhausted).blockers, ['BLAST_COUNTER_EXHAUSTED']);

let learningCases = 0;
function learningCase(verify) { verify(); learningCases++; }
learningCase(() => {
  const learning = ready.lesson_fractal.learning;
  assert.equal(learning.stage_denominator, 6);
  assert.equal(learning.supplied_stages, 6);
  assert.equal(learning.verified_stages, 0);
  assert.equal(learning.state, 'WAIT_VERIFICATION');
  assert.equal(learning.closed, false);
});
for (const [field, stage] of [
  ['peer_replay', 'INDEPENDENT_PEER_REPLAY'],
  ['bins_receipt', 'BINS_PERSISTENCE'],
  ['affected_return', 'AFFECTED_RETURN'],
  ['cadence_wake', 'NEXT_CADENCE_WAKE'],
  ['author_worker_ref', 'INDEPENDENT_PEER_REPLAY'],
]) learningCase(() => {
  const incomplete = structuredClone(readyInput);
  delete incomplete.lesson_fractal.learning[field];
  const result = compileIbalCanary(incomplete);
  assert.equal(result.readiness, 'WAIT');
  assert(result.blockers.includes(`LEARNING_${stage}_UNKNOWN`));
  assert.equal(result.lesson_fractal.learning.state, 'WAIT_EVIDENCE');
  assert.equal(result.lesson_fractal.learning.closed, false);
});
learningCase(() => {
  const input = structuredClone(readyInput);
  delete input.lesson_fractal.learning.generation;
  assert.equal(compileIbalCanary(input).lesson_fractal.learning.supplied_stages, 0);
});
learningCase(() => {
  const input = structuredClone(legacy);
  delete input.lesson_fractal.learning;
  const result = compileIbalCanary(input);
  assert.equal(result.readiness, 'WAIT');
  assert.equal(result.lesson_fractal.learning.missing_stages.length, 6);
});
learningCase(() => {
  const input = structuredClone(readyInput);
  Object.assign(input.lesson_fractal.learning, { closed: true, verified_stages: 6 });
  Object.assign(input.lesson_fractal.learning.peer_replay, { status: 'PASS', verified: true });
  const result = compileIbalCanary(input);
  assert.equal(result.lesson_fractal.learning.closed, false);
  assert.equal(result.lesson_fractal.learning.verified_stages, 0);
  assert.equal(result.lesson_fractal.learning.state, 'WAIT_VERIFICATION');
  assert(!JSON.stringify(result.lesson_fractal.learning).includes('PASS'));
});
for (const mutate of [
  x => x.peer_replay.worker_ref = x.author_worker_ref,
  x => x.peer_replay.worker_ref = `${x.author_worker_ref} `,
  x => x.peer_replay.generation = 'stale',
  x => x.bins_receipt.generation = 'stale',
  x => x.affected_return.generation = 'stale',
  x => x.cadence_wake.generation = 'stale',
  x => x.affected_return.target_ref = 'wrong:return',
  x => x.cadence_wake.next_action_ref = 'wrong:action',
]) learningCase(() => {
  const input = structuredClone(readyInput);
  mutate(input.lesson_fractal.learning);
  assert.throws(() => compileIbalCanary(input));
});

console.log(JSON.stringify({
  status: 'PASS',
  provider_denominator: 6,
  positive_cases: 4,
  hostile_cases: 17,
  learning_cases: learningCases,
  email_authority_granted: false,
  effect_authority_granted: false,
  recursive_exit_loop_bounded: true
}));
