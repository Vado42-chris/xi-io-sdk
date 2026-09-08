#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAffectedPrimitiveConsumers, derivePrimitiveAdoptionPlan } from '../src/adoption/primitive-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/catalog/primitives.json'), 'utf8'));

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
  consumers: [
    {
      consumer_id: 'child-a',
      consumer_ref: 'repo:child-a',
      recipe_generation: 'g1',
      required_primitive_ids: ['panel', 'progressive-route-card'],
      observed_primitive_ids: ['panel'],
    },
    {
      consumer_id: 'child-b',
      consumer_ref: 'repo:child-b',
      recipe_generation: 'g1',
      required_primitive_ids: ['panel'],
      observed_primitive_ids: ['panel'],
    },
    {
      consumer_id: 'child-c',
      consumer_ref: 'repo:child-c',
      recipe_generation: 'g1',
      required_primitive_ids: ['progressive-route-card'],
      observed_primitive_ids: [],
    },
  ],
});
assert.equal(impact.denominator, 3);
assert.deepEqual(impact.affected.map((x) => x.consumer_id), ['child-a', 'child-c']);
assert.deepEqual(impact.no_effect.map((x) => x.consumer_id), ['child-b']);
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

console.log('XIIO_SDK_PRIMITIVE_ADOPTION PASS denominator=3 affected=2 no_effect=1 unknown=0 withheld=progressive-route-card');
