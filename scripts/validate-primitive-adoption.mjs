#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAffectedPrimitiveConsumers, derivePrimitiveAdoptionPlan } from '../src/adoption/primitive-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/catalog/primitives.json'), 'utf8'));
const recipeBaseline = {
  source_ref: 'fixture:recipe-source',
  source_head: 'a'.repeat(40),
  recipe_generation: 'fixture:g2',
};
const lineage = {
  recipe_source_ref: recipeBaseline.source_ref,
  recipe_source_head: recipeBaseline.source_head,
  recipe_generation: recipeBaseline.recipe_generation,
};

const one = derivePrimitiveAdoptionPlan({
  catalog,
  requiredPrimitiveIds: ['panel', 'progressive-route-card'],
  observedPrimitiveIds: ['panel'],
});
assert.equal(one.state, 'MISSING_REQUIRED');
assert.deepEqual(one.missing.map((x) => x.id), ['progressive-route-card']);
assert.equal(one.missing[0].specifier, '@xi-io/sdk/patterns/progressive-route');
assert.deepEqual(one.missing[0].styles, ['@xi-io/sdk/styles/core.css', '@xi-io/sdk/styles/progressive-disclosure.css']);

// Controlled omission canary: skip one primitive on purpose and require all-and-only affected consumers.
const impact = deriveAffectedPrimitiveConsumers({
  catalog,
  recipeBaseline,
  expectedConsumerIds: ['child-a', 'child-b', 'child-c'],
  consumerRosterRef: 'fixture:consumer-roster',
  consumerRosterGeneration: 'fixture:roster-g2',
  consumers: [
    {
      ...lineage,
      consumer_id: 'child-a',
      consumer_ref: 'repo:child-a',
      required_primitive_ids: ['panel', 'progressive-route-card'],
      observed_primitive_ids: ['panel'],
    },
    {
      ...lineage,
      consumer_id: 'child-b',
      consumer_ref: 'repo:child-b',
      required_primitive_ids: ['panel'],
      observed_primitive_ids: ['panel'],
    },
    {
      ...lineage,
      consumer_id: 'child-c',
      consumer_ref: 'repo:child-c',
      required_primitive_ids: ['progressive-route-card'],
      observed_primitive_ids: [],
    },
  ],
});
assert.equal(impact.denominator, 3);
assert.deepEqual(impact.affected.map((x) => x.consumer_id), ['child-a', 'child-c']);
assert.deepEqual(impact.no_effect, []);
assert.deepEqual(impact.unverified.map((x) => x.consumer_id), ['child-b']);
assert.equal(impact.unknown.length, 0);
for (const row of impact.affected) {
  assert.deepEqual(row.plan.missing.map((x) => x.id), ['progressive-route-card']);
}

const unknown = derivePrimitiveAdoptionPlan({
  catalog,
  requiredPrimitiveIds: ['primitive-that-does-not-exist'],
  observedPrimitiveIds: [],
});
assert.equal(unknown.state, 'UNKNOWN_REQUIRED');
assert.deepEqual(unknown.unknown, ['primitive-that-does-not-exist']);

// Original failures: matching names ignored stale/unknown generation, and an
// empty required set was CURRENT. These must never become currentness proof.
const declared = { catalog, requiredPrimitiveIds: ['panel'], observedPrimitiveIds: ['panel'] };
const empty = derivePrimitiveAdoptionPlan({ ...declared, requiredPrimitiveIds: [], observedPrimitiveIds: [] });
assert.equal(empty.state, 'UNKNOWN_REQUIRED');
assert.equal(empty.supplied_coverage_complete, false);
assert.equal(derivePrimitiveAdoptionPlan(declared).state, 'UNKNOWN_LINEAGE');
const supplied = derivePrimitiveAdoptionPlan({ ...declared, recipeBaseline, observedRecipe: recipeBaseline });
assert.equal(supplied.state, 'PRESENT_UNVERIFIED');
assert.equal(supplied.lineage.state, 'MATCH_SUPPLIED');
assert.equal(supplied.supplied_coverage_complete, true);
for (const field of ['source_ref', 'source_head', 'recipe_generation']) {
  const observedRecipe = { ...recipeBaseline, [field]: field === 'source_head' ? 'b'.repeat(40) : 'fixture:older' };
  const stale = derivePrimitiveAdoptionPlan({ ...declared, recipeBaseline, observedRecipe });
  assert.equal(stale.state, 'STALE_RECIPE');
  assert.deepEqual(stale.lineage.mismatches, [field]);
  const unbound = derivePrimitiveAdoptionPlan({ ...declared, recipeBaseline, observedRecipe: { ...recipeBaseline, [field]: '' } });
  assert.equal(unbound.state, 'UNKNOWN_LINEAGE');
}
for (const badHead of ['not-a-sha', 'a'.repeat(39), 'g'.repeat(40), null, {}]) {
  assert.equal(derivePrimitiveAdoptionPlan({ ...declared, recipeBaseline,
    observedRecipe: { ...recipeBaseline, source_head: badHead } }).state, 'UNKNOWN_LINEAGE');
}
assert.equal(derivePrimitiveAdoptionPlan({ ...declared, recipeBaseline,
  observedRecipe: { ...recipeBaseline, recipe_generation: 'UNKNOWN' } }).state, 'UNKNOWN_LINEAGE');

const child = { ...lineage, consumer_id: 'child-a', required_primitive_ids: ['panel'], observed_primitive_ids: ['panel'] };
const scope = { catalog, recipeBaseline, expectedConsumerIds: ['child-a', 'child-b', 'child-c'],
  consumerRosterRef: 'fixture:consumer-roster', consumerRosterGeneration: 'fixture:roster-g2', consumers: [child] };
const omitted = deriveAffectedPrimitiveConsumers(scope);
assert.equal(omitted.denominator, 3);
assert.equal(omitted.observed_count, 1);
assert.deepEqual(omitted.missing_consumers, ['child-b', 'child-c']);
assert.deepEqual(omitted.unknown.map((row) => row.reason), ['MISSING_CONSUMER', 'MISSING_CONSUMER']);
assert.equal(omitted.supplied_denominator_coverage_complete, false);
const undeclared = deriveAffectedPrimitiveConsumers({ ...scope, consumers: [{ ...child, consumer_id: 'undeclared' }] });
assert.equal(undeclared.denominator, 4);
assert.deepEqual(undeclared.undeclared_consumers, ['undeclared']);
assert.equal(undeclared.rows[0].state, 'UNKNOWN');
const noRoster = deriveAffectedPrimitiveConsumers({ catalog, recipeBaseline, consumers: [child] });
assert.equal(noRoster.denominator_state, 'UNBOUND');
assert.equal(noRoster.rows[0].state, 'UNKNOWN');
assert.equal(noRoster.expected_count, null);
const noConsumers = deriveAffectedPrimitiveConsumers({ catalog, consumers: [] });
assert.equal(noConsumers.denominator_state, 'UNBOUND');
assert.equal(noConsumers.supplied_denominator_coverage_complete, false);
const declaredEmpty = deriveAffectedPrimitiveConsumers({ ...scope, expectedConsumerIds: [], consumers: [] });
assert.equal(declaredEmpty.denominator_state, 'UNBOUND');
assert.equal(declaredEmpty.supplied_denominator_coverage_complete, false);
const missingRosterRef = deriveAffectedPrimitiveConsumers({ ...scope, consumerRosterRef: '' });
assert.equal(missingRosterRef.denominator_state, 'UNBOUND');
const staleConsumer = deriveAffectedPrimitiveConsumers({ ...scope,
  consumers: [{ ...child, recipe_generation: 'fixture:g1' }] });
assert.equal(staleConsumer.rows[0].state, 'AFFECTED');
assert.equal(staleConsumer.rows[0].plan.state, 'STALE_RECIPE');
const unknownConsumer = deriveAffectedPrimitiveConsumers({ ...scope,
  consumers: [{ ...child, recipe_generation: 'UNKNOWN' }] });
assert.equal(unknownConsumer.rows[0].state, 'UNKNOWN');
assert.equal(unknownConsumer.no_effect.length, 0);

for (const invalid of [[null], [42], [{}], [''], ['panel', 'panel'], [' panel', 'panel']]) {
  assert.throws(() => derivePrimitiveAdoptionPlan({ ...declared, requiredPrimitiveIds: invalid }), TypeError);
}
assert.throws(() => deriveAffectedPrimitiveConsumers({ ...scope, consumers: [child, child] }), TypeError);
assert.throws(() => deriveAffectedPrimitiveConsumers({ ...scope, expectedConsumerIds: ['child-a', 'child-a'] }), TypeError);

// Pure comparison cannot authenticate even perfectly matched caller claims.
const claimed = deriveAffectedPrimitiveConsumers({ ...scope, consumers: [child], expectedConsumerIds: ['child-a'],
  source_currentness: 'CURRENT', authenticated: true, closure_100: true, verified_count: 100 });
assert.equal(claimed.supplied_denominator_coverage_complete, true);
for (const result of [impact, omitted, undeclared, noRoster, noConsumers, declaredEmpty, staleConsumer, unknownConsumer, claimed]) {
  assert.deepEqual(result.no_effect, []);
  assert.equal(result.verified_count, 0);
  assert.equal(result.closure_100, false);
  assert.equal(result.live_claim, false);
  assert.equal(result.roster_currentness, 'UNVERIFIED');
  for (const row of result.rows) {
    if (!row.plan) continue;
    assert.notEqual(row.plan.state, 'CURRENT');
    assert.equal(row.plan.verified_count, 0);
    assert.equal(row.plan.closure_100, false);
    assert.equal(row.plan.lineage.source_currentness, 'UNVERIFIED');
  }
}
console.log('XIIO_SDK_PRIMITIVE_ADOPTION PASS source-contract-only denominator=3 affected=2 unverified=1 no_effect=0; stale-lineage, omitted-consumer and caller-promotion controls passed; live=false closure_100=false');
