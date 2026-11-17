import { createHash } from 'node:crypto';
import { assertCredentialFreeRecord } from '../identity/account-binding.mjs';
import {
  WORKER_CONNECTION_SCHEMA,
  WORKER_CANARY_BYTES,
  WORKER_CANARY_SHA256,
} from './connection.mjs';

export const WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA = 'xiio.runtime.execution-route-observation/v1';
export const WORKER_EXECUTION_ROUTE_SCHEMA = 'xiio.sdk.worker-execution-route/v1';
export const MAX_WORKER_EXECUTION_ROUTE_AGE_MS = 30_000;

const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SECRET_KEY = /token|password|secret|credential|api.?key|authorization/i;
const REQUIRED_TRUE = Object.freeze([
  'connection_session_authenticated',
  'connection_session_authorized',
  'capability_available',
  'operation_supported',
  'tool_executable',
]);

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function ref(value, code) {
  if (typeof value !== 'string' || !REF.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
}

function credentialFree(value) {
  assertCredentialFreeRecord(value, {
    secretKeyPattern: SECRET_KEY,
    secretCode: 'WORKER_EXECUTION_ROUTE_SECRET_FIELD_REFUSED',
    accessorCode: 'WORKER_EXECUTION_ROUTE_ACCESSOR_FIELD_REFUSED',
  });
}

function blocked(first_red) {
  return Object.freeze({
    schema: WORKER_EXECUTION_ROUTE_SCHEMA,
    state: 'BLOCKED',
    first_red,
    execution_route_qualified: false,
    action_allowed: false,
    authority_granted: false,
    effect_authority: false,
    provider_effect: false,
    billing_effect_authority: false,
  });
}

function canonicalBinding(binding) {
  if (binding?.schema !== WORKER_CONNECTION_SCHEMA || binding?.state !== 'BINDING_OBSERVED') {
    fail('WORKER_EXECUTION_BINDING_REQUIRED');
  }
  const fields = [
    'worker_ref',
    'device_ref',
    'source_generation',
    'installed_generation',
    'owner_principal_ref',
    'account_principal_ref',
    'installation_ref',
    'installation_sha256',
    'binding_ref',
  ];
  const signature = Object.fromEntries(fields.map((field) => [field, ref(binding[field], `WORKER_EXECUTION_${field.toUpperCase()}_INVALID`)]));
  if (!SHA256.test(signature.installation_sha256)) fail('WORKER_EXECUTION_INSTALLATION_DIGEST_INVALID');
  if (
    signature.installed_generation !== signature.source_generation ||
    signature.owner_principal_ref !== signature.account_principal_ref
  ) fail('WORKER_EXECUTION_BINDING_DRIFT');
  if (binding.binding_digest !== digest(signature)) fail('WORKER_EXECUTION_BINDING_DIGEST_CHANGED');
  if (binding.authority_granted !== false || binding.provider_effect !== false) {
    fail('WORKER_EXECUTION_BINDING_AUTHORITY_FORGED');
  }
  return Object.freeze({ ...signature, binding_digest: binding.binding_digest });
}

function canonicalLiveness(liveness, binding) {
  if (
    liveness?.schema !== WORKER_CONNECTION_SCHEMA ||
    liveness?.state !== 'LIVENESS_OBSERVED' ||
    liveness.worker_ref !== binding.worker_ref ||
    liveness.device_ref !== binding.device_ref ||
    liveness.installed_generation !== binding.installed_generation ||
    liveness.authority_granted !== false ||
    liveness.provider_effect !== false
  ) fail('WORKER_EXECUTION_LIVENESS_NOT_QUALIFIED');
  return Object.freeze({
    worker_ref: binding.worker_ref,
    device_ref: binding.device_ref,
    installed_generation: binding.installed_generation,
    observation_ref: ref(liveness.observation_ref, 'WORKER_EXECUTION_LIVENESS_REF_INVALID'),
  });
}

function canonicalCanary(canary, binding) {
  if (
    canary?.schema !== WORKER_CONNECTION_SCHEMA ||
    !['CANARY_RETURN_VERIFIED', 'CANARY_RETURN_RECONCILED'].includes(canary?.state) ||
    canary.worker_ref !== binding.worker_ref ||
    canary.sha256 !== WORKER_CANARY_SHA256 ||
    canary.bytes !== WORKER_CANARY_BYTES.length ||
    canary.authority_granted !== false ||
    canary.provider_effect !== false ||
    canary.apply_return_verified !== false
  ) fail('WORKER_EXECUTION_CANARY_NOT_QUALIFIED');
  const encoded = String(canary.data_base64 ?? '');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    !encoded ||
    bytes.toString('base64') !== encoded ||
    bytes.length !== WORKER_CANARY_BYTES.length ||
    !bytes.equals(WORKER_CANARY_BYTES)
  ) fail('WORKER_EXECUTION_CANARY_BYTES_MISMATCH');
  return Object.freeze({
    state: canary.state,
    work_ref: ref(canary.work_ref, 'WORKER_EXECUTION_CANARY_WORK_REF_INVALID'),
    request_digest: SHA256.test(String(canary.request_digest ?? ''))
      ? canary.request_digest
      : fail('WORKER_EXECUTION_CANARY_REQUEST_DIGEST_INVALID'),
    result_ref: ref(canary.result_ref, 'WORKER_EXECUTION_CANARY_RESULT_REF_INVALID'),
    return_ref: ref(canary.return_ref, 'WORKER_EXECUTION_CANARY_RETURN_REF_INVALID'),
    resource_ref: ref(canary.resource_ref, 'WORKER_EXECUTION_CANARY_RESOURCE_REF_INVALID'),
    version_ref: ref(canary.version_ref, 'WORKER_EXECUTION_CANARY_VERSION_REF_INVALID'),
  });
}

function observationBasis(input) {
  const basis = {
    route_ref: ref(input.route_ref, 'WORKER_EXECUTION_ROUTE_REF_INVALID'),
    runtime_ref: ref(input.runtime_ref, 'WORKER_EXECUTION_RUNTIME_REF_INVALID'),
    product_ref: ref(input.product_ref, 'WORKER_EXECUTION_PRODUCT_REF_INVALID'),
    api_ref: ref(input.api_ref, 'WORKER_EXECUTION_API_REF_INVALID'),
    capability_ref: ref(input.capability_ref, 'WORKER_EXECUTION_CAPABILITY_REF_INVALID'),
    operation_ref: ref(input.operation_ref, 'WORKER_EXECUTION_OPERATION_REF_INVALID'),
    worker_ref: ref(input.worker_ref, 'WORKER_EXECUTION_WORKER_REF_INVALID'),
    device_ref: ref(input.device_ref, 'WORKER_EXECUTION_DEVICE_REF_INVALID'),
    installed_generation: ref(input.installed_generation, 'WORKER_EXECUTION_INSTALLED_GENERATION_INVALID'),
    binding_digest: SHA256.test(String(input.binding_digest ?? ''))
      ? input.binding_digest
      : fail('WORKER_EXECUTION_BINDING_DIGEST_INVALID'),
    liveness_observation_ref: ref(input.liveness_observation_ref, 'WORKER_EXECUTION_LIVENESS_REF_INVALID'),
    canary_return_ref: ref(input.canary_return_ref, 'WORKER_EXECUTION_CANARY_RETURN_REF_INVALID'),
    session_ref: ref(input.session_ref, 'WORKER_EXECUTION_SESSION_REF_INVALID'),
    producer_ref: ref(input.producer_ref, 'WORKER_EXECUTION_PRODUCER_REF_INVALID'),
    producer_generation: ref(input.producer_generation, 'WORKER_EXECUTION_PRODUCER_GENERATION_INVALID'),
    producer_readback_ref: ref(input.producer_readback_ref, 'WORKER_EXECUTION_PRODUCER_READBACK_REF_INVALID'),
    producer_readback_generation: ref(
      input.producer_readback_generation,
      'WORKER_EXECUTION_PRODUCER_READBACK_GENERATION_INVALID',
    ),
    observed_at: timestamp(input.observed_at, 'WORKER_EXECUTION_OBSERVED_AT_INVALID'),
    expires_at: timestamp(input.expires_at, 'WORKER_EXECUTION_EXPIRES_AT_INVALID'),
    connection_session_authenticated: input.connection_session_authenticated === true,
    connection_session_authorized: input.connection_session_authorized === true,
    capability_available: input.capability_available === true,
    operation_supported: input.operation_supported === true,
    tool_executable: input.tool_executable === true,
  };
  if (basis.producer_generation !== basis.producer_readback_generation) {
    fail('WORKER_EXECUTION_PRODUCER_CURRENTNESS_MISMATCH');
  }
  for (const flag of REQUIRED_TRUE) {
    if (basis[flag] !== true) fail(`WORKER_EXECUTION_${flag.toUpperCase()}_REQUIRED`);
  }
  if (
    input.authority_granted !== false ||
    input.effect_authority !== false ||
    input.provider_effect !== false ||
    input.billing_effect_authority !== false
  ) fail('WORKER_EXECUTION_ROUTE_AUTHORITY_FORGED');
  return Object.freeze(basis);
}

export function compileWorkerExecutionRouteObservation(input = {}) {
  credentialFree(input);
  const basis = observationBasis(input);
  const route_digest = digest(basis);
  if (input.route_digest !== undefined && input.route_digest !== route_digest) {
    fail('WORKER_EXECUTION_ROUTE_DIGEST_CHANGED');
  }
  return Object.freeze({
    schema: WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA,
    state: 'CALLABLE_OBSERVED',
    ...basis,
    route_digest,
    authority_granted: false,
    effect_authority: false,
    provider_effect: false,
    billing_effect_authority: false,
    hard: Object.freeze([
      'ROUTE_OBSERVED!=ROUTE_QUALIFIED',
      'CONNECTION_SESSION_AUTHORIZED!=WARD_EFFECT_AUTHORIZED',
      'TOOL_EXECUTABLE!=EFFECT_AUTHORITY',
      'REMOTE_EXECUTION_ROUTE!=LOCAL_CONTAINER_RUNTIME',
    ]),
  });
}

export function qualifyWorkerExecutionRoute(input = {}, { clock = () => new Date().toISOString() } = {}) {
  credentialFree(input);
  if (typeof clock !== 'function') return blocked('WORKER_EXECUTION_CLOCK_INVALID');
  try {
    const binding = canonicalBinding(input.binding);
    const liveness = canonicalLiveness(input.liveness, binding);
    const canary = canonicalCanary(input.canary, binding);
    const supplied = input.observation;
    if (supplied?.schema !== WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA || supplied?.state !== 'CALLABLE_OBSERVED') {
      fail('WORKER_EXECUTION_ROUTE_OBSERVATION_REQUIRED');
    }
    const observation = compileWorkerExecutionRouteObservation(supplied);
    if (
      observation.worker_ref !== binding.worker_ref ||
      observation.device_ref !== binding.device_ref ||
      observation.installed_generation !== binding.installed_generation ||
      observation.binding_digest !== binding.binding_digest ||
      observation.liveness_observation_ref !== liveness.observation_ref ||
      observation.canary_return_ref !== canary.return_ref
    ) fail('WORKER_EXECUTION_ROUTE_EVIDENCE_MISMATCH');

    const now = Date.parse(timestamp(clock(), 'WORKER_EXECUTION_CLOCK_INVALID'));
    const observed = Date.parse(observation.observed_at);
    const expires = Date.parse(observation.expires_at);
    if (observed > now || now > expires) fail('WORKER_EXECUTION_ROUTE_STALE');
    if (expires - observed > MAX_WORKER_EXECUTION_ROUTE_AGE_MS) {
      fail('WORKER_EXECUTION_ROUTE_WINDOW_TOO_WIDE');
    }

    return Object.freeze({
      schema: WORKER_EXECUTION_ROUTE_SCHEMA,
      state: 'QUALIFIED',
      execution_route_qualified: true,
      route_ref: observation.route_ref,
      route_digest: observation.route_digest,
      runtime_ref: observation.runtime_ref,
      product_ref: observation.product_ref,
      api_ref: observation.api_ref,
      capability_ref: observation.capability_ref,
      operation_ref: observation.operation_ref,
      worker_ref: binding.worker_ref,
      device_ref: binding.device_ref,
      installed_generation: binding.installed_generation,
      installation_ref: binding.installation_ref,
      installation_sha256: binding.installation_sha256,
      binding_ref: binding.binding_ref,
      binding_digest: binding.binding_digest,
      liveness_observation_ref: liveness.observation_ref,
      canary_work_ref: canary.work_ref,
      canary_request_digest: canary.request_digest,
      canary_result_ref: canary.result_ref,
      canary_return_ref: canary.return_ref,
      producer_ref: observation.producer_ref,
      producer_generation: observation.producer_generation,
      producer_readback_ref: observation.producer_readback_ref,
      observed_at: observation.observed_at,
      expires_at: observation.expires_at,
      action_allowed: false,
      authority_granted: false,
      effect_authority: false,
      provider_effect: false,
      billing_effect_authority: false,
      hard: Object.freeze([
        'EXECUTION_ROUTE_QUALIFIED!=PRODUCT_API_ADMITTED',
        'EXECUTION_ROUTE_QUALIFIED!=WARD_EFFECT_AUTHORIZED',
        'EXECUTION_ROUTE_QUALIFIED!=PROVIDER_EFFECT',
        'EXECUTION_ROUTE_QUALIFIED!=BILLING_COMMIT',
        'REMOTE_EXECUTION_ROUTE!=LOCAL_CONTAINER_RUNTIME',
      ]),
    });
  } catch (error) {
    const code = typeof error?.code === 'string'
      ? error.code
      : typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{4,120}$/.test(error.message)
        ? error.message
        : 'WORKER_EXECUTION_ROUTE_UNAVAILABLE';
    return blocked(code);
  }
}
