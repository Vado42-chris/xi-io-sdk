import assert from 'node:assert/strict';
import { compileHexWardYang } from '../src/evaluation/hex-ward-yang.mjs';

const receipt = compileHexWardYang({
  subject_ref: 'fixture:hex-ward-yang:001',
  source_generation: 'fixture:ward-profile:g1',
});

assert.equal(receipt.schema, 'xiio.sdk.hex-ward-yang/v1');
assert.equal(receipt.profile, 'WARD_E0_E9');
assert.equal(receipt.clean_control.release_eligible, true);
assert.equal(receipt.no_effect_control.release_eligible, true);
assert.equal(receipt.no_effect_control.e5_state, 'N_A_WITH_REASON');
assert.equal(receipt.hostile_denominator, 10);
assert.equal(receipt.hostile_blocked, 10);
assert.equal(receipt.provider_effects, 0);
assert.equal(receipt.authority_granted, false);

for (const row of receipt.hostiles) {
  assert.equal(row.blocked, true, `${row.case_id} must block at ${row.injected_cell}`);
  assert.equal(row.first_red?.cell, row.injected_cell, `${row.case_id} first red drifted`);
  assert.equal(row.authority_granted, false);
  assert.equal(row.provider_effect, false);
}

const required = new Set([
  'HEX-WARD-E0-STALE-ADAPTER',
  'HEX-WARD-E1-SCOPE-MISMATCH',
  'HEX-WARD-E2-STALE-GUARD',
  'HEX-WARD-E3-UNKNOWN-AFFECTED',
  'HEX-WARD-E4-DISCLOSURE-UNION',
  'HEX-WARD-E5-NO-ADMISSION',
  'HEX-WARD-E6-PRIOR-EFFECT-UNKNOWN',
  'HEX-WARD-E7-EARLY-ATTEMPT',
  'HEX-WARD-E8-RESULT-NO-READBACK',
  'HEX-WARD-E9-STRANDED-RESULT',
]);
assert.deepEqual(new Set(receipt.hostiles.map((row) => row.case_id)), required);

console.log(JSON.stringify({
  mode: 'HEX_WARD_YANG',
  ward_profile: receipt.profile,
  clean_controls: 2,
  hostiles: receipt.hostile_denominator,
  blocked: receipt.hostile_blocked,
  effects: 0,
  authority: 0,
  result: 'PASS',
}));
