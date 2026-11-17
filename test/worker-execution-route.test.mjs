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
  WORKER_EXECUTION_ROUTE_READBACK_SCHEMA,
  WORKER_EXECUTION_ROUTE_SCHEMA,
  compileWorkerExecutionRouteObservation,
  createWorkerExecutionRouteQualifier,
  inspectQualifiedWorkerExecutionRoute,
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

const REQUEST = Object.freeze({
  runtime_ref: 'runtime:sam-law',
  product_ref: 'xiio:sam-law',
  api_ref: 'api:sam-law:v1',
  capability_ref: 'agent-conversation',
  operation_ref: 'conversation:ask',
  worker_ref: 'worker:loki',
  device_ref: 'device:loki',
});

function makeFixture(overrides = {}) {
  const bindingBasis = {
    worker_ref: REQUEST.worker_ref,
    device_ref: REQUEST.device_ref,
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
  const observation = compileWorkerExecutionRouteObservation({
    observation_ref: 'observation:execution-route:1',
    route_ref: 'route:loki:sam-law:conversation-ask',
    ...REQUEST,
    installed_generation: binding.installed_generation,
    binding_digest: binding.binding_digest,
    liveness_observation_ref: liveness.observation_ref,
    canary_return_ref: canary.return_ref,
    session_ref: 'session:loki:1',
    producer_ref: 'producer:ibal-switchboard-route-observer',
    producer_generation: 'generation:route-observer:1',
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
  });
  const readback = Object.freeze({
    schema: WORKER_EXECUTION_ROUTE_READBACK_SCHEMA,
    state: 'OBSERVATION_REOPENED',
    observation_ref: observation.observation_ref,
    route_digest: observation.route_digest,
    producer_ref: observation.producer_ref,
    producer_generation: observation.producer_generation,
    readback_ref: 'readback:execution-route:1',
    readback_generation: observation.producer_generation,
    authority_granted: false,
    effect_authority: false,
    provider_effect: false,
    billing_effect_authority: false,
  });
  const state = {
    binding,
    liveness,
    canary,
    observation,
    readback,
    throwAt: null,
    ...overrides,
  };
  const call = (name, value) => {
    if (state.throwAt === name) throw new Error('PRODUCER_PORT_UNAVAILABLE');
    return value;
  };
  const ports = {
    readBinding: () => call('readBinding', state.binding),
    observeLiveness: () => call('observeLiveness', state.liveness),
    readCanaryReturn: () => call('readCanaryReturn', state.canary),
    observeExecutionRoute: () => call('observeExecutionRoute', state.observation),
    readExecutionRouteObservation: () => call('readExecutionRouteObservation', state.readback),
  };
  const qualifier = createWorkerExecutionRouteQualifier({ports, clock: () => now});
  return {state, ports, qualifier};
}

async function qualify(fixture = makeFixture(), request = REQUEST) {
  return fixture.qualifier.qualify(request);
}

test('producer-owned qualifier returns a live branded route without granting effects', async () => {
  const fixture = makeFixture();
  const route = await qualify(fixture);
  assert.equal(route.schema, WORKER_EXECUTION_ROUTE_SCHEMA);
  assert.equal(route.state, 'QUALIFIED');
  assert.equal(route.execution_route_qualified, true);
  assert.equal(route.runtime_ref, REQUEST.runtime_ref);
  assert.equal(route.installed_generation, fixture.state.binding.installed_generation);
  assert.equal(route.canary_return_ref, fixture.state.canary.return_ref);
  assert.equal(route.route_readback_ref, fixture.state.readback.readback_ref);
  assert.equal(route.action_allowed, false);
  assert.equal(route.effect_authority, false);
  assert.equal(route.provider_effect, false);
  assert.equal(route.billing_effect_authority, false);
  assert.strictEqual(inspectQualifiedWorkerExecutionRoute(route, {clock: () => now}), route);
});

test('compiled producer observation is structural, non-authorizing and digest-bound', () => {
  const observation = makeFixture().state.observation;
  assert.equal(observation.schema, WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA);
  assert.equal(observation.state, 'CALLABLE_OBSERVED');
  assert.match(observation.route_digest, /^[a-f0-9]{64}$/);
  assert.equal(observation.authority_granted, false);
  assert.equal(observation.effect_authority, false);
  assert.ok(observation.hard.includes('SUPPLIED_ROUTE_OBSERVATION!=QUALIFIED_ROUTE'));
});

test('direct structural qualification entry is permanently blocked', () => {
  const result = qualifyWorkerExecutionRoute({});
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_PRODUCER_UNBOUND');
});

test('plain forged route cannot pass the live brand', () => {
  const forged = {
    schema: WORKER_EXECUTION_ROUTE_SCHEMA,
    state: 'QUALIFIED',
    execution_route_qualified: true,
    expires_at: '2026-11-17T13:20:30.000Z',
    action_allowed: false,
    authority_granted: false,
    effect_authority: false,
    provider_effect: false,
    billing_effect_authority: false,
  };
  const result = inspectQualifiedWorkerExecutionRoute(forged, {clock: () => now});
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_PRODUCER_UNBOUND');
});

test('structured clone and JSON round trip lose the live route brand', async () => {
  const route = await qualify();
  for (const clone of [structuredClone(route), JSON.parse(JSON.stringify(route))]) {
    const result = inspectQualifiedWorkerExecutionRoute(clone, {clock: () => now});
    assert.equal(result.state, 'BLOCKED');
    assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_PRODUCER_UNBOUND');
  }
});

test('branded route expires independently at consumption time', async () => {
  const route = await qualify();
  const result = inspectQualifiedWorkerExecutionRoute(route, {clock: () => '2026-11-17T13:20:31.000Z'});
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_STALE');
});

test('qualifier refuses missing trusted producer ports', () => {
  assert.throws(
    () => createWorkerExecutionRouteQualifier({ports: {}}),
    /WORKER_EXECUTION_ROUTE_PORTS_UNBOUND/,
  );
});

test('producer port failure is normalized without inventing readiness', async () => {
  const fixture = makeFixture({throwAt: 'observeExecutionRoute'});
  const result = await qualify(fixture);
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'PRODUCER_PORT_UNAVAILABLE');
});

test('binding must match the requested worker and device', async () => {
  const fixture = makeFixture();
  const result = await qualify(fixture, {...REQUEST, worker_ref: 'worker:foreign'});
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_BINDING_REQUEST_MISMATCH');
});

test('binding drift refuses', async () => {
  const fixture = makeFixture();
  fixture.state.binding = {...fixture.state.binding, installed_generation: 'generation:worker:old'};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_BINDING_DRIFT');
});

test('binding digest substitution refuses', async () => {
  const fixture = makeFixture();
  fixture.state.binding = {...fixture.state.binding, binding_digest: 'c'.repeat(64)};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_BINDING_DIGEST_CHANGED');
});

test('wrong worker liveness refuses', async () => {
  const fixture = makeFixture();
  fixture.state.liveness = {...fixture.state.liveness, worker_ref: 'worker:foreign'};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_LIVENESS_NOT_QUALIFIED');
});

test('canary narration without exact reopened bytes refuses', async () => {
  const fixture = makeFixture();
  fixture.state.canary = {
    ...fixture.state.canary,
    data_base64: Buffer.from('narrated').toString('base64'),
  };
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_CANARY_BYTES_MISMATCH');
});

test('producer route cannot substitute a different requested runtime', async () => {
  const fixture = makeFixture();
  const result = await qualify(fixture, {...REQUEST, runtime_ref: 'runtime:foreign'});
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_REQUEST_MISMATCH');
});

test('route evidence cannot substitute a different device', async () => {
  const fixture = makeFixture();
  fixture.state.observation = {
    ...fixture.state.observation,
    device_ref: 'device:foreign',
  };
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_DIGEST_CHANGED');
});

test('route evidence cannot substitute a different installed generation with a recomputed digest', async () => {
  const fixture = makeFixture();
  fixture.state.observation = compileWorkerExecutionRouteObservation({
    ...fixture.state.observation,
    installed_generation: 'generation:worker:old',
    route_digest: undefined,
  });
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');
});

test('route evidence cannot substitute the canary return', async () => {
  const fixture = makeFixture();
  fixture.state.observation = compileWorkerExecutionRouteObservation({
    ...fixture.state.observation,
    canary_return_ref: 'return:foreign',
    route_digest: undefined,
  });
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');
});

test('stale route observation refuses', async () => {
  const fixture = makeFixture();
  const qualifier = createWorkerExecutionRouteQualifier({
    ports: fixture.ports,
    clock: () => '2026-11-17T13:20:31.000Z',
  });
  const result = await qualifier.qualify(REQUEST);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_STALE');
});

test('route validity window cannot exceed the bounded currentness ceiling', async () => {
  const fixture = makeFixture();
  fixture.state.observation = compileWorkerExecutionRouteObservation({
    ...fixture.state.observation,
    expires_at: '2026-11-17T13:21:00.001Z',
    route_digest: undefined,
  });
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_WINDOW_TOO_WIDE');
});

for (const flag of [
  'connection_session_authenticated',
  'connection_session_authorized',
  'capability_available',
  'operation_supported',
  'tool_executable',
]) {
  test(`${flag} is independently required from the producer`, async () => {
    const fixture = makeFixture();
    fixture.state.observation = {...fixture.state.observation, [flag]: false};
    const result = await qualify(fixture);
    assert.equal(result.first_red, `WORKER_EXECUTION_${flag.toUpperCase()}_REQUIRED`);
  });
}

test('route observation cannot launder effect authority', async () => {
  const fixture = makeFixture();
  fixture.state.observation = {...fixture.state.observation, effect_authority: true};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_AUTHORITY_FORGED');
});

test('route digest tampering refuses', async () => {
  const fixture = makeFixture();
  fixture.state.observation = {...fixture.state.observation, route_digest: 'd'.repeat(64)};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_DIGEST_CHANGED');
});

test('independent readback must match route digest and producer generation', async () => {
  for (const patch of [
    {route_digest: 'e'.repeat(64)},
    {producer_generation: 'generation:route-observer:old'},
    {readback_generation: 'generation:route-observer:old'},
  ]) {
    const fixture = makeFixture();
    fixture.state.readback = {...fixture.state.readback, ...patch};
    const result = await qualify(fixture);
    assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_READBACK_MISMATCH');
  }
});

test('readback cannot launder authority', async () => {
  const fixture = makeFixture();
  fixture.state.readback = {...fixture.state.readback, authority_granted: true};
  const result = await qualify(fixture);
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_READBACK_MISMATCH');
});

test('secret-shaped request metadata is refused without echoing it', async () => {
  const result = await qualify(makeFixture(), {
    ...REQUEST,
    metadata: {access_token: 'do-not-read'},
  });
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_SECRET_FIELD_REFUSED');
});

test('accessor-backed request metadata is refused without executing getter', async () => {
  let reads = 0;
  const request = {...REQUEST};
  Object.defineProperty(request, 'metadata', {
    enumerable: true,
    get() {
      reads += 1;
      return {state: 'fake'};
    },
  });
  const result = await qualify(makeFixture(), request);
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.first_red, 'WORKER_EXECUTION_ROUTE_ACCESSOR_FIELD_REFUSED');
  assert.equal(reads, 0);
});
