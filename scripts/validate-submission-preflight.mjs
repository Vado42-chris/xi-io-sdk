#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileSubmissionPreflight } from '../src/evaluation/submission-preflight.mjs';

const ack = (state = 'YES') => ({
  schema_version: 'xiio.resource-capability-ack/v1',
  request_id: 'req:local-ack-1',
  worker_ref: 'worker:ibal-bins',
  resource_ref: 'resource:studio-monday',
  operation: 'resource.read',
  lease_ref: 'lease:studio-monday',
  source_generation: 'generation:studio-monday',
  required_capability: 'resource.read',
  ack: state,
  reason: state === 'YES' ? 'EXACT_CURRENT_SCOPE_ACKNOWLEDGED' : 'CAPABILITY_NOT_GRANTED',
  attempt_count: 0,
  attempt_authorized: false,
  effect_authority: false,
  provider_effect: false,
  next: state === 'YES' ? 'SWITCHBOARD_ADMISSION_REQUIRED' : 'REPAIR_OR_REBIND_BEFORE_ATTEMPT',
});

function base(overrides = {}) {
  return {
    mission_root_ref: 'root:studio-monday',
    generation: 'generation:studio-monday',
    wake_ref: 'wake:studio-monday-preflight',
    detonator_ref: 'detonator:studio-monday',
    target_ref: 'target:provider-submit',
    pricing_ref: 'pricing:studio-meter-v1',
    meter_ref: 'meter:studio-monday-pass',
    local_ack: ack('YES'),
    provider_preflight: {
      billing_state: 'HEALTHY',
      currentness: 'CURRENT',
      readback_ref: 'readback:provider-current',
      admission_ref: 'admission:provider-job',
    },
    ...overrides,
  };
}

{
  const out = compileSubmissionPreflight(base());
  assert.equal(out.state, 'READY_FOR_PROVIDER_SUBMISSION');
  assert.equal(out.provider.submission_eligible, true);
  assert.equal(out.meter.provider_attempt_units, 1);
  assert.equal(out.hotfolder.semantics, 'WAKE_ONLY');
  assert.equal(out.effects, 0);
}

for (const billing_state of ['PAYMENT_FAILED', 'SPENDING_LIMIT', 'UNKNOWN']) {
  const out = compileSubmissionPreflight(base({
    meter_ref: `meter:${billing_state.toLowerCase()}`,
    provider_preflight: {
      billing_state,
      currentness: 'CURRENT',
      readback_ref: 'readback:provider-current',
      admission_ref: 'admission:provider-job',
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_BILLING_BLOCKED');
  assert.equal(out.provider.submission_eligible, false);
  assert.equal(out.meter.provider_attempt_units, 0);
  assert.equal(out.meter.prevented_provider_attempt_units, 1);
  assert.equal(out.hotfolder.route, 'LOCAL_ACK_SIM_ONLY');
}

{
  const out = compileSubmissionPreflight(base({ local_ack: ack('NO') }));
  assert.equal(out.state, 'BLOCKED_LOCAL_ACK');
  assert.equal(out.provider.submission_eligible, false);
  assert.equal(out.meter.local_sim_units, 0);
  assert.equal(out.meter.provider_attempt_units, 0);
}

{
  const out = compileSubmissionPreflight(base({
    provider_preflight: {
      billing_state: 'HEALTHY',
      currentness: 'UNKNOWN',
      readback_ref: null,
      admission_ref: 'admission:provider-job',
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_CURRENTNESS_WAIT');
  assert.equal(out.provider.submission_eligible, false);
}

{
  const bad = ack('YES');
  bad.attempt_count = 1;
  assert.throws(() => compileSubmissionPreflight(base({ local_ack: bad })), /LOCAL_ACK_ATTEMPT_MUST_BE_ZERO/);
}

console.log(JSON.stringify({
  schema: 'xiio.sdk.submission-preflight-check/v1',
  result: 'PASS',
  hostiles: 7,
  provider_effects: 0,
  hard: [
    'LOCAL_ACK_FIRST',
    'BILLING_RED=>PROVIDER_ATTEMPT_0',
    'PRE_RUNNER_BILLING_FAILURE!=SOURCE_FAILURE',
  ],
}, null, 2));
