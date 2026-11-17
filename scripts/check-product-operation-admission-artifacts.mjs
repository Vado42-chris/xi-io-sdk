#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of [
  'src/billing/product-operation-admission-binding.mjs',
  'test/product-operation-admission-binding.test.mjs',
  'scripts/validate-product-operation-admission-binding.mjs',
  'docs/product-operation-admission-binding.md',
  'projects/evidence/product-operation-admission-binding-20261117.json',
]) {
  assert.equal(fs.existsSync(file), true, file);
}
const evidence = JSON.parse(fs.readFileSync('projects/evidence/product-operation-admission-binding-20261117.json', 'utf8'));
assert.equal(evidence.local_execution.pass, 6);
assert.equal(evidence.installed_acceptance_claimed, false);
assert.equal(evidence.provider_effect_claimed, false);
console.log('product-operation-admission-artifacts: pass');
