#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/billing/product-operation-admission-binding.mjs', 'utf8');
for (const invariant of [
  'ADMIN_ROLE!=ACCESS_GRANT',
  'SUPERADMIN_ROLE!=ACCESS_GRANT',
  'BILLING_ADMISSION!=PROVIDER_ATTEMPT',
  'BILLING_ADMISSION!=MONEY',
  'METER_EVENT!=MONEY',
  'BILLING_ADMISSION!=EFFECT_AUTHORITY',
]) assert.match(source, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(source, /billing_commit_allowed:\s*true/);
assert.doesNotMatch(source, /effect_authority:\s*true/);
console.log('product-operation-admission-no-authority: pass');
