#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileIbalCanary } from '../src/ibal/canary.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ibal/switchboard-glass-box-canary.synthetic.json', import.meta.url), 'utf8'));
const baseline = compileIbalCanary(fixture);
assert.equal(baseline.provider_denominator, 6);
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
  ['missing provider', x => x.provider_lessons.pop()],
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

const exhausted = structuredClone(fixture);
exhausted.email.access_state = 'QUALIFIED';
exhausted.exit_loop.blast_counter = exhausted.exit_loop.max_blasts;
assert.deepEqual(compileIbalCanary(exhausted).blockers, ['BLAST_COUNTER_EXHAUSTED']);

console.log(JSON.stringify({
  status: 'PASS',
  provider_denominator: 6,
  positive_cases: 4,
  hostile_cases: 8,
  email_authority_granted: false,
  effect_authority_granted: false,
  recursive_exit_loop_bounded: true
}));
