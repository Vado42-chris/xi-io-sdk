import { ACCOUNT_BINDING_SCHEMA, assertCredentialFreeRecord, observeAccount } from './account-binding.mjs';

export const GLOBAL_ADMIN_PROJECTION_SCHEMA = 'xiio.sdk.global-admin-projection/v1';
const CONNECTION_STATES = new Set(['BOUND','UNBOUND','STALE','REVOKED','UNREAD','REFUSED']);
const ENTITLEMENT_STATES = new Set(['ACTIVE','INACTIVE','STALE','REVOKED','UNREAD','REFUSED']);
const PROVISIONING_STATES = new Set(['READY','PENDING','BLOCKED','FAILED','PROVISIONED','UNREAD','REFUSED']);
const SECRET_KEY = /token|password|secret|credential|api.?key|authorization/i;

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function ref(value, code) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/.test(value)) fail(code);
  return value;
}

function text(value, code, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > max) fail(code);
  return value;
}

function principalMatch(row, principalRef, code) {
  if (ref(row?.principal_ref, code) !== principalRef) fail(code);
}

function optionalRows(value, code) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(code);
  return value;
}

function uniqueRefs(values, code) {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values)) fail(code);
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const item = ref(value, code);
    if (seen.has(item)) fail(`${code}_DUPLICATE`);
    seen.add(item);
    output.push(item);
  }
  return Object.freeze(output);
}

function canonicalChosenAccount(row, principalRef) {
  if (row?.schema !== ACCOUNT_BINDING_SCHEMA || row?.kind !== 'CHOSEN_ACCOUNT') {
    fail('GLOBAL_ADMIN_ACCOUNT_NOT_CHOSEN');
  }
  if (row.chosen_by !== principalRef) fail('GLOBAL_ADMIN_ACCOUNT_FOREIGN_PRINCIPAL');
  if (row.authority_granted !== false) fail('GLOBAL_ADMIN_ACCOUNT_AUTHORITY_FORGED');
  const supplied = row.account;
  if (supplied?.schema !== ACCOUNT_BINDING_SCHEMA || supplied?.kind !== 'OBSERVED_ACCOUNT') {
    fail('GLOBAL_ADMIN_ACCOUNT_NOT_OBSERVED');
  }
  const observed = observeAccount({
    provider: supplied.provider,
    subject_id: supplied.subject_id,
    login: supplied.login,
    observed_via: supplied.observed_via,
    observed_at: supplied.observed_at,
  });
  if (
    supplied.principal_ref !== observed.principal_ref ||
    supplied.authority_granted !== false
  ) fail('GLOBAL_ADMIN_ACCOUNT_OBSERVATION_MISMATCH');
  return observed;
}

function freezeRows(rows) {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/** Authority-neutral, principal-conserving projection for product administration widgets. */
export function projectGlobalAdmin(input = {}) {
  assertCredentialFreeRecord(input, {
    secretKeyPattern: SECRET_KEY,
    secretCode: 'GLOBAL_ADMIN_SECRET_FIELD_REFUSED',
    accessorCode: 'GLOBAL_ADMIN_ACCESSOR_FIELD_REFUSED',
  });
  const principal_ref = ref(input.principal_ref, 'GLOBAL_ADMIN_PRINCIPAL_REQUIRED');

  const accountByPrincipal = new Map();
  const accounts = optionalRows(input.accounts, 'GLOBAL_ADMIN_ACCOUNTS_INVALID').map((choice) => {
    const account = canonicalChosenAccount(choice, principal_ref);
    if (accountByPrincipal.has(account.principal_ref)) fail('GLOBAL_ADMIN_ACCOUNT_DUPLICATE');
    accountByPrincipal.set(account.principal_ref, account);
    return {
      principal_ref: account.principal_ref,
      provider: account.provider,
      login: account.login,
      observed_at: account.observed_at,
      chosen_by: principal_ref,
      authority_granted: false,
    };
  });

  const connectionRefs = new Set();
  const connections = optionalRows(input.connections, 'GLOBAL_ADMIN_CONNECTIONS_INVALID').map((row) => {
    principalMatch(row, principal_ref, 'GLOBAL_ADMIN_CONNECTION_FOREIGN_PRINCIPAL');
    const connection_ref = ref(row.connection_ref, 'GLOBAL_ADMIN_CONNECTION_REF_REQUIRED');
    if (connectionRefs.has(connection_ref)) fail('GLOBAL_ADMIN_CONNECTION_DUPLICATE');
    connectionRefs.add(connection_ref);
    const account_principal_ref = ref(row.account_principal_ref, 'GLOBAL_ADMIN_ACCOUNT_REF_REQUIRED');
    const account = accountByPrincipal.get(account_principal_ref);
    if (!account) fail('GLOBAL_ADMIN_CONNECTION_ACCOUNT_UNRESOLVED');
    const provider = text(row.provider, 'GLOBAL_ADMIN_PROVIDER_REQUIRED', 64).toLowerCase();
    if (provider !== account.provider) fail('GLOBAL_ADMIN_CONNECTION_PROVIDER_MISMATCH');
    const state = text(row.state, 'GLOBAL_ADMIN_CONNECTION_STATE_INVALID', 32);
    if (!CONNECTION_STATES.has(state)) fail('GLOBAL_ADMIN_CONNECTION_STATE_INVALID');
    return {
      principal_ref,
      connection_ref,
      account_principal_ref,
      provider,
      state,
      scopes: uniqueRefs(row.scopes, 'GLOBAL_ADMIN_SCOPE_INVALID'),
      consumer_refs: uniqueRefs(row.consumer_refs, 'GLOBAL_ADMIN_CONSUMER_REF_INVALID'),
      authority_granted: false,
    };
  });

  const entitlementRefs = new Set();
  const entitlements = optionalRows(input.entitlements, 'GLOBAL_ADMIN_ENTITLEMENTS_INVALID').map((row) => {
    principalMatch(row, principal_ref, 'GLOBAL_ADMIN_ENTITLEMENT_FOREIGN_PRINCIPAL');
    const entitlement_ref = ref(row.entitlement_ref, 'GLOBAL_ADMIN_ENTITLEMENT_REF_REQUIRED');
    if (entitlementRefs.has(entitlement_ref)) fail('GLOBAL_ADMIN_ENTITLEMENT_DUPLICATE');
    entitlementRefs.add(entitlement_ref);
    const state = text(row.state, 'GLOBAL_ADMIN_ENTITLEMENT_STATE_INVALID', 32);
    if (!ENTITLEMENT_STATES.has(state)) fail('GLOBAL_ADMIN_ENTITLEMENT_STATE_INVALID');
    return {
      principal_ref,
      entitlement_ref,
      product_ref: ref(row.product_ref, 'GLOBAL_ADMIN_PRODUCT_REF_REQUIRED'),
      state,
      authority_granted: false,
    };
  });

  const usageRefs = new Set();
  const usage = optionalRows(input.usage, 'GLOBAL_ADMIN_USAGE_COLLECTION_INVALID').map((row) => {
    principalMatch(row, principal_ref, 'GLOBAL_ADMIN_USAGE_FOREIGN_PRINCIPAL');
    const usage_ref = ref(row.usage_ref, 'GLOBAL_ADMIN_USAGE_REF_REQUIRED');
    if (usageRefs.has(usage_ref)) fail('GLOBAL_ADMIN_USAGE_DUPLICATE');
    usageRefs.add(usage_ref);
    const quantity = row.quantity;
    const unit = text(row.unit, 'GLOBAL_ADMIN_USAGE_INVALID', 64);
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) fail('GLOBAL_ADMIN_USAGE_INVALID');
    return {
      principal_ref,
      usage_ref,
      product_ref: ref(row.product_ref, 'GLOBAL_ADMIN_PRODUCT_REF_REQUIRED'),
      quantity,
      unit,
      billing_effect: false,
    };
  });

  const suppliedProvisioning = input.provisioning;
  if (suppliedProvisioning !== undefined) {
    principalMatch(suppliedProvisioning, principal_ref, 'GLOBAL_ADMIN_PROVISIONING_FOREIGN_PRINCIPAL');
  }
  const provisioningState = text(suppliedProvisioning?.state ?? 'UNREAD', 'GLOBAL_ADMIN_PROVISIONING_STATE_INVALID', 32);
  if (!PROVISIONING_STATES.has(provisioningState)) fail('GLOBAL_ADMIN_PROVISIONING_STATE_INVALID');
  const provisioning = Object.freeze({
    principal_ref,
    state: provisioningState,
    node_refs: uniqueRefs(suppliedProvisioning?.node_refs, 'GLOBAL_ADMIN_NODE_REF_INVALID'),
    authority_granted: false,
  });

  return Object.freeze({
    schema: GLOBAL_ADMIN_PROJECTION_SCHEMA,
    principal_ref,
    accounts: freezeRows(accounts),
    connections: freezeRows(connections),
    entitlements: freezeRows(entitlements),
    usage: freezeRows(usage),
    provisioning,
    authority_granted: false,
    billing_effect: false,
    provider_effect: false,
    hard: Object.freeze([
      'PRODUCT_WIDGET!=GLOBAL_ADMIN_AUTHORITY',
      'OBSERVED_ACCOUNT!=CHOSEN_ACCOUNT',
      'CHOSEN_ACCOUNT_PRINCIPAL!=VIEWING_PRINCIPAL_UNLESS_EQUAL',
      'CONNECTION_ACCOUNT_REF!=ACCOUNT_UNLESS_RESOLVED',
      'MALFORMED_COLLECTION!=EMPTY_COLLECTION',
      'METERED_USAGE_EVENT!=BILLING_EFFECT',
      'USAGE_UNKNOWN!=ZERO_USAGE',
      'USAGE_INPUT!=NUMBER_COERCION',
      'CONNECTED_ACCOUNT_UI!=CREDENTIAL_STORE',
      'ACCOUNT_BOUND!=PROVIDER_AUTHORIZED',
      'ENTITLEMENT_VISIBLE!=EFFECT_AUTHORIZED',
      'ADMIN_ROLE!=ENTITLEMENT',
      'SUPERADMIN_ROLE!=ENTITLEMENT',
    ]),
  });
}
