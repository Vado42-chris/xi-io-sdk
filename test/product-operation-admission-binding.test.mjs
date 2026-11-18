import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileProductAccessGrantBinding,
  compileProductAccessGrantCurrentness,
  resolveProductAccessGrantScope,
  compileProductBillingAdmissionBinding,
  compileProductBillingAdmissionCurrentness,
  resolveProductBillingAdmissionScope,
} from '../src/billing/product-operation-admission-binding.mjs';

const scope = {
  principal_ref: 'principal:owner',
  tenant_ref: 'tenant:xiio',
  product_ref: 'product:inbox',
  api_declaration_ref: 'api-declaration:inbox:v1',
  api_declaration_generation: `sha256:${'a'.repeat(64)}`,
  product_capability_ref: 'mail-egress',
  operation_ref: 'mail:outbox-dispatch',
  entitlement_ref: 'entitlement:inbox:owner',
  entitlement_generation: `sha256:${'b'.repeat(64)}`,
};

function access(overrides = {}) {
  return compileProductAccessGrantBinding({
    access_grant_ref: 'access-grant:inbox:owner:send',
    issuer_ref: 'authority:ward',
    ...scope,
    role: 'user',
    state: 'ACTIVE',
    issued_at: '2026-11-17T13:00:00Z',
    valid_from: '2026-11-17T13:00:00Z',
    valid_until: '2026-12-17T13:00:00Z',
    ...overrides,
  });
}

function accessCurrent(binding, overrides = {}) {
  return compileProductAccessGrantCurrentness({
    binding,
    currentness_ref: 'access-currentness:inbox:owner:send',
    source_ref: 'ward:access-grant-store',
    source_generation: binding.access_grant_generation,
    readback_ref: 'ward:access-grant-readback',
    readback_generation: binding.access_grant_generation,
    observed_at: '2026-11-17T14:00:00Z',
    ...overrides,
  });
}

function billing(grant, overrides = {}) {
  return compileProductBillingAdmissionBinding({
    billing_admission_ref: 'billing-admission:inbox:owner:send',
    billing_authority_ref: 'billing-authority:xiio',
    pricing_ref: 'pricing:inbox:v1',
    rate_card_ref: 'rate-card:inbox:v1',
    budget_ref: 'budget:tenant:xiio',
    budget_reservation_ref: 'budget-reservation:inbox:send:1',
    access_grant_ref: grant.access_grant_ref,
    access_grant_generation: grant.access_grant_generation,
    meter_unit_type: 'provider_attempt',
    maximum_quantity: 1,
    state: 'ADMITTED',
    budget_state: 'RESERVED',
    ...scope,
    issued_at: '2026-11-17T13:00:00Z',
    valid_from: '2026-11-17T13:00:00Z',
    valid_until: '2026-11-17T15:00:00Z',
    ...overrides,
  });
}

function billingCurrent(binding, overrides = {}) {
  return compileProductBillingAdmissionCurrentness({
    binding,
    currentness_ref: 'billing-currentness:inbox:owner:send',
    source_ref: 'billing:admission-store',
    source_generation: binding.billing_admission_generation,
    readback_ref: 'billing:admission-readback',
    readback_generation: binding.billing_admission_generation,
    observed_at: '2026-11-17T14:00:00Z',
    ...overrides,
  });
}

test('exact access and billing records match structurally without granting action, provider attempt, billing, or effect authority', () => {
  const grant = access();
  const grantCurrent = accessCurrent(grant);
  const granted = resolveProductAccessGrantScope({ binding: grant, currentness: grantCurrent, ...scope, role: 'user' });
  assert.equal(granted.state, 'ACCESS_GRANTED_CURRENT');
  assert.equal(granted.access_grant_matched, true);
  assert.equal(granted.action_allowed, false);
  assert.equal(granted.authority_granted, false);
  assert.equal(granted.effect_authority, false);

  const admission = billing(grant);
  const admitted = resolveProductBillingAdmissionScope({
    binding: admission,
    currentness: billingCurrent(admission),
    ...scope,
    access_grant_ref: grant.access_grant_ref,
    access_grant_generation: grant.access_grant_generation,
    meter_unit_type: 'provider_attempt',
    requested_quantity: 1,
  });
  assert.equal(admitted.state, 'BILLING_ADMITTED_CURRENT');
  assert.equal(admitted.billing_admission_matched, true);
  assert.equal(admitted.provider_attempt_allowed, false);
  assert.equal(admitted.billing_commit_allowed, false);
  assert.equal(admitted.billing_effect_authority, false);
  assert.equal(admitted.effect_authority, false);
});

test('admin and superadmin do not bypass exact role-bound access grants', () => {
  const grant = access({ role: 'user' });
  const currentness = accessCurrent(grant);
  for (const role of ['admin', 'superadmin']) {
    const out = resolveProductAccessGrantScope({ binding: grant, currentness, ...scope, role });
    assert.equal(out.state, 'REFUSED');
    assert.ok(out.blockers.includes('ACCESS_GRANT_ROLE_MISMATCH'));
  }
});

test('cloned currentness cannot be used as live AccessGrant or billing proof', () => {
  const grant = access();
  let out = resolveProductAccessGrantScope({
    binding: grant,
    currentness: structuredClone(accessCurrent(grant)),
    ...scope,
    role: 'user',
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('ACCESS_GRANT_CURRENTNESS_UNVERIFIED'));

  const admission = billing(grant);
  out = resolveProductBillingAdmissionScope({
    binding: admission,
    currentness: structuredClone(billingCurrent(admission)),
    ...scope,
    access_grant_ref: grant.access_grant_ref,
    access_grant_generation: grant.access_grant_generation,
    meter_unit_type: 'provider_attempt',
    requested_quantity: 1,
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('BILLING_ADMISSION_CURRENTNESS_UNVERIFIED'));
});

test('entitlement, grant, meter and quantity substitutions fail closed', () => {
  const grant = access();
  let out = resolveProductAccessGrantScope({
    binding: grant,
    currentness: accessCurrent(grant),
    ...scope,
    entitlement_generation: `sha256:${'c'.repeat(64)}`,
    role: 'user',
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('ACCESS_GRANT_ENTITLEMENT_MISMATCH'));

  const admission = billing(grant);
  out = resolveProductBillingAdmissionScope({
    binding: admission,
    currentness: billingCurrent(admission),
    ...scope,
    access_grant_ref: grant.access_grant_ref,
    access_grant_generation: `sha256:${'d'.repeat(64)}`,
    meter_unit_type: 'model_operation',
    requested_quantity: 2,
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('BILLING_ADMISSION_ACCESS_GRANT_MISMATCH'));
  assert.ok(out.blockers.includes('BILLING_ADMISSION_METER_UNIT_MISMATCH'));
  assert.ok(out.blockers.includes('BILLING_ADMISSION_QUANTITY_EXCEEDED'));
});

test('revoked grants and exceeded budgets are not current', () => {
  const revoked = access({ state: 'REVOKED' });
  let out = resolveProductAccessGrantScope({
    binding: revoked,
    currentness: accessCurrent(revoked),
    ...scope,
    role: 'user',
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('ACCESS_GRANT_NOT_CURRENT'));

  const grant = access();
  const exceeded = billing(grant, { state: 'BUDGET_EXCEEDED', budget_state: 'EXCEEDED' });
  out = resolveProductBillingAdmissionScope({
    binding: exceeded,
    currentness: billingCurrent(exceeded),
    ...scope,
    access_grant_ref: grant.access_grant_ref,
    access_grant_generation: grant.access_grant_generation,
    meter_unit_type: 'provider_attempt',
    requested_quantity: 1,
  });
  assert.equal(out.state, 'REFUSED');
  assert.ok(out.blockers.includes('BILLING_ADMISSION_NOT_CURRENT'));
});

test('secret-bearing and accessor-bearing records are refused', () => {
  assert.throws(() => compileProductAccessGrantBinding({ access_token: 'secret', access_grant_ref: 'a' }), /PRODUCT_ACCESS_GRANT_SECRET_FIELD_REFUSED/);
  const hidden = {};
  Object.defineProperty(hidden, 'authorization', { enumerable: false, value: 'hidden-secret' });
  assert.throws(() => compileProductBillingAdmissionBinding(hidden), /PRODUCT_BILLING_ADMISSION_SECRET_FIELD_REFUSED/);
});
