#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHostedRunnerObservation, normalizeProviderFailure } from '../src/providers/state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const antigravity = normalizeProviderFailure(load('fixtures/providers/google-antigravity-resource-exhausted.synthetic.json'));
assert.equal(antigravity.schema, 'xiio.sdk.provider-operation-state/v1');
assert.equal(antigravity.failure_class, 'PROVIDER_CAPACITY_EXHAUSTED');
assert.equal(antigravity.operation_state, 'WAIT_PROVIDER_CAPACITY');
assert.equal(antigravity.provider_reached, true);
assert.equal(antigravity.auth_state, 'UNKNOWN');
assert.equal(antigravity.retry_after_ms, null);
assert.equal(antigravity.retry_timing_state, 'UNKNOWN');
assert.equal(antigravity.source_failure_credit, false);
assert.equal(antigravity.work_invalidated, false);
assert.equal(antigravity.automatic_retry_authorized, false);
assert.equal(antigravity.fallback_authorized, false);
assert.equal(antigravity.raw_provider_payload_included, false);
assert.match(antigravity.provider_trace_ref, /^provider-trace:/);

const auth = normalizeProviderFailure(load('fixtures/providers/synthetic-auth-required.json'));
assert.equal(auth.failure_class, 'PROVIDER_AUTH_REQUIRED');
assert.equal(auth.operation_state, 'WAIT_PROVIDER_AUTH');
assert.equal(auth.auth_state, 'UNAUTHENTICATED');
assert.equal(auth.source_failure_credit, false);

const evidencedRetry = normalizeProviderFailure({
  provider: 'Synthetic Provider C',
  operation: 'generate',
  http_status: 429,
  provider_status: 'RATE_LIMITED',
  headers: { 'retry-after': '3' },
});
const fixedNow='2026-11-17T18:00:00Z';
const dateRetry=normalizeProviderFailure({
  provider:'Synthetic Provider Date Retry',
  operation:'generate',
  http_status:429,
  headers:{'retry-after':'Mon, 17 Nov 2026 18:00:05 GMT'},
},{now:()=>fixedNow});
assert.equal(dateRetry.retry_after_ms,5000);
assert.equal(dateRetry.retry_timing_state,'EVIDENCED');
const sameDateRetry=normalizeProviderFailure({
  provider:'Synthetic Provider Date Retry',
  operation:'generate',
  http_status:429,
  headers:{'retry-after':'Mon, 17 Nov 2026 18:00:05 GMT'},
},{now:()=>fixedNow});
assert.equal(sameDateRetry.retry_after_ms,dateRetry.retry_after_ms,'same evidence and injected clock must be deterministic');
assert.throws(
  ()=>normalizeProviderFailure({http_status:429},{now:()=> 'not-a-time'}),
  /provider failure clock must return an ISO timestamp/,
);

assert.equal(evidencedRetry.failure_class, 'PROVIDER_RATE_LIMITED');
assert.equal(evidencedRetry.retry_after_ms, 3000);
assert.equal(evidencedRetry.retry_timing_state, 'EVIDENCED');
assert.equal(evidencedRetry.automatic_retry_authorized, false, 'timing evidence must not grant retry authority');

const network = normalizeProviderFailure({ provider: 'Synthetic Provider D', operation: 'generate', failure_kind: 'NETWORK_UNREACHABLE' });
assert.equal(network.failure_class, 'PROVIDER_NETWORK_UNREACHABLE');
assert.equal(network.provider_reached, false);
assert.equal(network.operation_state, 'WAIT_PROVIDER_RECOVERY');
assert.equal(network.auth_state, 'UNKNOWN');

const permission = normalizeProviderFailure({ provider: 'Synthetic Provider E', operation: 'write', http_status: 403 });
assert.equal(permission.failure_class, 'PROVIDER_PERMISSION_DENIED');
assert.equal(permission.auth_state, 'UNKNOWN', '403 alone must not invent authenticated identity');
assert.equal(permission.fallback_authorized, false);

const githubBillingMessage = 'The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings';
const githubBilling = normalizeProviderFailure({
  provider: 'GitHub Actions',
  operation: 'pull_request_checks',
  provider_message: githubBillingMessage,
});
assert.equal(githubBilling.failure_class, 'PROVIDER_ACCOUNT_BILLING_BLOCKED');
assert.equal(githubBilling.operation_state, 'BLOCKED_PROVIDER_BILLING');
assert.equal(githubBilling.automatic_retry_authorized, false);
assert.equal(githubBilling.fallback_authorized, false);

const hostedBilling = normalizeHostedRunnerObservation({
  provider: 'GitHub Actions',
  operation: 'pull_request_checks',
  conclusion: 'failure',
  runner_id: 0,
  steps: [],
  provider_message: githubBillingMessage,
});
assert.equal(hostedBilling.schema, 'xiio.sdk.hosted-runner-admission-observation/v1');
assert.equal(hostedBilling.admission_state, 'HOLD_PROVIDER_BILLING');
assert.equal(hostedBilling.failure_class, 'PROVIDER_ACCOUNT_BILLING_BLOCKED');
assert.equal(hostedBilling.local_simulation_recommended, true);
assert.equal(hostedBilling.hosted_retry_authorized, false);
assert.equal(hostedBilling.effect_authority, false);

const hostedUnknownStartFailure = normalizeHostedRunnerObservation({
  provider: 'GitHub Actions',
  conclusion: 'failure',
  runner_id: 0,
  steps: [],
});
assert.equal(hostedUnknownStartFailure.admission_state, 'HOLD_PROVIDER_START_FAILURE');
assert.equal(hostedUnknownStartFailure.failure_class, 'PROVIDER_RUNNER_START_FAILED');
assert.equal(hostedUnknownStartFailure.local_simulation_recommended, true);

const hostedStarted = normalizeHostedRunnerObservation({
  provider: 'GitHub Actions',
  conclusion: 'failure',
  runner_id: 42,
  steps: [{}],
});
assert.equal(hostedStarted.admission_state, 'START_OBSERVED');
assert.equal(hostedStarted.failure_class, null);

// These four observations share one numeric boundary. Malformed evidence
// must not become a runner start, HTTP response or evidenced retry duration.
const malformedNumbers = ['1garbage', '1.5', '1e3', '0x10', '', ' ', 1.5, NaN, Infinity,
  Number.MAX_SAFE_INTEGER + 1, '9007199254740992', [], [1], {}, {toString:()=> '1'}, true, null, undefined];
for (const value of malformedNumbers) {
  for (const field of ['runner_id', 'steps_count']) {
    const result = normalizeHostedRunnerObservation({[field]:value});
    assert.equal(result[field], null);
    assert.equal(result.admission_state, 'UNKNOWN');
    assert.equal(result.effect_authority, false);
  }
  const failure = normalizeProviderFailure({http_status:value,retry_after_ms:value});
  assert.equal(failure.http_status,null);
  assert.equal(failure.provider_reached,false);
  assert.equal(failure.retry_after_ms,null);
  assert.equal(failure.retry_timing_state,'UNKNOWN');
  assert.equal(failure.automatic_retry_authorized,false);
}
for (const value of [42, '42', ' 42 ', '+42', '0042', Number.MAX_SAFE_INTEGER]) {
  const result=normalizeHostedRunnerObservation({runner_id:value});
  assert.equal(result.runner_id,Number(value));
  assert.equal(result.admission_state,'START_OBSERVED');
}
assert.equal(normalizeHostedRunnerObservation({runner_id:'0',steps_count:'0',conclusion:'failure'}).admission_state,'HOLD_PROVIDER_START_FAILURE');
assert.equal(normalizeHostedRunnerObservation({runner_id:-1}).runner_id,-1);
assert.equal(normalizeHostedRunnerObservation({runner_id:'bad',steps:[{}]}).admission_state,'START_OBSERVED','valid independent step evidence remains usable');
assert.equal(normalizeProviderFailure({http_status:'401',retry_after_ms:'20'}).retry_after_ms,20);

console.log('XIIO_SDK_PROVIDER_STATE PASS fixtures=8 numeric_hostiles=18 deterministic_retry_clock=1 source_failure_false_green=0 invented_retry=0 fallback_authority=0 hosted_billing_preflight=1');
