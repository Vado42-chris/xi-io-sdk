import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  WORKER_CONNECTION_SCHEMA,
  WORKER_CANARY_BYTES,
  WORKER_CANARY_SHA256,
} from '../src/worker/connection.mjs';
import {
  WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA,
  WORKER_EXECUTION_ROUTE_SCHEMA,
  compileWorkerExecutionRouteObservation,
  qualifyWorkerExecutionRoute,
} from '../src/worker/execution-route.mjs';

const now = '2026-11-17T13:20:10.000Z';
const sha = 'a'.repeat(64);
const sorted = (value) => Array.isArray(value)
  ? value.map(sorted)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
    : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');

const bindingBasis = {
  worker_ref: 'worker:loki',
  device_ref: 'device:loki',
  source_generation: 'generation:worker:1',
  installed_generation: 'generation:worker:1',
  owner_principal_ref: 'xiio:user-1',
  account_principal_ref: 'xiio:user-1',
  installation_ref: 'installation:loki:1',
  installation_sha256: sha,
  binding_ref: 'binding:loki:1',
};
const binding = Object.freeze({
  schema: WORKER_CONNECTION_SCHEMA,
  state: 'BINDING_OBSERVED',
  ...bindingBasis,
  binding_digest: digest(bindingBasis),
  authority_granted: false,
  provider_effect: false,
});
const liveness = Object.freeze({
  schema: WORKER_CONNECTION_SCHEMA,
  state: 'LIVENESS_OBSERVED',
  worker_ref: binding.worker_ref,
  device_ref: binding.device_ref,
  installed_generation: binding.installed_generation,
  observation_ref: 'observation:liveness:1',
  authority_granted: false,
  provider_effect: false,
});
const canary = Object.freeze({
  schema: WORKER_CONNECTION_SCHEMA,
  state: 'CANARY_RETURN_VERIFIED',
  worker_ref: binding.worker_ref,
  work_ref: 'work:route-canary:1',
  request_digest: 'b'.repeat(64),
  result_ref: 'result:route-canary:1',
  return_ref: 'return:route-canary:1',
  resource_ref: 'resource:route-canary:1',
  version_ref: 'version:route-canary:1',
  data_base64: Buffer.from(WORKER_CANARY_BYTES).toString('base64'),
  bytes: WORKER_CANARY_BYTES.length,
  sha256: WORKER_CANARY_SHA256,
  authority_granted: false,
  provider_effect: false,
  apply_return_verified: false,
});

function observation(overrides = {}) {
  return compileWorkerExecutionRouteObservation({
    route_ref: 'route:loki:sam-law:conversation-ask',
    runtime_ref: 'runtime:sam-law',
    product_ref: 'xiio:sam-law',
    api_ref: 'api:sam-law:v1',
    capability_ref: 'agent-conversation',
    operation_ref: 'conversation:ask',
    worker_ref: binding.worker_ref,
    device_ref: binding.device_ref,
    installed_generation: binding.installed_generation,
    binding_digest: binding.binding_digest,
    liveness_observation_ref: liveness.observation_ref,
    canary_return_ref: canary.return_ref,
    session_ref: 'session:loki:1',
    producer_ref: 'producer:ibal-switchboard-route-observer',
    producer_generation: 'generation:route-observer:1',
    producer_readback_ref: 'readback:route-observer:1',
    producer_readback_generation: 'generation:route-observer:1',
    observed_at: '2026-11-17T13:20:00.000Z',
    expires_at: '2026-11-17T13:20:30.000Z',
    connection_session_authenticated: true,
    connection_session_authorized: true,
    capability_available: true,
    operation_supported: true,
    tool_executable: true,
    authority_granted: false,
    effect_authority: false,
    provider_effect: false,
    billing_effect_authority: false,
    ...overrides,
  });
}

function qualify(overrides = {}, clock = () => now) {
  return qualifyWorkerExecutionRoute({
    binding,
    liveness,
    canary,
    observation: observation(),
    ...overrides,
  }, { clock });
}

test('qualifies current binding, liveness, canary and executable route without granting effects', () => {
  const result = qualify();
  assert.equal(result.schema, WORKER_EXECUTION_ROUTE_SCHEMA);
  assert.equal(result.state, 'QUALIFIED');
  assert.equal(result.execution_route_qualified, true);
  assert.equal(result.runtime_ref, 'runtime:sam-law');
  assert.equal(result.installed_generation, binding.installed_generation);
  assert.equal(result.canary_return_ref, canary.return_ref);
  assert.equal(result.action_allowed, false);
  assert.equal(result.effect_authority, false);
  assert.equal(result.provider_effect, false);
  assert.equal(result.billing_effect_authority, false);
});

test('compiled observation is non-authorizing and digest-bound', () => {
  const result = observation();
  assert.equal(result.schema, WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA);
  assert.equal(result.state, 'CALLABLE_OBSERVED');
  assert.match(result.route_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.authority_granted, false);
  assert.equal(result.effect_authority, false);
});

test('missing route observation refuses rather than treating entitlement as connectivity', () => {
  const result = qualify({ observation: null });
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_OBSERVATION_REQUIRED');
});

test('binding drift refuses', () => {
  const result = qualify({ binding: { ...binding, installed_generation: 'generation:worker:old' } });
  assert.equal(result.first_red, 'WORKER_EXECUTION_BINDING_DRIFT');
});

test('binding digest substitution refuses', () => {
  const result = qualify({ binding: { ...binding, binding_digest: 'c'.repeat(64) } });
  assert.equal(result.first_red, 'WORKER_EXECUTION_BINDING_DIGEST_CHANGED');
});

test('wrong worker liveness refuses', () => {
  const result = qualify({ liveness: { ...liveness, worker_ref: 'worker:foreign' } });
  assert.equal(result.first_red, 'WORKER_EXECUTION_LIVENESS_NOT_QUALIFIED');
});

test('canary narration without exact reopened bytes refuses', () => {
  const result = qualify({ canary: { ...canary, data_base64: Buffer.from('narrated').toString('base64') } });
  assert.equal(result.first_red, 'WORKER_EXECUTION_CANARY_BYTES_MISMATCH');
});

test('route evidence cannot substitute a different device', () => {
  const result = qualify({ observation: observation({ device_ref: 'device:foreign' }) });
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');
});

test('route evidence cannot substitute a different installed generation', () => {
  const result = qualify({ observation: observation({ installed_generation: 'generation:worker:old' }) });
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');
});

test('route evidence cannot substitute the canary return', () => {
  const result = qualify({ observation: observation({ canary_return_ref: 'return:foreign' }) });
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');
});

test('stale route observation refuses', () => {
  const result = qualify({}, () => '2026-11-17T13:20:31.000Z');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_STALE');
});

test('route validity window cannot exceed the bounded currentness ceiling', () => {
  const result = qualify({ observation: observation({ expires_at: '2026-11-17T13:21:00.001Z' }) });
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_WINDOW_TOO_WIDE');
});

for (const flag of [
  'connection_session_authenticated',
  'connection_session_authorized',
  'capability_available',
  'operation_supported',
  'tool_executable',
]) {
  test(`${flag} is independently required`, () => {
    assert.throws(
      () => observation({ [flag]: false }),
      new RegExp(`WORKER_EXECUTION_${flag.toUpperCase()}_REQUIRED`),
    );
  });
}

test('producer generation must match independent readback generation', () => {
  assert.throws(
    () => observation({ producer_readback_generation: 'generation:route-observer:old' }),
    /WORKER_EXECUTION_PRODUCER_CURRENTNESS_MISMATCH/,
  );
});

test('route cannot launder effect authority', () => {
  assert.throws(
    () => observation({ effect_authority: true }),
    /WORKER_EXECUTION_ROUTE_AUTHORITY_FORGED/,
  );
});

test('route digest tampering refuses', () => {
  assert.throws(
    () => compileWorkerExecutionRouteObservation({ ...observation(), route_digest: 'd'.repeat(64) }),
    /WORKER_EXECUTION_ROUTE_DIGEST_CHANGED/,
  );
});

test('secret-shaped connection metadata is refused without echoing it', () => {
  assert.throws(
    () => qualifyWorkerExecutionRoute({
      binding,
      liveness,
      canary,
      observation: { ...observation(), metadata: { access_token: 'do-not-read' } },
    }, { clock: () => now }),
    /WORKER_EXECUTION_ROUTE_SECRET_FIELD_REFUSED/,
  );
});

test('accessor-backed route metadata is refused without executing getter', () => {
  let reads = 0;
  const route = { ...observation() };
  Object.defineProperty(route, 'metadata', {
    enumerable: true,
    get() {
      reads += 1;
      return { state: 'fake' };
    },
  });
  assert.throws(
    () => qualifyWorkerExecutionRoute({ binding, liveness, canary, observation: route }, { clock: () => now }),
    /WORKER_EXECUTION_ROUTE_ACCESSOR_FIELD_REFUSED/,
  );
  assert.equal(reads, 0);
});
