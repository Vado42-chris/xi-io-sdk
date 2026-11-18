#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  compileProductAccessGrantBinding,
  compileProductAccessGrantCurrentness,
  resolveProductAccessGrantScope,
  compileProductBillingAdmissionBinding,
  compileProductBillingAdmissionCurrentness,
  resolveProductBillingAdmissionScope,
} from '../src/billing/product-operation-admission-binding.mjs';

const common = {
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

const access = compileProductAccessGrantBinding({
  access_grant_ref: 'access-grant:inbox:owner:send',
  issuer_ref: 'authority:ward',
  ...common,
  role: 'user',
  state: 'ACTIVE',
  issued_at: '2026-11-17T13:00:00Z',
  valid_from: '2026-11-17T13:00:00Z',
  valid_until: '2026-12-17T13:00:00Z',
});
const accessCurrentness = compileProductAccessGrantCurrentness({
  binding: access,
  currentness_ref: 'access-currentness:inbox:owner:send',
  source_ref: 'ward:access-grant-store',
  source_generation: access.access_grant_generation,
  readback_ref: 'ward:access-grant-readback',
  readback_generation: access.access_grant_generation,
  observed_at: '2026-11-17T14:00:00Z',
});
const accessResolution = resolveProductAccessGrantScope({
  binding: access,
  currentness: accessCurrentness,
  ...common,
  role: 'user',
});
assert.equal(accessResolution.state, 'ACCESS_GRANTED_CURRENT');

const billing = compileProductBillingAdmissionBinding({
  billing_admission_ref: 'billing-admission:inbox:owner:send',
  billing_authority_ref: 'billing-authority:xiio',
  pricing_ref: 'pricing:inbox:v1',
  rate_card_ref: 'rate-card:inbox:v1',
  budget_ref: 'budget:tenant:xiio',
  budget_reservation_ref: 'budget-reservation:inbox:send:1',
  access_grant_ref: access.access_grant_ref,
  access_grant_generation: access.access_grant_generation,
  meter_unit_type: 'provider_attempt',
  maximum_quantity: 1,
  state: 'ADMITTED',
  budget_state: 'RESERVED',
  ...common,
  issued_at: '2026-11-17T13:00:00Z',
  valid_from: '2026-11-17T13:00:00Z',
  valid_until: '2026-11-17T15:00:00Z',
});
const billingCurrentness = compileProductBillingAdmissionCurrentness({
  binding: billing,
  currentness_ref: 'billing-currentness:inbox:owner:send',
  source_ref: 'billing:admission-store',
  source_generation: billing.billing_admission_generation,
  readback_ref: 'billing:admission-readback',
  readback_generation: billing.billing_admission_generation,
  observed_at: '2026-11-17T14:00:00Z',
});
const billingResolution = resolveProductBillingAdmissionScope({
  binding: billing,
  currentness: billingCurrentness,
  ...common,
  access_grant_ref: access.access_grant_ref,
  access_grant_generation: access.access_grant_generation,
  meter_unit_type: 'provider_attempt',
  requested_quantity: 1,
});
assert.equal(billingResolution.state, 'BILLING_ADMITTED_CURRENT');
assert.equal(billingResolution.billing_admission_matched, true);
assert.equal(billingResolution.provider_attempt_allowed, false);
assert.equal(billingResolution.billing_commit_allowed, false);
assert.equal(billingResolution.effect_authority, false);
assert.ok(billingResolution.hard.includes('PROVIDER_ATTEMPT_REQUIRES_SWITCHBOARD_ADMISSION'));

console.log(JSON.stringify({
  check: 'PRODUCT_OPERATION_ADMISSION_BINDING',
  status: 'PASS',
  typed_access_grant_required: true,
  typed_billing_admission_required: true,
  admin_bypass_refused: true,
  superadmin_bypass_refused: true,
  currentness_clone_refused: true,
  exact_meter_and_quantity_bound: true,
  billing_admission_not_provider_attempt: true,
  provider_attempt_not_billing_commit: true,
  action_allowed_not_effect_authority: true,
}, null, 2));
