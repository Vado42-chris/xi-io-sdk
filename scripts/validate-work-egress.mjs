#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compileWorkEgressProjection } from '../src/work/egress.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(resolve(root, 'fixtures/cadence/surface-egress-ten.synthetic.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const cases = [];
function test(name, fn) { fn(); cases.push(name); process.stdout.write(`PASS ${name}\n`); }

test('01 TEN provider families share one egress compiler', () => {
  const out = compileWorkEgressProjection(clone(fixture));
  assert.equal(out.projections.length, 10);
  assert.equal(out.disposition, 'EGRESS_READBACK_CURRENT');
  assert.equal(out.root_stop, false);
});

test('02 WordPress high-cardinality registry does not mint authority', () => {
  const out = compileWorkEgressProjection(clone(fixture));
  const wp = out.projections.find(x => x.provider_family === 'WORDPRESS');
  assert.equal(wp.registry_size_observed, 5000);
  assert.equal(out.registry_authority, false);
  assert.equal(out.provider_effect_authority, false);
});

test('03 WordPress is not a special projection kind', () => {
  const out = compileWorkEgressProjection(clone(fixture));
  const wp = out.projections.find(x => x.provider_family === 'WORDPRESS');
  assert.equal(wp.kind, 'CMS_OBJECT');
  assert.ok(out.hard.includes('WORDPRESS != SPECIAL_EGRESS_PLANE'));
});

test('04 arbitrary typed plugin surface kind is admitted', () => {
  const input = clone(fixture);
  input.projections = [{...input.projections[0], projection_ref:'egress:future', kind:'FUTURE_PROVIDER_OBJECT', provider_family:'FUTURE_PROVIDER'}];
  assert.equal(compileWorkEgressProjection(input).projections[0].kind, 'FUTURE_PROVIDER_OBJECT');
});

test('05 missing registry generation fails closed', () => {
  const input = clone(fixture); input.projections[0].registry_generation = '';
  assert.throws(() => compileWorkEgressProjection(input), /REGISTRY_GENERATION_REQUIRED/);
});

test('06 duplicate projection identity fails closed', () => {
  const input = clone(fixture); input.projections[1].projection_ref = input.projections[0].projection_ref;
  assert.throws(() => compileWorkEgressProjection(input), /PROJECTION_REF_DUPLICATE/);
});

test('07 readback requires provider-native readback reference', () => {
  const input = clone(fixture); input.projections[0].provider_readback_ref = '';
  assert.throws(() => compileWorkEgressProjection(input), /PROVIDER_READBACK_REF_REQUIRED/);
});

test('08 blocked WordPress egress preserves canonical Work and root', () => {
  const input = clone(fixture);
  input.projections = [{...input.projections[0], status:'BLOCKED_TOOL_OR_PROVIDER', provider_readback_ref:null, wake:'WORDPRESS_ADAPTER_AVAILABLE'}];
  const out = compileWorkEgressProjection(input);
  assert.equal(out.disposition, 'DEGRADED_EGRESS_CONTINUE_INTERNAL');
  assert.equal(out.canonical_work_preserved, true);
  assert.equal(out.root_stop, false);
});

test('09 blocked egress requires exact wake', () => {
  const input = clone(fixture);
  input.projections = [{...input.projections[0], status:'DEGRADED', provider_readback_ref:null, wake:''}];
  assert.throws(() => compileWorkEgressProjection(input), /PROJECTION_WAKE_REQUIRED/);
});

test('10 terminal Work cannot promote provider projection into root stop', () => {
  const input = clone(fixture); input.work_state = 'COMPLETED';
  const out = compileWorkEgressProjection(input);
  assert.equal(out.projection_eligible, false);
  assert.equal(out.root_stop, false);
  assert.equal(out.disposition, 'NO_OP_TERMINAL_WORK');
});

assert.equal(cases.length, 10);
console.log(JSON.stringify({schema:'xiio.sdk.surface-egress-ten-hvt/v1',result:'PASS',cases:cases.length,false_greens:0,wordpress:'SHARED_HIGH_CARDINALITY_EGRESS'}, null, 2));
