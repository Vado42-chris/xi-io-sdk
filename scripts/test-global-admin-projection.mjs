import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAccount, observeAccount } from '../src/identity/account-binding.mjs';
import { projectGlobalAdmin } from '../src/identity/global-admin-projection.mjs';

const principal_ref = 'customer:1';
const observed = observeAccount({
  provider:'example',subject_id:'acct-1',login:'owner',
  observed_via:'oauth_readback',observed_at:'2026-11-16T17:00:00Z'
});
const chosen = chooseAccount([observed], observed.principal_ref, {chosen_by:principal_ref});
const base = {
  principal_ref,
  accounts:[chosen],
  connections:[{
    principal_ref,connection_ref:'connection:1',account_principal_ref:observed.principal_ref,
    provider:'example',state:'BOUND',scopes:['read'],consumer_refs:['product:sam-law']
  }],
  entitlements:[{principal_ref,entitlement_ref:'entitlement:1',product_ref:'product:sam-law',state:'ACTIVE'}],
  usage:[{principal_ref,usage_ref:'usage:1',product_ref:'product:sam-law',quantity:2,unit:'operation'}],
  provisioning:{principal_ref,state:'READY',node_refs:['node:1']},
};

test('projects one principal-conserving widget without granting authority', () => {
  const projection = projectGlobalAdmin(base);
  assert.equal(projection.accounts[0].principal_ref,'example:acct-1');
  assert.equal(projection.accounts[0].chosen_by,principal_ref);
  assert.equal(projection.connections[0].account_principal_ref,observed.principal_ref);
  assert.equal(projection.connections[0].authority_granted,false);
  assert.equal(projection.usage[0].billing_effect,false);
  assert.equal(projection.provisioning.authority_granted,false);
  assert.equal(projection.authority_granted,false);
  assert.equal(projection.provider_effect,false);
});

test('requires the provider account to be explicitly chosen by this principal', () => {
  assert.throws(()=>projectGlobalAdmin({...base,accounts:[observed]}),/GLOBAL_ADMIN_ACCOUNT_NOT_CHOSEN/);
  const foreign = chooseAccount([observed], observed.principal_ref, {chosen_by:'customer:2'});
  assert.throws(()=>projectGlobalAdmin({...base,accounts:[foreign]}),/GLOBAL_ADMIN_ACCOUNT_FOREIGN_PRINCIPAL/);
  assert.throws(()=>projectGlobalAdmin({...base,accounts:[chosen,chosen]}),/GLOBAL_ADMIN_ACCOUNT_DUPLICATE/);
});

test('refuses connection identity substitution and ambiguity', () => {
  assert.throws(()=>projectGlobalAdmin({...base,connections:[{...base.connections[0],account_principal_ref:'example:other'}]}),/GLOBAL_ADMIN_CONNECTION_ACCOUNT_UNRESOLVED/);
  assert.throws(()=>projectGlobalAdmin({...base,connections:[{...base.connections[0],provider:'other'}]}),/GLOBAL_ADMIN_CONNECTION_PROVIDER_MISMATCH/);
  assert.throws(()=>projectGlobalAdmin({...base,connections:[{...base.connections[0],principal_ref:'customer:2'}]}),/GLOBAL_ADMIN_CONNECTION_FOREIGN_PRINCIPAL/);
  assert.throws(()=>projectGlobalAdmin({...base,connections:[base.connections[0],base.connections[0]]}),/GLOBAL_ADMIN_CONNECTION_DUPLICATE/);
});

test('refuses foreign entitlement, usage and provisioning rows', () => {
  assert.throws(()=>projectGlobalAdmin({...base,entitlements:[{...base.entitlements[0],principal_ref:'customer:2'}]}),/GLOBAL_ADMIN_ENTITLEMENT_FOREIGN_PRINCIPAL/);
  assert.throws(()=>projectGlobalAdmin({...base,usage:[{...base.usage[0],principal_ref:'customer:2'}]}),/GLOBAL_ADMIN_USAGE_FOREIGN_PRINCIPAL/);
  assert.throws(()=>projectGlobalAdmin({...base,provisioning:{...base.provisioning,principal_ref:'customer:2'}}),/GLOBAL_ADMIN_PROVISIONING_FOREIGN_PRINCIPAL/);
});

test('refuses secrets, forged observations and duplicate metering rows', () => {
  assert.throws(()=>projectGlobalAdmin({...base,access_token:'secret'}),/GLOBAL_ADMIN_SECRET_FIELD_REFUSED/);
  const forged = {...chosen,account:{...observed,principal_ref:'example:forged'}};
  assert.throws(()=>projectGlobalAdmin({...base,accounts:[forged]}),/GLOBAL_ADMIN_ACCOUNT_OBSERVATION_MISMATCH/);
  assert.throws(()=>projectGlobalAdmin({...base,usage:[base.usage[0],base.usage[0]]}),/GLOBAL_ADMIN_USAGE_DUPLICATE/);
});

test('usage visibility cannot claim a billing effect', () => {
  const projection = projectGlobalAdmin({...base,usage:[{...base.usage[0],billing_effect:true}]});
  assert.equal(projection.usage[0].billing_effect,false);
  assert.equal(projection.billing_effect,false);
});
