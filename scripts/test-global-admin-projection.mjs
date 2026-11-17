import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAccount, observeAccount } from '../src/identity/account-binding.mjs';
import { projectGlobalAdmin } from '../src/identity/global-admin-projection.mjs';
import { PRODUCT_ENTITLEMENT_STATES } from '../src/billing/product-entitlement.mjs';
import { compileProductEntitlementBinding } from '../src/billing/product-entitlement-binding.mjs';

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

test('projects every canonical entitlement lifecycle state without granting access', () => {
  for (const state of PRODUCT_ENTITLEMENT_STATES) {
    const binding = compileProductEntitlementBinding({
      principal_ref, tenant_ref:'tenant:1', entitlement_ref:'entitlement:1',
      product_ref:'product:sam-law', api_declaration_ref:'api:1',
      api_declaration_generation:'generation:1', tier:'free', state,
      issued_at:'2026-11-17T00:00:00Z', valid_from:'2026-11-17T00:00:00Z',
      scopes:[{entitlement_capability_ref:'forms',product_capability_ref:'forms',operation_refs:['form:read']}],
    });
    const row = Object.fromEntries(['principal_ref','tenant_ref','entitlement_ref','product_ref','state'].map(key=>[key,binding[key]]));
    const result = projectGlobalAdmin({...base,entitlements:[row]});
    assert.equal(result.entitlements[0].state,state);
    assert.equal(result.entitlements[0].tenant_ref,'tenant:1');
    assert.equal(result.entitlements[0].authority_granted,false);
    assert.equal(result.authority_granted,false);
    assert.equal(result.provider_effect,false);
    assert.equal(result.billing_effect,false);
  }
});

test('preserves explicit tenant identity on entitlement and usage observations without inferring it', () => {
  for (const collection of ['entitlements','usage']) {
    const first = projectGlobalAdmin({...base,[collection]:[{...base[collection][0],tenant_ref:'tenant:1'}]});
    const second = projectGlobalAdmin({...base,[collection]:[{...base[collection][0],tenant_ref:'tenant:2'}]});
    assert.equal(first[collection][0].tenant_ref,'tenant:1');
    assert.equal(second[collection][0].tenant_ref,'tenant:2');
    assert.notDeepEqual(first,second);
    assert.equal(Object.hasOwn(projectGlobalAdmin(base)[collection][0],'tenant_ref'),false);
    assert.equal(first.authority_granted,false);
    assert.equal(first.provider_effect,false);
  }
});

test('refuses malformed explicit tenant identities rather than dropping them', () => {
  for (const collection of ['entitlements','usage']) {
    for (const tenant_ref of [null,undefined,'',' ',false,1,{},'tenant:with space']) {
      assert.throws(()=>projectGlobalAdmin({...base,[collection]:[{...base[collection][0],tenant_ref}]}),/GLOBAL_ADMIN_TENANT_REF_INVALID/);
    }
  }
});

test('tenant observation never bypasses principal or lifecycle validation', () => {
  for (const collection of ['entitlements','usage']) {
    assert.throws(()=>projectGlobalAdmin({...base,[collection]:[{...base[collection][0],tenant_ref:'tenant:1',principal_ref:'customer:2'}]}),/FOREIGN_PRINCIPAL/);
  }
  assert.throws(()=>projectGlobalAdmin({...base,entitlements:[{...base.entitlements[0],tenant_ref:'tenant:1',state:'ADMIN'}]}),/GLOBAL_ADMIN_ENTITLEMENT_STATE_INVALID/);
});

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

test('uses shared credential custody for nested data and accessors', () => {
  assert.throws(
    ()=>projectGlobalAdmin({...base,widget:{settings:{provider_credentials:{access_token:'nested-secret'}}}}),
    /GLOBAL_ADMIN_SECRET_FIELD_REFUSED/
  );

  let reads=0;
  const accessorInput={...base};
  Object.defineProperty(accessorInput,'widget',{
    enumerable:true,
    get(){ reads+=1; return {authorization:'getter-secret'}; }
  });
  assert.throws(()=>projectGlobalAdmin(accessorInput),/GLOBAL_ADMIN_ACCESSOR_FIELD_REFUSED/);
  assert.equal(reads,0);

  const metadata={label:'safe'};
  metadata.self=metadata;
  const projection=projectGlobalAdmin({...base,metadata});
  assert.equal(projection.principal_ref,principal_ref);
});

test('refuses malformed top-level collections instead of projecting them as empty', () => {
  for (const [field, code] of [
    ['accounts', 'GLOBAL_ADMIN_ACCOUNTS_INVALID'],
    ['connections', 'GLOBAL_ADMIN_CONNECTIONS_INVALID'],
    ['entitlements', 'GLOBAL_ADMIN_ENTITLEMENTS_INVALID'],
    ['usage', 'GLOBAL_ADMIN_USAGE_COLLECTION_INVALID'],
  ]) {
    for (const value of [null, {}, 'not-an-array', 0, false]) {
      assert.throws(() => projectGlobalAdmin({ ...base, [field]: value }), new RegExp(code), `${field} ${String(value)}`);
    }
  }
});

test('refuses malformed nested reference collections instead of dropping them', () => {
  for (const scopes of [null, 'read', {}, 1]) {
    assert.throws(
      () => projectGlobalAdmin({...base,connections:[{...base.connections[0],scopes}]}),
      /GLOBAL_ADMIN_SCOPE_INVALID/,
    );
  }
  for (const consumer_refs of [null, 'product:sam-law', {}, 1]) {
    assert.throws(
      () => projectGlobalAdmin({...base,connections:[{...base.connections[0],consumer_refs}]}),
      /GLOBAL_ADMIN_CONSUMER_REF_INVALID/,
    );
  }
  for (const node_refs of [null, 'node:1', {}, 1]) {
    assert.throws(
      () => projectGlobalAdmin({...base,provisioning:{...base.provisioning,node_refs}}),
      /GLOBAL_ADMIN_NODE_REF_INVALID/,
    );
  }
});

test('omitted optional collections remain explicit empty data, not malformed data', () => {
  const projection = projectGlobalAdmin({principal_ref});
  assert.deepEqual([...projection.accounts], []);
  assert.deepEqual([...projection.connections], []);
  assert.deepEqual([...projection.entitlements], []);
  assert.deepEqual([...projection.usage], []);
  assert.equal(projection.provisioning.state, 'UNREAD');
  assert.deepEqual([...projection.provisioning.node_refs], []);
  assert.ok(projection.hard.includes('MALFORMED_COLLECTION!=EMPTY_COLLECTION'));
});

test('usage quantities are exact numbers and never coerced into zero or another amount', () => {
  for(const quantity of ['2','', ' ', false, true, null, undefined, [], [2], {}, NaN, Infinity, -Infinity, -1]){
    assert.throws(
      ()=>projectGlobalAdmin({...base,usage:[{...base.usage[0],quantity}]}),
      /GLOBAL_ADMIN_USAGE_INVALID/,
      `quantity ${String(quantity)} must be refused`,
    );
  }
  for(const quantity of [0,0.5,2]){
    const projection=projectGlobalAdmin({...base,usage:[{...base.usage[0],quantity}]});
    assert.equal(projection.usage[0].quantity,quantity);
    assert.ok(projection.hard.includes('USAGE_UNKNOWN!=ZERO_USAGE'));
    assert.ok(projection.hard.includes('USAGE_INPUT!=NUMBER_COERCION'));
  }
});

test('usage visibility cannot claim a billing effect', () => {
  const projection = projectGlobalAdmin({...base,usage:[{...base.usage[0],billing_effect:true}]});
  assert.equal(projection.usage[0].billing_effect,false);
  assert.equal(projection.billing_effect,false);
});
