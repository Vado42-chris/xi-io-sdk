#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileSubmissionPreflight } from '../src/evaluation/submission-preflight.mjs';

const billingMessage = 'The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings';

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

const startedObservation = () => ({
  provider: 'GitHub Actions',
  operation: 'pull_request_checks',
  conclusion: 'success',
  runner_id: 42,
  steps: [{}],
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
    provider_observation: startedObservation(),
    provider_currentness: {
      state: 'CURRENT',
      readback_ref: 'readback:provider-current',
      admission_ref: 'admission:provider-job',
    },
    ...overrides,
  };
}

{
  const out = compileSubmissionPreflight(base());
  assert.equal(out.schema, 'xiio.sdk.submission-preflight/v2');
  assert.equal(out.state, 'READY_FOR_PROVIDER_SUBMISSION');
  assert.equal(out.provider.submission_eligible, true);
  assert.equal(out.provider.admission_state, 'START_OBSERVED');
  assert.equal(out.meter.provider_attempt_units, 1);
  assert.equal(out.hotfolder.semantics, 'WAKE_ONLY');
  assert.equal(out.effects, 0);
}

{
  const out = compileSubmissionPreflight(base({
    provider_observation: {
      provider: 'GitHub Actions',
      operation: 'pull_request_checks',
      conclusion: 'failure',
      runner_id: 0,
      steps: [],
      provider_message: billingMessage,
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_ADMISSION_HOLD');
  assert.equal(out.provider.admission_state, 'HOLD_PROVIDER_BILLING');
  assert.equal(out.provider.failure_class, 'PROVIDER_ACCOUNT_BILLING_BLOCKED');
  assert.equal(out.provider.submission_eligible, false);
  assert.equal(out.meter.provider_attempt_units, 0);
  assert.equal(out.meter.prevented_provider_attempt_units, 1);
  assert.equal(out.hotfolder.route, 'LOCAL_ACK_SIM_ONLY');
}

{
  const out = compileSubmissionPreflight(base({
    provider_observation: {
      provider: 'GitHub Actions',
      operation: 'pull_request_checks',
      conclusion: 'failure',
      runner_id: 0,
      steps: [],
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_ADMISSION_HOLD');
  assert.equal(out.provider.admission_state, 'HOLD_PROVIDER_START_FAILURE');
  assert.equal(out.provider.failure_class, 'PROVIDER_RUNNER_START_FAILED');
  assert.equal(out.meter.provider_attempt_units, 0);
}

{
  const out = compileSubmissionPreflight(base({ local_ack: ack('NO') }));
  assert.equal(out.state, 'BLOCKED_LOCAL_ACK');
  assert.equal(out.provider.submission_eligible, false);
  assert.equal(out.meter.local_sim_units, 0);
  assert.equal(out.meter.provider_attempt_units, 0);
}

{
  const out = compileSubmissionPreflight(base({ provider_observation: {} }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_START_READBACK_WAIT');
  assert.equal(out.provider.submission_eligible, false);
}

{
  const out = compileSubmissionPreflight(base({
    provider_currentness: {
      state: 'UNKNOWN',
      readback_ref: null,
      admission_ref: 'admission:provider-job',
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_CURRENTNESS_WAIT');
  assert.equal(out.provider.submission_eligible, false);
}

{
  const out = compileSubmissionPreflight(base({
    provider_currentness: {
      state: 'CURRENT',
      readback_ref: 'readback:provider-current',
      admission_ref: null,
    },
  }));
  assert.equal(out.state, 'LOCAL_SIM_READY_PROVIDER_ADMISSION_WAIT');
  assert.equal(out.provider.submission_eligible, false);
}

{
  const bad = ack('YES');
  bad.attempt_count = 1;
  assert.throws(() => compileSubmissionPreflight(base({ local_ack: bad })), /LOCAL_ACK_ATTEMPT_MUST_BE_ZERO/);
}

console.log(JSON.stringify({
  schema: 'xiio.sdk.submission-preflight-check/v2',
  result: 'PASS',
  hostiles: 8,
  provider_effects: 0,
  hard: [
    'LOCAL_ACK_FIRST',
    'HOSTED_RUNNER_OBSERVATION_OWNS_PROVIDER_BILLING_CLASSIFICATION',
    'PROVIDER_ADMISSION_HOLD=>PROVIDER_ATTEMPT_0',
    'PRE_RUNNER_BILLING_FAILURE!=SOURCE_FAILURE',
  ],
}, null, 2));
