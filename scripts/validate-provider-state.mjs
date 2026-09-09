#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeProviderFailure } from '../src/providers/state.mjs';

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

console.log('XIIO_SDK_PROVIDER_STATE PASS fixtures=5 source_failure_false_green=0 invented_retry=0 fallback_authority=0');
