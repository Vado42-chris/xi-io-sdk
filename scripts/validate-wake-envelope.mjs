#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeWakeEnvelope, evaluateWakeProgress } from '../src/wakes/envelope.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/wakes/inbox-adoption.synthetic.json', import.meta.url), 'utf8'));
const wake = normalizeWakeEnvelope(fixture);
assert.equal(wake.effect_ceiling, 'NO_EFFECT');
assert.equal(wake.authority, 'PROPOSAL_ONLY');

const intendedOnly = evaluateWakeProgress(wake, {});
assert.equal(intendedOnly.terminal, 'OPEN');
assert.equal(intendedOnly.delivered, false);
assert.equal(intendedOnly.false_green, false);

const falseReturned = evaluateWakeProgress(wake, { returned: true });
assert.equal(falseReturned.returned, false);
assert.equal(falseReturned.consumed, false);
assert.equal(falseReturned.false_green, true);

const complete = evaluateWakeProgress(wake, {
  delivered: true,
  acked: true,
  started: true,
  returned: true,
  consumed: true,
  applied: true,
});
assert.equal(complete.terminal, 'APPLIED');
assert.equal(complete.applied, true);
assert.equal(complete.false_green, false);

const missingAck = evaluateWakeProgress(wake, {
  delivered: true,
  started: true,
  returned: true,
  consumed: true,
  applied: true,
});
assert.equal(missingAck.started, false);
assert.equal(missingAck.applied, false);
assert.equal(missingAck.false_green, true);

const mutable = structuredClone(fixture);
const normalized = normalizeWakeEnvelope(mutable);
mutable.target.product_id = 'tampered';
assert.equal(normalized.target.product_id, 'xi-io-inbox');

for (const [name, mutate] of [
  ['blank generation', x => { x.generation = '   '; }],
  ['effect authority', x => { x.effect_ceiling = 'WRITE'; }],
  ['execution authority', x => { x.authority = 'AUTHORIZED'; }],
  ['unknown state', x => { x.state = 'DONE'; }],
  ['private payload', x => { x.secret = 'forbidden'; }],
]) {
  const hostile = structuredClone(fixture);
  mutate(hostile);
  assert.throws(() => normalizeWakeEnvelope(hostile), undefined, name);
}

console.log(JSON.stringify({
  status: 'PASS',
  positive_cases: 3,
  hostile_cases: 7,
  command_distribution_false_green: 0,
  effect_authority: false,
  adoption_state_separated: true,
}));
