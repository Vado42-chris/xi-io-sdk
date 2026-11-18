import { createHash } from 'node:crypto';
import { assertCredentialFreeRecord } from '../identity/account-binding.mjs';

export const PRODUCT_ACCESS_GRANT_BINDING_SCHEMA = 'xiio.sdk.product-access-grant-binding/v1';
export const PRODUCT_ACCESS_GRANT_CURRENTNESS_SCHEMA = 'xiio.sdk.product-access-grant-currentness/v1';
export const PRODUCT_BILLING_ADMISSION_BINDING_SCHEMA = 'xiio.sdk.product-billing-admission-binding/v1';
export const PRODUCT_BILLING_ADMISSION_CURRENTNESS_SCHEMA = 'xiio.sdk.product-billing-admission-currentness/v1';

const ACCESS_STATES = new Set(['ACTIVE', 'PENDING', 'SUSPENDED', 'REVOKED', 'EXPIRED']);
const BILLING_STATES = new Set(['ADMITTED', 'PENDING', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'BUDGET_EXCEEDED']);
const BUDGET_STATES = new Set(['RESERVED', 'MISSING', 'EXCEEDED']);
const ROLES = new Set(['user', 'admin', 'superadmin', 'service']);
const SECRET_KEY = /token|password|secret|credential|api.?key|authorization/i;
const ACCESS_CURRENTNESS_BRAND = new WeakSet();
const BILLING_CURRENTNESS_BRAND = new WeakSet();

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

function positiveNumber(value, code) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(code);
  return value;
}

function credentialFree(value, prefix) {
  assertCredentialFreeRecord(value, {
    secretKeyPattern: SECRET_KEY,
    secretCode: `${prefix}_SECRET_FIELD_REFUSED`,
    accessorCode: `${prefix}_ACCESSOR_FIELD_REFUSED`,
  });
}

function temporalFields(input, prefix) {
  const issued_at = iso(input.issued_at, `${prefix}_ISSUED_AT_REQUIRED`);
  const valid_from = iso(input.valid_from, `${prefix}_VALID_FROM_REQUIRED`);
  const valid_until = input.valid_until === null || input.valid_until === undefined
    ? null
    : iso(input.valid_until, `${prefix}_VALID_UNTIL_INVALID`);
  if (Date.parse(valid_from) < Date.parse(issued_at)) fail(`${prefix}_VALID_FROM_BEFORE_ISSUED`);
  if (valid_until !== null && Date.parse(valid_until) <= Date.parse(valid_from)) fail(`${prefix}_VALID_WINDOW_INVALID`);
  return { issued_at, valid_from, valid_until };
}

function digest(schema, value) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ schema, ...value })).digest('hex')}`;
}

function deriveCurrent(binding, sourceGeneration, readbackGeneration, observedAt, activeState, budgetRequired = false) {
  const observed = Date.parse(observedAt);
  const validFrom = Date.parse(binding.valid_from);
  const validUntil = binding.valid_until === null ? null : Date.parse(binding.valid_until);
  const generation_current = sourceGeneration === binding.generation && readbackGeneration === binding.generation;
  const temporal_current = observed >= validFrom && (validUntil === null || observed < validUntil);
  const state_current = binding.state === activeState;
  const budget_current = !budgetRequired || binding.budget_state === 'RESERVED';
  return {
    generation_current,
    temporal_current,
    state_current,
    budget_current,
    current: generation_current && temporal_current && state_current && budget_current,
  };
}

function commonOperationScope(input, prefix) {
  return {
    principal_ref: ref(input.principal_ref, `${prefix}_PRINCIPAL_REF_REQUIRED`),
    tenant_ref: ref(input.tenant_ref, `${prefix}_TENANT_REF_REQUIRED`),
    product_ref: ref(input.product_ref, `${prefix}_PRODUCT_REF_REQUIRED`),
    api_declaration_ref: ref(input.api_declaration_ref, `${prefix}_API_DECLARATION_REF_REQUIRED`),
    api_declaration_generation: ref(input.api_declaration_generation, `${prefix}_API_DECLARATION_GENERATION_REQUIRED`),
    product_capability_ref: ref(input.product_capability_ref, `${prefix}_PRODUCT_CAPABILITY_REF_REQUIRED`),
    operation_ref: ref(input.operation_ref, `${prefix}_OPERATION_REF_REQUIRED`),
    entitlement_ref: ref(input.entitlement_ref, `${prefix}_ENTITLEMENT_REF_REQUIRED`),
    entitlement_generation: ref(input.entitlement_generation, `${prefix}_ENTITLEMENT_GENERATION_REQUIRED`),
  };
}

function canonicalAccessGrant(input = {}) {
  credentialFree(input, 'PRODUCT_ACCESS_GRANT');
  const scope = commonOperationScope(input, 'ACCESS_GRANT');
  const role = ref(input.role, 'ACCESS_GRANT_ROLE_REQUIRED', 32);
  if (!ROLES.has(role)) fail('ACCESS_GRANT_ROLE_INVALID');
  const state = input.state;
  if (!ACCESS_STATES.has(state)) fail('ACCESS_GRANT_STATE_INVALID');
  return {
    schema: PRODUCT_ACCESS_GRANT_BINDING_SCHEMA,
    access_grant_ref: ref(input.access_grant_ref, 'ACCESS_GRANT_REF_REQUIRED'),
    issuer_ref: ref(input.issuer_ref, 'ACCESS_GRANT_ISSUER_REF_REQUIRED'),
    ...scope,
    role,
    state,
    ...temporalFields(input, 'ACCESS_GRANT'),
  };
}

export function compileProductAccessGrantBinding(input = {}) {
  const canonical = canonicalAccessGrant(input);
  const access_grant_generation = digest(PRODUCT_ACCESS_GRANT_BINDING_SCHEMA, {
    access_grant_ref: canonical.access_grant_ref,
    issuer_ref: canonical.issuer_ref,
    principal_ref: canonical.principal_ref,
    tenant_ref: canonical.tenant_ref,
    product_ref: canonical.product_ref,
    api_declaration_ref: canonical.api_declaration_ref,
    api_declaration_generation: canonical.api_declaration_generation,
    product_capability_ref: canonical.product_capability_ref,
    operation_ref: canonical.operation_ref,
    entitlement_ref: canonical.entitlement_ref,
    entitlement_generation: canonical.entitlement_generation,
    role: canonical.role,
    state: canonical.state,
    issued_at: canonical.issued_at,
    valid_from: canonical.valid_from,
    valid_until: canonical.valid_until,
  });
  if (input.access_grant_generation !== undefined && input.access_grant_generation !== access_grant_generation) {
    fail('ACCESS_GRANT_GENERATION_MISMATCH');
  }
  return Object.freeze({
    ...canonical,
    access_grant_generation,
    generation: access_grant_generation,
    action_allowed: false,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
    hard: Object.freeze([
      'ROLE_ELIGIBLE!=ACCESS_GRANTED',
      'ADMIN_ROLE!=ACCESS_GRANT',
      'SUPERADMIN_ROLE!=ACCESS_GRANT',
      'ACCESS_GRANT!=ENTITLEMENT',
      'ACCESS_GRANT!=BILLING_ADMISSION',
      'ACCESS_GRANT!=EFFECT_AUTHORITY',
      'ACCESS_GRANT_IS_OPERATION_AND_DECLARATION_GENERATION_BOUND',
      'ACCESS_GRANT_RECORD!=CREDENTIAL_STORE',
    ]),
  });
}

export function compileProductAccessGrantCurrentness(input = {}) {
  credentialFree(input, 'PRODUCT_ACCESS_GRANT_CURRENTNESS');
  if (input.binding?.schema !== PRODUCT_ACCESS_GRANT_BINDING_SCHEMA) fail('ACCESS_GRANT_BINDING_REQUIRED');
  const binding = compileProductAccessGrantBinding(input.binding);
  const currentness_ref = ref(input.currentness_ref, 'ACCESS_GRANT_CURRENTNESS_REF_REQUIRED');
  const source_ref = ref(input.source_ref, 'ACCESS_GRANT_SOURCE_REF_REQUIRED');
  const source_generation = ref(input.source_generation, 'ACCESS_GRANT_SOURCE_GENERATION_REQUIRED');
  const readback_ref = ref(input.readback_ref, 'ACCESS_GRANT_READBACK_REF_REQUIRED');
  const readback_generation = ref(input.readback_generation, 'ACCESS_GRANT_READBACK_GENERATION_REQUIRED');
  const observed_at = iso(input.observed_at, 'ACCESS_GRANT_OBSERVED_AT_REQUIRED');
  const derived = deriveCurrent(binding, source_generation, readback_generation, observed_at, 'ACTIVE');
  const currentness = Object.freeze({
    schema: PRODUCT_ACCESS_GRANT_CURRENTNESS_SCHEMA,
    currentness_ref,
    access_grant_ref: binding.access_grant_ref,
    access_grant_generation: binding.access_grant_generation,
    source_ref,
    source_generation,
    readback_ref,
    readback_generation,
    observed_at,
    generation_current: derived.generation_current,
    temporal_current: derived.temporal_current,
    state_current: derived.state_current,
    current: derived.current,
    state: derived.current ? 'CURRENT' : 'STALE',
    verification_scope: 'SDK_EXACT_GENERATION_READBACK',
    action_allowed: false,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
  });
  ACCESS_CURRENTNESS_BRAND.add(currentness);
  return currentness;
}

export function resolveProductAccessGrantScope(input = {}) {
  credentialFree(input, 'PRODUCT_ACCESS_GRANT_RESOLUTION');
  if (input.binding?.schema !== PRODUCT_ACCESS_GRANT_BINDING_SCHEMA) fail('ACCESS_GRANT_BINDING_REQUIRED');
  if (input.currentness?.schema !== PRODUCT_ACCESS_GRANT_CURRENTNESS_SCHEMA) fail('ACCESS_GRANT_CURRENTNESS_REQUIRED');
  const binding = compileProductAccessGrantBinding(input.binding);
  const currentness = input.currentness;
  const expected = commonOperationScope(input, 'ACCESS_GRANT');
  const role = ref(input.role, 'ACCESS_GRANT_ROLE_REQUIRED', 32);
  if (!ROLES.has(role)) fail('ACCESS_GRANT_ROLE_INVALID');
  const blockers = [];
  for (const key of ['principal_ref', 'tenant_ref', 'product_ref', 'api_declaration_ref', 'api_declaration_generation', 'product_capability_ref', 'operation_ref']) {
    if (binding[key] !== expected[key]) blockers.push(`ACCESS_GRANT_${key.toUpperCase()}_MISMATCH`);
  }
  if (binding.entitlement_ref !== expected.entitlement_ref || binding.entitlement_generation !== expected.entitlement_generation) {
    blockers.push('ACCESS_GRANT_ENTITLEMENT_MISMATCH');
  }
  if (binding.role !== role) blockers.push('ACCESS_GRANT_ROLE_MISMATCH');
  if (!ACCESS_CURRENTNESS_BRAND.has(currentness)) blockers.push('ACCESS_GRANT_CURRENTNESS_UNVERIFIED');
  else {
    const canonical = compileProductAccessGrantCurrentness({
      binding,
      currentness_ref: currentness.currentness_ref,
      source_ref: currentness.source_ref,
      source_generation: currentness.source_generation,
      readback_ref: currentness.readback_ref,
      readback_generation: currentness.readback_generation,
      observed_at: currentness.observed_at,
    });
    const shape = currentness.access_grant_ref === canonical.access_grant_ref
      && currentness.access_grant_generation === canonical.access_grant_generation
      && currentness.generation_current === canonical.generation_current
      && currentness.temporal_current === canonical.temporal_current
      && currentness.state_current === canonical.state_current
      && currentness.current === canonical.current
      && currentness.state === canonical.state
      && currentness.verification_scope === canonical.verification_scope
      && currentness.action_allowed === false
      && currentness.authority_granted === false
      && currentness.provider_effect === false
      && currentness.billing_effect === false
      && currentness.effect_authority === false;
    if (!shape) blockers.push('ACCESS_GRANT_CURRENTNESS_MISMATCH');
    else if (!canonical.current) blockers.push('ACCESS_GRANT_NOT_CURRENT');
  }
  return Object.freeze({
    schema: 'xiio.sdk.product-access-grant-resolution/v1',
    state: blockers.length === 0 ? 'ACCESS_GRANTED_CURRENT' : 'REFUSED',
    matched: blockers.length === 0,
    blockers: Object.freeze(blockers),
    access_grant_ref: binding.access_grant_ref,
    access_grant_generation: binding.access_grant_generation,
    currentness_ref: currentness.currentness_ref,
    ...expected,
    role,
    action_allowed: blockers.length === 0,
    authority_granted: false,
    provider_effect: false,
    billing_effect: false,
    effect_authority: false,
  });
}

function canonicalBillingAdmission(input = {}) {
  credentialFree(input, 'PRODUCT_BILLING_ADMISSION');
  const scope = commonOperationScope(input, 'BILLING_ADMISSION');
  const state = input.state;
  if (!BILLING_STATES.has(state)) fail('BILLING_ADMISSION_STATE_INVALID');
  const budget_state = input.budget_state;
  if (!BUDGET_STATES.has(budget_state)) fail('BILLING_BUDGET_STATE_INVALID');
  return {
    schema: PRODUCT_BILLING_ADMISSION_BINDING_SCHEMA,
    billing_admission_ref: ref(input.billing_admission_ref, 'BILLING_ADMISSION_REF_REQUIRED'),
    billing_authority_ref: ref(input.billing_authority_ref, 'BILLING_AUTHORITY_REF_REQUIRED'),
    pricing_ref: ref(input.pricing_ref, 'BILLING_PRICING_REF_REQUIRED'),
    rate_card_ref: ref(input.rate_card_ref, 'BILLING_RATE_CARD_REF_REQUIRED'),
    budget_ref: ref(input.budget_ref, 'BILLING_BUDGET_REF_REQUIRED'),
    budget_reservation_ref: ref(input.budget_reservation_ref, 'BILLING_BUDGET_RESERVATION_REF_REQUIRED'),
    access_grant_ref: ref(input.access_grant_ref, 'BILLING_ACCESS_GRANT_REF_REQUIRED'),
    access_grant_generation: ref(input.access_grant_generation, 'BILLING_ACCESS_GRANT_GENERATION_REQUIRED'),
    meter_unit_type: ref(input.meter_unit_type, 'BILLING_METER_UNIT_TYPE_REQUIRED', 128),
    maximum_quantity: positiveNumber(input.maximum_quantity, 'BILLING_MAXIMUM_QUANTITY_INVALID'),
    state,
    budget_state,
    ...scope,
    ...temporalFields(input, 'BILLING_ADMISSION'),
  };
}

export function compileProductBillingAdmissionBinding(input = {}) {
  const canonical = canonicalBillingAdmission(input);
  const billing_admission_generation = digest(PRODUCT_BILLING_ADMISSION_BINDING_SCHEMA, {
    billing_admission_ref: canonical.billing_admission_ref,
    billing_authority_ref: canonical.billing_authority_ref,
    pricing_ref: canonical.pricing_ref,
    rate_card_ref: canonical.rate_card_ref,
    budget_ref: canonical.budget_ref,
    budget_reservation_ref: canonical.budget_reservation_ref,
    access_grant_ref: canonical.access_grant_ref,
    access_grant_generation: canonical.access_grant_generation,
    meter_unit_type: canonical.meter_unit_type,
    maximum_quantity: canonical.maximum_quantity,
    state: canonical.state,
    budget_state: canonical.budget_state,
    principal_ref: canonical.principal_ref,
    tenant_ref: canonical.tenant_ref,
    product_ref: canonical.product_ref,
    api_declaration_ref: canonical.api_declaration_ref,
    api_declaration_generation: canonical.api_declaration_generation,
    product_capability_ref: canonical.product_capability_ref,
    operation_ref: canonical.operation_ref,
    entitlement_ref: canonical.entitlement_ref,
    entitlement_generation: canonical.entitlement_generation,
    issued_at: canonical.issued_at,
    valid_from: canonical.valid_from,
    valid_until: canonical.valid_until,
  });
  if (input.billing_admission_generation !== undefined && input.billing_admission_generation !== billing_admission_generation) {
    fail('BILLING_ADMISSION_GENERATION_MISMATCH');
  }
  return Object.freeze({
    ...canonical,
    billing_admission_generation,
    generation: billing_admission_generation,
    provider_attempt_allowed: false,
    billing_commit_allowed: false,
    billing_effect_authority: false,
    provider_effect: false,
    effect_authority: false,
    hard: Object.freeze([
      'BILLING_ADMISSION!=PROVIDER_ATTEMPT',
      'BILLING_ADMISSION!=MONEY',
      'BUDGET_RESERVED!=BILLING_COMMITTED',
      'METER_EVENT!=MONEY',
      'BILLING_ADMISSION!=EFFECT_AUTHORITY',
      'ADMIN_ROLE!=BILLING_ADMISSION',
      'SUPERADMIN_ROLE!=BILLING_ADMISSION',
      'BILLING_ADMISSION_IS_ACCESS_GRANT_AND_ENTITLEMENT_BOUND',
      'BILLING_ADMISSION_RECORD!=CREDENTIAL_STORE',
    ]),
  });
}

export function compileProductBillingAdmissionCurrentness(input = {}) {
  credentialFree(input, 'PRODUCT_BILLING_ADMISSION_CURRENTNESS');
  if (input.binding?.schema !== PRODUCT_BILLING_ADMISSION_BINDING_SCHEMA) fail('BILLING_ADMISSION_BINDING_REQUIRED');
  const binding = compileProductBillingAdmissionBinding(input.binding);
  const currentness_ref = ref(input.currentness_ref, 'BILLING_CURRENTNESS_REF_REQUIRED');
  const source_ref = ref(input.source_ref, 'BILLING_SOURCE_REF_REQUIRED');
  const source_generation = ref(input.source_generation, 'BILLING_SOURCE_GENERATION_REQUIRED');
  const readback_ref = ref(input.readback_ref, 'BILLING_READBACK_REF_REQUIRED');
  const readback_generation = ref(input.readback_generation, 'BILLING_READBACK_GENERATION_REQUIRED');
  const observed_at = iso(input.observed_at, 'BILLING_OBSERVED_AT_REQUIRED');
  const derived = deriveCurrent(binding, source_generation, readback_generation, observed_at, 'ADMITTED', true);
  const currentness = Object.freeze({
    schema: PRODUCT_BILLING_ADMISSION_CURRENTNESS_SCHEMA,
    currentness_ref,
    billing_admission_ref: binding.billing_admission_ref,
    billing_admission_generation: binding.billing_admission_generation,
    source_ref,
    source_generation,
    readback_ref,
    readback_generation,
    observed_at,
    generation_current: derived.generation_current,
    temporal_current: derived.temporal_current,
    state_current: derived.state_current,
    budget_current: derived.budget_current,
    current: derived.current,
    state: derived.current ? 'CURRENT' : 'STALE',
    verification_scope: 'SDK_EXACT_GENERATION_READBACK',
    provider_attempt_allowed: false,
    billing_commit_allowed: false,
    billing_effect_authority: false,
    provider_effect: false,
    effect_authority: false,
  });
  BILLING_CURRENTNESS_BRAND.add(currentness);
  return currentness;
}

export function resolveProductBillingAdmissionScope(input = {}) {
  credentialFree(input, 'PRODUCT_BILLING_ADMISSION_RESOLUTION');
  if (input.binding?.schema !== PRODUCT_BILLING_ADMISSION_BINDING_SCHEMA) fail('BILLING_ADMISSION_BINDING_REQUIRED');
  if (input.currentness?.schema !== PRODUCT_BILLING_ADMISSION_CURRENTNESS_SCHEMA) fail('BILLING_ADMISSION_CURRENTNESS_REQUIRED');
  const binding = compileProductBillingAdmissionBinding(input.binding);
  const currentness = input.currentness;
  const expected = commonOperationScope(input, 'BILLING_ADMISSION');
  const access_grant_ref = ref(input.access_grant_ref, 'BILLING_ACCESS_GRANT_REF_REQUIRED');
  const access_grant_generation = ref(input.access_grant_generation, 'BILLING_ACCESS_GRANT_GENERATION_REQUIRED');
  const meter_unit_type = ref(input.meter_unit_type, 'BILLING_METER_UNIT_TYPE_REQUIRED', 128);
  const requested_quantity = positiveNumber(input.requested_quantity, 'BILLING_REQUESTED_QUANTITY_INVALID');
  const blockers = [];
  for (const key of ['principal_ref', 'tenant_ref', 'product_ref', 'api_declaration_ref', 'api_declaration_generation', 'product_capability_ref', 'operation_ref']) {
    if (binding[key] !== expected[key]) blockers.push(`BILLING_ADMISSION_${key.toUpperCase()}_MISMATCH`);
  }
  if (binding.entitlement_ref !== expected.entitlement_ref || binding.entitlement_generation !== expected.entitlement_generation) {
    blockers.push('BILLING_ADMISSION_ENTITLEMENT_MISMATCH');
  }
  if (binding.access_grant_ref !== access_grant_ref || binding.access_grant_generation !== access_grant_generation) {
    blockers.push('BILLING_ADMISSION_ACCESS_GRANT_MISMATCH');
  }
  if (binding.meter_unit_type !== meter_unit_type) blockers.push('BILLING_ADMISSION_METER_UNIT_MISMATCH');
  if (requested_quantity > binding.maximum_quantity) blockers.push('BILLING_ADMISSION_QUANTITY_EXCEEDED');
  if (!BILLING_CURRENTNESS_BRAND.has(currentness)) blockers.push('BILLING_ADMISSION_CURRENTNESS_UNVERIFIED');
  else {
    const canonical = compileProductBillingAdmissionCurrentness({
      binding,
      currentness_ref: currentness.currentness_ref,
      source_ref: currentness.source_ref,
      source_generation: currentness.source_generation,
      readback_ref: currentness.readback_ref,
      readback_generation: currentness.readback_generation,
      observed_at: currentness.observed_at,
    });
    const shape = currentness.billing_admission_ref === canonical.billing_admission_ref
      && currentness.billing_admission_generation === canonical.billing_admission_generation
      && currentness.generation_current === canonical.generation_current
      && currentness.temporal_current === canonical.temporal_current
      && currentness.state_current === canonical.state_current
      && currentness.budget_current === canonical.budget_current
      && currentness.current === canonical.current
      && currentness.state === canonical.state
      && currentness.verification_scope === canonical.verification_scope
      && currentness.provider_attempt_allowed === false
      && currentness.billing_commit_allowed === false
      && currentness.billing_effect_authority === false
      && currentness.provider_effect === false
      && currentness.effect_authority === false;
    if (!shape) blockers.push('BILLING_ADMISSION_CURRENTNESS_MISMATCH');
    else if (!canonical.current) blockers.push('BILLING_ADMISSION_NOT_CURRENT');
  }
  return Object.freeze({
    schema: 'xiio.sdk.product-billing-admission-resolution/v1',
    state: blockers.length === 0 ? 'BILLING_ADMITTED_CURRENT' : 'REFUSED',
    matched: blockers.length === 0,
    blockers: Object.freeze(blockers),
    billing_admission_ref: binding.billing_admission_ref,
    billing_admission_generation: binding.billing_admission_generation,
    currentness_ref: currentness.currentness_ref,
    billing_authority_ref: binding.billing_authority_ref,
    pricing_ref: binding.pricing_ref,
    rate_card_ref: binding.rate_card_ref,
    budget_ref: binding.budget_ref,
    budget_reservation_ref: binding.budget_reservation_ref,
    access_grant_ref,
    access_grant_generation,
    meter_unit_type,
    requested_quantity,
    maximum_quantity: binding.maximum_quantity,
    ...expected,
    billing_admission_matched: blockers.length === 0,
    provider_attempt_allowed: false,
    billing_commit_allowed: false,
    billing_effect_authority: false,
    provider_effect: false,
    effect_authority: false,
    hard: Object.freeze([
      'BILLING_ADMISSION_MATCH!=PROVIDER_ATTEMPT',
      'BILLING_ADMISSION_MATCH!=BILLING_COMMIT',
      'BILLING_ADMISSION_MATCH!=EFFECT_AUTHORITY',
      'PROVIDER_ATTEMPT_REQUIRES_SWITCHBOARD_ADMISSION',
    ]),
  });
}
