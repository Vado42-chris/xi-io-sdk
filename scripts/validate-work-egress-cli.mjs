#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('../fixtures/cadence/surface-egress-ten.synthetic.json', import.meta.url));

const run = spawnSync(process.execPath, [binary, 'work', 'egress', '--input', fixture], {
  encoding: 'utf8',
  timeout: 10_000,
  maxBuffer: 2_097_152,
});
assert.equal(run.error, undefined);
assert.equal(run.status, 0, run.stderr);
assert.equal(run.stderr, '');
const value = JSON.parse(run.stdout);
assert.equal(value.schema, 'xiio.sdk.work-egress-projection/v2');
assert.equal(value.projections.length, 10);
assert.equal(value.disposition, 'EGRESS_READBACK_CURRENT');
assert.equal(value.canonical_work_preserved, true);
assert.equal(value.root_stop, false);
assert.equal(value.provider_effect_authority, false);
assert.equal(value.registry_authority, false);

const missing = spawnSync(process.execPath, [binary, 'work', 'egress'], {
  encoding: 'utf8',
  timeout: 10_000,
  maxBuffer: 2_097_152,
});
assert.equal(missing.error, undefined);
assert.equal(missing.status, 2);
assert.match(missing.stderr, /invalid input or unsupported command/);

console.log(JSON.stringify({
  schema: 'xiio.sdk.work-egress-cli-hostile/v1',
  result: 'PASS',
  command: 'xi work egress',
  provider_families: value.projections.length,
  provider_effects: 0,
  root_stop: false
}));
