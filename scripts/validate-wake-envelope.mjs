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
assert.equal(complete.terminal, 'OPEN');
assert.equal(complete.applied, false);
assert.equal(complete.delivered, false);
assert.equal(complete.acked, false);
assert.equal(complete.supplied_coverage.coverage_complete, true);
assert.equal(complete.supplied_coverage.terminal_claim, 'APPLIED');
assert.equal(complete.supplied_coverage.ordered_count, 6);
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
assert.equal(missingAck.supplied_coverage.ordered_count, 1);
assert.equal(missingAck.supplied_coverage.coverage_complete, false);

const exemption = evaluateWakeProgress(wake, { not_applicable: true });
assert.equal(exemption.terminal, 'OPEN');
assert.equal(exemption.not_applicable, false);
assert.equal(exemption.supplied_coverage.terminal_claim, 'NOT_APPLICABLE');
assert.equal(exemption.supplied_coverage.coverage_complete, false);
const appliedWithoutChain = evaluateWakeProgress(wake, { applied: true });
assert.equal(appliedWithoutChain.false_green, true);
assert.equal(appliedWithoutChain.applied, false);
const contradiction = evaluateWakeProgress(wake, { delivered: true, not_applicable: true });
assert.equal(contradiction.false_green, true);
assert.equal(contradiction.terminal, 'OPEN');

const keys = ['delivered','acked','started','returned','consumed','applied','not_applicable'];
// Exhaust every boolean combination. No declaration can cross the absent
// delivery/ACK/application verifier, including all-true and exemption shortcuts.
for (let bits=0; bits<2**keys.length; bits++) {
  const declarations = Object.fromEntries(keys.map((key,index)=>[key,Boolean(bits & (1 << index))]));
  const result = evaluateWakeProgress(wake, declarations);
  for (const key of keys) assert.equal(result[key],false,`${bits}:${key}`);
  assert.equal(result.terminal,'OPEN');
  assert.equal(result.evidence_state,'SUPPLIED_UNVERIFIED');
  assert.equal(result.verified,false);
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
  assert.deepEqual(result.supplied_coverage.declared,declarations);
  assert.equal(result.supplied_coverage.denominator,6);
}

for (const invalid of [null, [], true, 'complete', 1]) {
  assert.throws(()=>evaluateWakeProgress(wake,invalid),TypeError);
}
for (const invalid of ['true', 1, {}, [], null]) {
  const result = evaluateWakeProgress(wake,{delivered:invalid});
  assert.equal(result.delivered,false);
  assert.equal(result.supplied_coverage.declared.delivered,false);
  assert.deepEqual(result.supplied_coverage.invalid_fields,['delivered']);
}
const inherited = evaluateWakeProgress(wake,Object.create({delivered:true,acked:true}));
assert.equal(inherited.supplied_coverage.declared_count,0);
const callerFlags = evaluateWakeProgress(wake,{...complete.supplied_coverage.declared,
  verified:true, authenticated:true, authority_granted:true, provider_effect:true,
  proof_ref:'arbitrary-caller-proof', terminal:'APPLIED'});
assert.equal(callerFlags.terminal,'OPEN');
assert.equal(callerFlags.verified,false);
assert.equal(callerFlags.authority_granted,false);
assert.equal(callerFlags.provider_effect,false);
assert.equal(evaluateWakeProgress({...fixture,state:'CONSUMED'},{}).terminal,'OPEN');
assert.deepEqual(evaluateWakeProgress(wake,{}),intendedOnly);

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
  boolean_combinations: 128,
  supplied_progress_separated: true,
  terminal_false_promotion: 0,
  command_distribution_false_green: 0,
  effect_authority: false,
  adoption_state_separated: true,
  authenticated_delivery_or_application_claimed: false,
}));
