#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(here, '../src/evaluation/closure-anti-laundering-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

assert.equal(catalog.schema, 'xiio.sdk.closure-anti-laundering-catalog/v1');
assert.equal(catalog.semantics, 'READ_ONLY_HVT_CATALOG');
assert.equal(catalog.effects, 0);
assert.equal(catalog.authority_granted, false);
assert.ok(Array.isArray(catalog.families));
assert.ok(catalog.families.length >= 15);

const ids = new Set();
for (const family of catalog.families) {
  assert.equal(typeof family.id, 'string');
  assert.ok(family.id.trim());
  assert.equal(ids.has(family.id), false, `duplicate family id: ${family.id}`);
  ids.add(family.id);
  assert.equal(typeof family.hard, 'string');
  assert.ok(family.hard.includes('!='), `hard invariant must be a non-equivalence: ${family.id}`);
  assert.ok(Array.isArray(family.owners) && family.owners.length >= 1, `owners required: ${family.id}`);
  assert.equal(new Set(family.owners).size, family.owners.length, `duplicate owner: ${family.id}`);
  assert.ok(Array.isArray(family.hybrids), `hybrids required: ${family.id}`);
  assert.equal(family.hybrids.length, 3, `exactly three hybrid falsifiers required: ${family.id}`);
  assert.equal(new Set(family.hybrids).size, family.hybrids.length, `duplicate hybrid: ${family.id}`);
  for (const hybrid of family.hybrids) {
    assert.equal(typeof hybrid, 'string');
    assert.ok(hybrid.includes('=>'), `hybrid must encode condition=>disposition: ${family.id}`);
  }
}

for (const required of [
  'ROOT_CONSERVATION',
  'SOURCE_TO_READBACK',
  'ACCOUNTING_VS_CLOSURE',
  'HOST_ATTESTATION',
  'SELF_ASSERTION',
  'INTERFACE_IMPLEMENTATION',
  'EFFECT_AUTHORITY',
  'RETURN_CONTINUITY'
]) {
  assert.ok(ids.has(required), `missing required family: ${required}`);
}

console.log(JSON.stringify({
  schema: 'xiio.sdk.closure-anti-laundering-catalog-check/v1',
  result: 'PASS',
  families: catalog.families.length,
  hybrid_falsifiers: catalog.families.reduce((sum, family) => sum + family.hybrids.length, 0),
  effects: 0,
  authority_granted: false
}, null, 2));
