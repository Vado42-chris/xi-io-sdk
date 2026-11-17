import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileProductEntitlementBinding,
  compileProductEntitlementCurrentness,
  resolveProductEntitlementScope,
} from '../src/billing/product-entitlement-binding.mjs';

const baseInput = {
  entitlement_ref: 'entitlement:sam-law:customer-1',
  principal_ref: 'customer:1',
  tenant_ref: 'tenant:1',
  product_ref: 'product:sam-law',
  api_declaration_ref: 'api-declaration:sam-law:v1',
  api_declaration_generation: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  tier: 'orchestrated',
  state: 'ACTIVE',
  issued_at: '2026-11-17T10:00:00Z',
  valid_from: '2026-11-17T10:00:00Z',
  valid_until: '2026-12-17T10:00:00Z',
  scopes: [
    { entitlement_capability_ref: 'documents', product_capability_ref: 'documents', operation_refs: ['document:read'] },
    { entitlement_capability_ref: 'ai', product_capability_ref: 'agent-conversation', operation_refs: ['conversation:ask'] },
  ],
};

function currentness(binding, overrides = {}) {
  return compileProductEntitlementCurrentness({
    binding,
    currentness_ref: 'entitlement-currentness:1',
    source_ref: 'billing-ledger:entitlements',
    source_generation: binding.entitlement_generation,
    readback_ref: 'readback:entitlement-1',
    readback_generation: binding.entitlement_generation,
    observed_at: '2026-11-17T11:00:00Z',
    ...overrides,
  });
}

test('binds orchestrated tier to exact product capability and operation scopes', () => {
  const binding = compileProductEntitlementBinding(baseInput);
  const observed = currentness(binding);
  const result = resolveProductEntitlementScope({
    binding,
    currentness: observed,
    principal_ref: 'customer:1',
    tenant_ref: 'tenant:1',
    product_ref: 'product:sam-law',
    api_declaration_ref: baseInput.api_declaration_ref,
    api_declaration_generation: baseInput.api_declaration_generation,
    product_capability_ref: 'agent-conversation',
    operation_ref: 'conversation:ask',
  });
  assert.equal(result.matched, true);
  assert.equal(result.entitlement_capability_ref, 'ai');
  assert.equal(result.authority_granted, false);
  assert.equal(result.billing_effect, false);
});

test('free tier admits whole software capability but not AI scope', () => {
  const free = compileProductEntitlementBinding({
    ...baseInput,
    entitlement_ref: 'entitlement:studio:free',
    product_ref: 'product:studio',
    tier: 'free',
    scopes: [{ entitlement_capability_ref: 'documents', product_capability_ref: 'documents', operation_refs: ['document:read'] }],
  });
  assert.equal(free.tier_scope_admitted, true);
  assert.throws(() => compileProductEntitlementBinding({
    ...baseInput,
    tier: 'free',
    scopes: [{ entitlement_capability_ref: 'ai', product_capability_ref: 'agent-conversation', operation_refs: ['conversation:ask'] }],
  }), /ENTITLEMENT_SCOPE_NOT_COVERED:ai/);
});

test('refuses principal tenant product and operation substitution', () => {
  const binding = compileProductEntitlementBinding(baseInput);
  const observed = currentness(binding);
  for (const [field, value, blocker] of [
    ['principal_ref', 'customer:2', 'ENTITLEMENT_PRINCIPAL_MISMATCH'],
    ['tenant_ref', 'tenant:2', 'ENTITLEMENT_TENANT_MISMATCH'],
    ['product_ref', 'product:other', 'ENTITLEMENT_PRODUCT_MISMATCH'],
  ]) {
    const result = resolveProductEntitlementScope({
      binding, currentness: observed,
      principal_ref: 'customer:1', tenant_ref: 'tenant:1', product_ref: 'product:sam-law',
      api_declaration_ref: baseInput.api_declaration_ref, api_declaration_generation: baseInput.api_declaration_generation,
      product_capability_ref: 'agent-conversation', operation_ref: 'conversation:ask',
      [field]: value,
    });
    assert.equal(result.matched, false);
    assert.ok(result.blockers.includes(blocker));
  }

  const wrongDeclaration = resolveProductEntitlementScope({
    binding, currentness: observed,
    principal_ref: 'customer:1', tenant_ref: 'tenant:1', product_ref: 'product:sam-law',
    api_declaration_ref: baseInput.api_declaration_ref,
    api_declaration_generation: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    product_capability_ref: 'agent-conversation', operation_ref: 'conversation:ask',
  });
  assert.equal(wrongDeclaration.matched, false);
  assert.ok(wrongDeclaration.blockers.includes('ENTITLEMENT_API_DECLARATION_MISMATCH'));

  const wrongOperation = resolveProductEntitlementScope({
    binding, currentness: observed,
    principal_ref: 'customer:1', tenant_ref: 'tenant:1', product_ref: 'product:sam-law',
    api_declaration_ref: baseInput.api_declaration_ref, api_declaration_generation: baseInput.api_declaration_generation,
    product_capability_ref: 'agent-conversation', operation_ref: 'conversation:delete',
  });
  assert.equal(wrongOperation.matched, false);
  assert.ok(wrongOperation.blockers.includes('ENTITLEMENT_SCOPE_NOT_GRANTED'));
});

test('canonical generation refuses scope tampering and duplicate ambiguity', () => {
  const binding = compileProductEntitlementBinding(baseInput);
  assert.match(binding.entitlement_generation, /^sha256:[a-f0-9]{64}$/);
  assert.match(binding.entitlement_policy_generation, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => compileProductEntitlementBinding({
    ...binding, entitlement_policy_generation: 'sha256:forged',
  }), /ENTITLEMENT_POLICY_GENERATION_MISMATCH/);
  assert.throws(() => compileProductEntitlementBinding({
    ...binding,
    scopes: binding.scopes.map((scope) => scope.product_capability_ref === 'agent-conversation'
      ? { ...scope, operation_refs: [...scope.operation_refs, 'conversation:delete'] }
      : scope),
  }), /ENTITLEMENT_GENERATION_MISMATCH/);
  assert.throws(() => compileProductEntitlementBinding({
    ...baseInput,
    scopes: [baseInput.scopes[0], { ...baseInput.scopes[1], product_capability_ref: 'documents' }],
  }), /PRODUCT_CAPABILITY_SCOPE_DUPLICATE/);
});

test('currentness is derived from exact generations state and time', () => {
  const binding = compileProductEntitlementBinding(baseInput);
  const stale = currentness(binding, { readback_generation: 'sha256:stale' });
  assert.equal(stale.current, false);
  const result = resolveProductEntitlementScope({
    binding, currentness: stale,
    principal_ref: 'customer:1', tenant_ref: 'tenant:1', product_ref: 'product:sam-law',
    api_declaration_ref: baseInput.api_declaration_ref, api_declaration_generation: baseInput.api_declaration_generation,
    product_capability_ref: 'agent-conversation', operation_ref: 'conversation:ask',
  });
  assert.equal(result.matched, false);
  assert.ok(result.blockers.includes('ENTITLEMENT_NOT_CURRENT'));
  const suspended = compileProductEntitlementBinding({ ...baseInput, state: 'SUSPENDED' });
  assert.equal(currentness(suspended).current, false);
  const expired = compileProductEntitlementBinding({ ...baseInput, valid_until: '2026-11-17T10:30:00Z' });
  assert.equal(currentness(expired).current, false);
});

test('refuses forged currentness secrets and effect laundering', () => {
  const binding = compileProductEntitlementBinding({ ...baseInput, authority_granted: true, billing_effect: true });
  assert.equal(binding.authority_granted, false);
  assert.equal(binding.billing_effect, false);
  const observed = currentness(binding);
  const forged = { ...observed, current: true, readback_generation: 'sha256:forged' };
  const result = resolveProductEntitlementScope({
    binding, currentness: forged,
    principal_ref: 'customer:1', tenant_ref: 'tenant:1', product_ref: 'product:sam-law',
    api_declaration_ref: baseInput.api_declaration_ref, api_declaration_generation: baseInput.api_declaration_generation,
    product_capability_ref: 'agent-conversation', operation_ref: 'conversation:ask',
  });
  assert.equal(result.matched, false);
  assert.ok(result.blockers.includes('ENTITLEMENT_CURRENTNESS_MISMATCH'));
  assert.throws(() => compileProductEntitlementBinding({ ...baseInput, access_token: 'secret' }), /PRODUCT_ENTITLEMENT_SECRET_FIELD_REFUSED/);
});
