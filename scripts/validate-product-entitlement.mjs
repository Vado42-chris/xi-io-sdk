import assert from 'node:assert/strict';
import {compileProductEntitlement} from '../src/billing/product-entitlement.mjs';
import {
  compileProductEntitlementBinding,
  compileProductEntitlementCurrentness,
  resolveProductEntitlementScope,
} from '../src/billing/product-entitlement-binding.mjs';
import {projectGlobalAdmin} from '../src/identity/global-admin-projection.mjs';

let checks=0;
let out=compileProductEntitlement({product_ref:'product:studio',tier:'free',required_capabilities:['documents','code_editor','export']});
assert.equal(out.admitted,true);assert.equal(out.paid_orchestration_required,false);assert.equal(out.billing_commit_allowed,false);checks+=3;
out=compileProductEntitlement({product_ref:'product:sam-law',tier:'free',required_capabilities:['documents','ai']});
assert.equal(out.admitted,false);assert.deepEqual(out.withheld_capabilities,['ai']);assert.equal(out.next,'UPGRADE_OR_REMOVE_ORCHESTRATION_REQUIREMENT');checks+=3;
out=compileProductEntitlement({product_ref:'product:sam-law',tier:'orchestrated',required_capabilities:['documents','ai','ack','orchestration']});
assert.equal(out.admitted,true);assert.equal(out.paid_orchestration_required,true);assert.equal(out.provider_attempt_allowed,false);checks+=3;
assert.throws(()=>compileProductEntitlement({product_ref:'product:x',tier:'free',required_capabilities:['secret_product_feature']}),/CAPABILITY_UNKNOWN/);checks++;
assert.throws(()=>compileProductEntitlement({product_ref:'product:x',tier:'admin',required_capabilities:[]}),/ENTITLEMENT_TIER_INVALID/);checks++;

const binding=compileProductEntitlementBinding({
  entitlement_ref:'entitlement:sam-law:owner',
  principal_ref:'principal:owner',
  tenant_ref:'tenant:owner',
  product_ref:'product:sam-law',
  api_declaration_ref:'api:sam-law',
  api_declaration_generation:'generation:api:sam-law:g1',
  tier:'orchestrated',
  state:'ACTIVE',
  issued_at:'2026-11-17T00:00:00Z',
  valid_from:'2026-11-17T00:00:00Z',
  valid_until:'2026-12-17T00:00:00Z',
  scopes:[{
    entitlement_capability_ref:'documents',
    product_capability_ref:'capability:sam-law:documents',
    operation_refs:['operation:sam-law:document:read'],
  }],
});
assert.equal(binding.authority_granted,false);
assert.equal(binding.billing_effect,false);
assert.equal(binding.effect_authority,false);
assert.ok(binding.hard.includes('ADMIN_ROLE!=ENTITLEMENT'));
assert.ok(binding.hard.includes('SUPERADMIN_ROLE!=ENTITLEMENT'));
checks+=5;

const currentness=compileProductEntitlementCurrentness({
  binding,
  currentness_ref:'currentness:sam-law:owner:g1',
  source_ref:'source:entitlement:sam-law:owner',
  source_generation:binding.entitlement_generation,
  readback_ref:'readback:entitlement:sam-law:owner',
  readback_generation:binding.entitlement_generation,
  observed_at:'2026-11-17T12:00:00Z',
});
assert.equal(currentness.current,true);
assert.equal(currentness.provider_authenticated,false);
assert.equal(currentness.authority_granted,false);
checks+=3;

let scope=resolveProductEntitlementScope({
  binding,currentness,
  principal_ref:'principal:owner',
  tenant_ref:'tenant:owner',
  product_ref:'product:sam-law',
  api_declaration_ref:'api:sam-law',
  api_declaration_generation:'generation:api:sam-law:g1',
  product_capability_ref:'capability:sam-law:documents',
  operation_ref:'operation:sam-law:document:read',
});
assert.equal(scope.state,'ENTITLED_CURRENT');
assert.equal(scope.matched,true);
assert.equal(scope.authority_granted,false);
assert.equal(scope.billing_effect,false);
assert.equal(scope.effect_authority,false);
checks+=5;

scope=resolveProductEntitlementScope({
  binding,currentness,
  principal_ref:'principal:owner',
  tenant_ref:'tenant:owner',
  product_ref:'product:sam-law',
  api_declaration_ref:'api:sam-law',
  api_declaration_generation:'generation:api:sam-law:g2',
  product_capability_ref:'capability:sam-law:documents',
  operation_ref:'operation:sam-law:document:read',
});
assert.equal(scope.state,'REFUSED');
assert.ok(scope.blockers.includes('ENTITLEMENT_API_DECLARATION_MISMATCH'));
checks+=2;

scope=resolveProductEntitlementScope({
  binding,currentness,
  principal_ref:'principal:owner',
  tenant_ref:'tenant:owner',
  product_ref:'product:sam-law',
  api_declaration_ref:'api:sam-law',
  api_declaration_generation:'generation:api:sam-law:g1',
  product_capability_ref:'capability:sam-law:documents',
  operation_ref:'operation:sam-law:document:write',
});
assert.equal(scope.state,'REFUSED');
assert.ok(scope.blockers.includes('ENTITLEMENT_SCOPE_NOT_GRANTED'));
checks+=2;

const admin=projectGlobalAdmin({
  principal_ref:'principal:owner',
  entitlements:[{
    principal_ref:'principal:owner',
    entitlement_ref:'entitlement:sam-law:owner',
    tenant_ref:'tenant:owner',
    product_ref:'product:sam-law',
    state:'ACTIVE',
  }],
  usage:[{
    principal_ref:'principal:owner',
    usage_ref:'usage:sam-law:owner:g1',
    tenant_ref:'tenant:owner',
    product_ref:'product:sam-law',
    quantity:12,
    unit:'request',
  }],
});
assert.equal(admin.entitlements.length,1);
assert.equal(admin.entitlements[0].authority_granted,false);
assert.equal(admin.usage[0].billing_effect,false);
assert.equal(admin.authority_granted,false);
assert.equal(admin.billing_effect,false);
assert.ok(admin.hard.includes('ADMIN_ROLE!=ENTITLEMENT'));
assert.ok(admin.hard.includes('SUPERADMIN_ROLE!=ENTITLEMENT'));
assert.ok(admin.hard.includes('METERED_USAGE_EVENT!=BILLING_EFFECT'));
checks+=8;

console.log(JSON.stringify({
  mode:'PRODUCT_ENTITLEMENT_BOUNDARY',
  checks,
  result:'PASS',
  api_declaration_generation_bound:true,
  entitlement_currentness_separate:true,
  admin_projection_is_not_entitlement:true,
  metered_usage_is_not_billing_effect:true,
  effects:0,
}));
