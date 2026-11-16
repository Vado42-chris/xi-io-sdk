import assert from 'node:assert/strict';
import test from 'node:test';
import { observeAccount } from '../src/identity/account-binding.mjs';
import { projectGlobalAdmin } from '../src/identity/global-admin-projection.mjs';

const observed = observeAccount({provider:'example',subject_id:'acct-1',login:'owner',observed_via:'oauth_readback',observed_at:'2026-11-16T17:00:00Z'});

test('projects observed account and connection without granting authority', () => {
  const p=projectGlobalAdmin({
    principal_ref:'customer:1',
    accounts:[observed],
    connections:[{connection_ref:'connection:1',account_principal_ref:observed.principal_ref,provider:'example',state:'BOUND',scopes:['read'],consumer_refs:['product:sam-law']}],
    entitlements:[{entitlement_ref:'entitlement:1',product_ref:'product:sam-law',state:'ACTIVE'}],
    usage:[{usage_ref:'usage:1',product_ref:'product:sam-law',quantity:2,unit:'operation'}],
    provisioning:{state:'READY',node_refs:['node:1']},
  });
  assert.equal(p.accounts[0].principal_ref,'example:acct-1');
  assert.equal(p.connections[0].authority_granted,false);
  assert.equal(p.usage[0].billing_effect,false);
  assert.equal(p.authority_granted,false);
  assert.equal(p.provider_effect,false);
  assert.ok(p.hard.includes('PRODUCT_WIDGET != GLOBAL_ADMIN_AUTHORITY'));
});

test('refuses secrets and forged account rows', () => {
  assert.throws(()=>projectGlobalAdmin({principal_ref:'customer:1',access_token:'secret'}),/GLOBAL_ADMIN_SECRET_FIELD_REFUSED/);
  assert.throws(()=>projectGlobalAdmin({principal_ref:'customer:1',accounts:[{schema:'fake',kind:'OBSERVED_ACCOUNT'}]}),/GLOBAL_ADMIN_ACCOUNT_NOT_OBSERVED/);
});

test('usage visibility cannot claim billing effect', () => {
  const p=projectGlobalAdmin({principal_ref:'customer:1',usage:[{usage_ref:'usage:1',product_ref:'product:x',quantity:1,unit:'call',billing_effect:true}]});
  assert.equal(p.usage[0].billing_effect,false);
  assert.equal(p.billing_effect,false);
});
