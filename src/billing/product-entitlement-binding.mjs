import { createHash } from 'node:crypto';
import { assertCredentialFreeRecord } from '../identity/account-binding.mjs';
import {
  ENTITLEMENT_TIER,
  PRODUCT_CAPABILITIES,
  PRODUCT_ENTITLEMENT_SCHEMA,
  compileProductEntitlement,
} from './product-entitlement.mjs';

export const PRODUCT_ENTITLEMENT_BINDING_SCHEMA = 'xiio.sdk.product-entitlement-binding/v1';
export const PRODUCT_ENTITLEMENT_CURRENTNESS_SCHEMA = 'xiio.sdk.product-entitlement-currentness/v1';

const STATES = new Set(['ACTIVE', 'PENDING', 'SUSPENDED', 'REVOKED', 'EXPIRED']);
const CAPABILITIES = new Set(PRODUCT_CAPABILITIES);
const SECRET_KEY = /token|password|secret|credential|api.?key|authorization/i;

function policyGeneration() {
  const tiers = Object.values(ENTITLEMENT_TIER).sort();
  const snapshot = Object.fromEntries(tiers.map((tier) => [
    tier,
    PRODUCT_CAPABILITIES.filter((capability) => compileProductEntitlement({
      product_ref: 'product:policy-snapshot',
      tier,
      required_capabilities: [capability],
    }).admitted).sort(),
  ]));
  return `sha256:${createHash('sha256').update(JSON.stringify({
    schema: PRODUCT_ENTITLEMENT_SCHEMA,
    capabilities: [...PRODUCT_CAPABILITIES].sort(),
    tiers: snapshot,
  })).digest('hex')}`;
}

export const PRODUCT_ENTITLEMENT_POLICY_GENERATION = policyGeneration();

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function ref(value, code, max = 192) {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value)) fail(code);
  return value;
}

function iso(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || Number.isNaN(Date.parse(value))) fail(code);
  return value;
}

function assertEntitlementCredentialFree(value) {
  assertCredentialFreeRecord(value, {
    secretKeyPattern: SECRET_KEY,
    secretCode: 'PRODUCT_ENTITLEMENT_SECRET_FIELD_REFUSED',
    accessorCode: 'PRODUCT_ENTITLEMENT_ACCESSOR_FIELD_REFUSED',
  });
}

function operations(values) {
  if (!Array.isArray(values) || values.length === 0) fail('ENTITLEMENT_OPERATION_REFS_REQUIRED');
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const operation = ref(value, 'ENTITLEMENT_OPERATION_REF_INVALID');
    if (seen.has(operation)) fail('ENTITLEMENT_OPERATION_REF_DUPLICATE');
    seen.add(operation);
    out.push(operation);
  }
  return Object.freeze(out.sort());
}

function scopes(values) {
  if (!Array.isArray(values) || values.length === 0) fail('ENTITLEMENT_SCOPES_REQUIRED');
  const seenProductCapabilities = new Set();
  const out = values.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('ENTITLEMENT_SCOPE_INVALID');
    assertEntitlementCredentialFree(row);
    const entitlement_capability_ref = ref(row.entitlement_capability_ref, 'ENTITLEMENT_CAPABILITY_REF_REQUIRED', 128);
    if (!CAPABILITIES.has(entitlement_capability_ref)) fail(`ENTITLEMENT_CAPABILITY_UNKNOWN:${entitlement_capability_ref}`);
    const product_capability_ref = ref(row.product_capability_ref, 'PRODUCT_CAPABILITY_REF_REQUIRED', 128);
    if (seenProductCapabilities.has(product_capability_ref)) fail('PRODUCT_CAPABILITY_SCOPE_DUPLICATE');
    seenProductCapabilities.add(product_capability_ref);
    return Object.freeze({
      entitlement_capability_ref,
      product_capability_ref,
      operation_refs: operations(row.operation_refs),
    });
  });
  out.sort((left, right) => left.product_capability_ref.localeCompare(right.product_capability_ref));
  return Object.freeze(out);
}

function digest(binding) {
  const canonical = JSON.stringify({
    schema: PRODUCT_ENTITLEMENT_BINDING_SCHEMA,
    entitlement_ref: binding.entitlement_ref,
    principal_ref: binding.principal_ref,
    tenant_ref: binding.tenant_ref,
    product_ref: binding.product_ref,
    api_declaration_ref: binding.api_declaration_ref,
    api_declaration_generation: binding.api_declaration_generation,
    entitlement_policy_schema: binding.entitlement_policy_schema,
    entitlement_policy_generation: binding.entitlement_policy_generation,
    tier: binding.tier,
    state: binding.state,
    issued_at: binding.issued_at,
    valid_from: binding.valid_from,
    valid_until: binding.valid_until,
    scopes: binding.scopes.map((scope) => ({
      entitlement_capability_ref: scope.entitlement_capability_ref,
      product_capability_ref: scope.product_capability_ref,
      operation_refs: [...scope.operation_refs],
    })),
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function canonicalBinding(input = {}) {
  assertEntitlementCredentialFree(input);
  const entitlement_ref = ref(input.entitlement_ref, 'ENTITLEMENT_REF_REQUIRED');
  const principal_ref = ref(input.principal_ref, 'ENTITLEMENT_PRINCIPAL_REF_REQUIRED');
  const tenant_ref = ref(input.tenant_ref, 'ENTITLEMENT_TENANT_REF_REQUIRED');
  const product_ref = ref(input.product_ref, 'ENTITLEMENT_PRODUCT_REF_REQUIRED');
  const api_declaration_ref = ref(input.api_declaration_ref, 'ENTITLEMENT_API_DECLARATION_REF_REQUIRED');
  const api_declaration_generation = ref(input.api_declaration_generation, 'ENTITLEMENT_API_DECLARATION_GENERATION_REQUIRED');
  if (input.entitlement_policy_schema !== undefined && input.entitlement_policy_schema !== PRODUCT_ENTITLEMENT_SCHEMA) {
    fail('ENTITLEMENT_POLICY_SCHEMA_MISMATCH');
  }
  if (input.entitlement_policy_generation !== undefined && input.entitlement_policy_generation !== PRODUCT_ENTITLEMENT_POLICY_GENERATION) {
    fail('ENTITLEMENT_POLICY_GENERATION_MISMATCH');
  }
  const tier = input.tier;
  if (!Object.values(ENTITLEMENT_TIER).includes(tier)) fail('ENTITLEMENT_TIER_INVALID');
  const state = input.state;
  if (!STATES.has(state)) fail('ENTITLEMENT_STATE_INVALID');
  const issued_at = iso(input.issued_at, 'ENTITLEMENT_ISSUED_AT_REQUIRED');
  const valid_from = iso(input.valid_from, 'ENTITLEMENT_VALID_FROM_REQUIRED');
  const valid_until = input.valid_until === null || input.valid_until === undefined
    ? null
    : iso(input.valid_until, 'ENTITLEMENT_VALID_UNTIL_INVALID');
  if (Date.parse(valid_from) < Date.parse(issued_at)) fail('ENTITLEMENT_VALID_FROM_BEFORE_ISSUED');
  if (valid_until !== null && Date.parse(valid_until) <= Date.parse(valid_from)) fail('ENTITLEMENT_VALID_WINDOW_INVALID');
  const compiledScopes = scopes(input.scopes);
  const tierCheck = compileProductEntitlement({
    product_ref,
    tier,
    required_capabilities: compiledScopes.map((scope) => scope.entitlement_capability_ref),
  });
  if (!tierCheck.admitted) fail(`ENTITLEMENT_SCOPE_NOT_COVERED:${tierCheck.withheld_capabilities.join(',')}`);
  return {
    schema: PRODUCT_ENTITLEMENT_BINDING_SCHEMA,
    entitlement_ref,
    principal_ref,
    tenant_ref,
    product_ref,
    api_declaration_ref,
    api_declaration_generation,
    entitlement_policy_schema: PRODUCT_ENTITLEMENT_SCHEMA,
    entitlement_policy_generation: PRODUCT_ENTITLEMENT_POLICY_GENERATION,
    tier,
    state,
    issued_at,
    valid_from,
    valid_until,
    scopes: compiledScopes,
    tier_scope_admitted: true,
  };
}

export function compileProductEntitlementBinding(input = {}) {
  const binding = canonicalBinding(input);
  const entitlement_generation = digest(binding);
  if (input.entitlement_generation !== undefined && input.entitlement_generation !== entitlement_generation) {
    fail('ENTITLEMENT_GENERATION_MISMATCH');
  }
  return Object.freeze({
    ...binding,
    entitlement_generation,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
    hard: Object.freeze([
      'TIER_SCOPE_ADMITTED!=CURRENT_ENTITLEMENT',
      'ENTITLEMENT_BINDING!=ACCESS_GRANT',
      'ENTITLEMENT_BINDING!=BILLING_ADMISSION',
      'ENTITLEMENT_BINDING!=PROVIDER_AUTHORIZATION',
      'ENTITLEMENT_BINDING!=EFFECT_AUTHORITY',
      'ADMIN_ROLE!=ENTITLEMENT',
      'SUPERADMIN_ROLE!=ENTITLEMENT',
      'ENTITLEMENT_POLICY_GENERATION=SDK_POLICY_DIGEST',
      'ENTITLEMENT_GENERATION=CANONICAL_CONTENT_DIGEST',
      'ENTITLEMENT_BINDING_IS_API_DECLARATION_GENERATION_BOUND',
      'ENTITLEMENT_RECORD!=CREDENTIAL_STORE',
    ]),
  });
}

function deriveCurrent(binding, sourceGeneration, readbackGeneration, observedAt) {
  const observed = Date.parse(observedAt);
  const validFrom = Date.parse(binding.valid_from);
  const validUntil = binding.valid_until === null ? null : Date.parse(binding.valid_until);
  const generation_current = sourceGeneration === binding.entitlement_generation &&
    readbackGeneration === binding.entitlement_generation;
  const temporal_current = observed >= validFrom && (validUntil === null || observed < validUntil);
  const state_current = binding.state === 'ACTIVE';
  return { generation_current, temporal_current, state_current, current: generation_current && temporal_current && state_current };
}

export function compileProductEntitlementCurrentness(input = {}) {
  assertEntitlementCredentialFree(input);
  const supplied = input.binding;
  if (supplied?.schema !== PRODUCT_ENTITLEMENT_BINDING_SCHEMA) fail('ENTITLEMENT_BINDING_REQUIRED');
  const binding = compileProductEntitlementBinding(supplied);
  const currentness_ref = ref(input.currentness_ref, 'ENTITLEMENT_CURRENTNESS_REF_REQUIRED');
  const source_ref = ref(input.source_ref, 'ENTITLEMENT_SOURCE_REF_REQUIRED');
  const source_generation = ref(input.source_generation, 'ENTITLEMENT_SOURCE_GENERATION_REQUIRED');
  const readback_ref = ref(input.readback_ref, 'ENTITLEMENT_READBACK_REF_REQUIRED');
  const readback_generation = ref(input.readback_generation, 'ENTITLEMENT_READBACK_GENERATION_REQUIRED');
  const observed_at = iso(input.observed_at, 'ENTITLEMENT_OBSERVED_AT_REQUIRED');
  const derived = deriveCurrent(binding, source_generation, readback_generation, observed_at);
  return Object.freeze({
    schema: PRODUCT_ENTITLEMENT_CURRENTNESS_SCHEMA,
    currentness_ref,
    entitlement_ref: binding.entitlement_ref,
    entitlement_generation: binding.entitlement_generation,
    source_ref,
    source_generation,
    readback_ref,
    readback_generation,
    observed_at,
    ...derived,
    state: derived.current ? 'CURRENT' : 'STALE',
    verification_scope: 'SUPPLIED_GENERATION_AND_TIME_COMPARISON',
    provider_authenticated: false,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
  });
}

export function resolveProductEntitlementScope(input = {}) {
  assertEntitlementCredentialFree(input);
  const supplied = input.binding;
  const currentness = input.currentness;
  if (supplied?.schema !== PRODUCT_ENTITLEMENT_BINDING_SCHEMA) fail('ENTITLEMENT_BINDING_REQUIRED');
  if (currentness?.schema !== PRODUCT_ENTITLEMENT_CURRENTNESS_SCHEMA) fail('ENTITLEMENT_CURRENTNESS_REQUIRED');
  const binding = compileProductEntitlementBinding(supplied);
  const principal_ref = ref(input.principal_ref, 'ENTITLEMENT_PRINCIPAL_REF_REQUIRED');
  const tenant_ref = ref(input.tenant_ref, 'ENTITLEMENT_TENANT_REF_REQUIRED');
  const product_ref = ref(input.product_ref, 'ENTITLEMENT_PRODUCT_REF_REQUIRED');
  const api_declaration_ref = ref(input.api_declaration_ref, 'ENTITLEMENT_API_DECLARATION_REF_REQUIRED');
  const api_declaration_generation = ref(input.api_declaration_generation, 'ENTITLEMENT_API_DECLARATION_GENERATION_REQUIRED');
  const product_capability_ref = ref(input.product_capability_ref, 'PRODUCT_CAPABILITY_REF_REQUIRED');
  const operation_ref = ref(input.operation_ref, 'ENTITLEMENT_OPERATION_REF_REQUIRED');

  const blockers = [];
  if (binding.principal_ref !== principal_ref) blockers.push('ENTITLEMENT_PRINCIPAL_MISMATCH');
  if (binding.tenant_ref !== tenant_ref) blockers.push('ENTITLEMENT_TENANT_MISMATCH');
  if (binding.product_ref !== product_ref) blockers.push('ENTITLEMENT_PRODUCT_MISMATCH');
  if (binding.api_declaration_ref !== api_declaration_ref || binding.api_declaration_generation !== api_declaration_generation) {
    blockers.push('ENTITLEMENT_API_DECLARATION_MISMATCH');
  }

  let canonicalCurrentness = null;
  try {
    canonicalCurrentness = compileProductEntitlementCurrentness({
      binding,
      currentness_ref: currentness.currentness_ref,
      source_ref: currentness.source_ref,
      source_generation: currentness.source_generation,
      readback_ref: currentness.readback_ref,
      readback_generation: currentness.readback_generation,
      observed_at: currentness.observed_at,
    });
  } catch {
    canonicalCurrentness = null;
  }
  const derived = canonicalCurrentness ?? {
    generation_current: false,
    temporal_current: false,
    state_current: false,
    current: false,
    state: 'STALE',
  };
  const currentnessShapeValid =
    canonicalCurrentness !== null &&
    currentness.entitlement_ref === binding.entitlement_ref &&
    currentness.entitlement_generation === binding.entitlement_generation &&
    currentness.generation_current === derived.generation_current &&
    currentness.temporal_current === derived.temporal_current &&
    currentness.state_current === derived.state_current &&
    currentness.current === derived.current &&
    currentness.state === derived.state &&
    currentness.verification_scope === 'SUPPLIED_GENERATION_AND_TIME_COMPARISON' &&
    currentness.provider_authenticated === false &&
    currentness.authority_granted === false &&
    currentness.provider_effect === false &&
    currentness.billing_effect === false &&
    currentness.effect_authority === false &&
    currentness.currentness_ref === canonicalCurrentness.currentness_ref &&
    currentness.source_ref === canonicalCurrentness.source_ref &&
    currentness.readback_ref === canonicalCurrentness.readback_ref;
  if (!currentnessShapeValid) blockers.push('ENTITLEMENT_CURRENTNESS_MISMATCH');
  else if (!derived.current) blockers.push('ENTITLEMENT_NOT_CURRENT');

  const scope = binding.scopes.find((candidate) => candidate.product_capability_ref === product_capability_ref);
  if (!scope || !scope.operation_refs.includes(operation_ref)) blockers.push('ENTITLEMENT_SCOPE_NOT_GRANTED');

  return Object.freeze({
    state: blockers.length === 0 ? 'ENTITLED_CURRENT' : 'REFUSED',
    matched: blockers.length === 0,
    blockers: Object.freeze(blockers),
    entitlement_ref: binding.entitlement_ref,
    entitlement_generation: binding.entitlement_generation,
    currentness_ref: currentness.currentness_ref,
    principal_ref,
    tenant_ref,
    product_ref,
    api_declaration_ref,
    api_declaration_generation,
    product_capability_ref,
    operation_ref,
    entitlement_capability_ref: scope?.entitlement_capability_ref ?? null,
    tier: binding.tier,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
  });
}
