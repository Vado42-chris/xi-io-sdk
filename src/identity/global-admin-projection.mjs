import { ACCOUNT_BINDING_SCHEMA } from './account-binding.mjs';

export const GLOBAL_ADMIN_PROJECTION_SCHEMA = 'xiio.sdk.global-admin-projection/v1';
const STATES = new Set(['BOUND','UNBOUND','STALE','REVOKED','UNREAD','REFUSED']);
const ref = (value, code) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/.test(value)) throw new TypeError(code);
  return value;
};
const secretKey = /token|password|secret|credential|api.?key|authorization/i;
function noSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (secretKey.test(key)) throw new TypeError('GLOBAL_ADMIN_SECRET_FIELD_REFUSED');
    if (child && typeof child === 'object') noSecrets(child);
  }
}
const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

/** Authority-neutral projection for product administration widgets. */
export function projectGlobalAdmin(input = {}) {
  noSecrets(input);
  const principal_ref = ref(input.principal_ref, 'GLOBAL_ADMIN_PRINCIPAL_REQUIRED');
  const accounts = Array.isArray(input.accounts) ? input.accounts.map((row) => {
    if (row?.schema !== ACCOUNT_BINDING_SCHEMA || row?.kind !== 'OBSERVED_ACCOUNT') throw new TypeError('GLOBAL_ADMIN_ACCOUNT_NOT_OBSERVED');
    return { principal_ref: row.principal_ref, provider: row.provider, login: row.login, observed_at: row.observed_at, authority_granted: false };
  }) : [];
  const connections = Array.isArray(input.connections) ? input.connections.map((row) => {
    const state = String(row?.state || '');
    if (!STATES.has(state)) throw new TypeError('GLOBAL_ADMIN_CONNECTION_STATE_INVALID');
    return {
      connection_ref: ref(row.connection_ref, 'GLOBAL_ADMIN_CONNECTION_REF_REQUIRED'),
      account_principal_ref: ref(row.account_principal_ref, 'GLOBAL_ADMIN_ACCOUNT_REF_REQUIRED'),
      provider: ref(row.provider, 'GLOBAL_ADMIN_PROVIDER_REQUIRED'),
      state,
      scopes: Object.freeze(Array.isArray(row.scopes) ? row.scopes.map(String) : []),
      consumer_refs: Object.freeze(Array.isArray(row.consumer_refs) ? row.consumer_refs.map(x => ref(x,'GLOBAL_ADMIN_CONSUMER_REF_INVALID')) : []),
      authority_granted: false,
    };
  }) : [];
  const entitlements = Array.isArray(input.entitlements) ? input.entitlements.map((row) => ({
    entitlement_ref: ref(row.entitlement_ref, 'GLOBAL_ADMIN_ENTITLEMENT_REF_REQUIRED'),
    product_ref: ref(row.product_ref, 'GLOBAL_ADMIN_PRODUCT_REF_REQUIRED'),
    state: String(row.state || 'UNREAD'),
  })) : [];
  const usage = Array.isArray(input.usage) ? input.usage.map((row) => ({
    usage_ref: ref(row.usage_ref, 'GLOBAL_ADMIN_USAGE_REF_REQUIRED'),
    product_ref: ref(row.product_ref, 'GLOBAL_ADMIN_PRODUCT_REF_REQUIRED'),
    quantity: Number(row.quantity),
    unit: String(row.unit || ''),
    billing_effect: false,
  })) : [];
  if (usage.some(row => !Number.isFinite(row.quantity) || row.quantity < 0 || !row.unit)) throw new TypeError('GLOBAL_ADMIN_USAGE_INVALID');
  return Object.freeze({
    schema: GLOBAL_ADMIN_PROJECTION_SCHEMA,
    principal_ref,
    accounts: freezeRows(accounts),
    connections: freezeRows(connections),
    entitlements: freezeRows(entitlements),
    usage: freezeRows(usage),
    provisioning: Object.freeze({
      state: String(input.provisioning?.state || 'UNREAD'),
      node_refs: Object.freeze(Array.isArray(input.provisioning?.node_refs) ? input.provisioning.node_refs.map(x => ref(x,'GLOBAL_ADMIN_NODE_REF_INVALID')) : []),
    }),
    authority_granted: false,
    billing_effect: false,
    provider_effect: false,
    hard: Object.freeze([
      'PRODUCT_WIDGET != GLOBAL_ADMIN_AUTHORITY',
      'METERED_USAGE_EVENT != BILLING_EFFECT',
      'CONNECTED_ACCOUNT_UI != CREDENTIAL_STORE',
      'ACCOUNT_BOUND != PROVIDER_AUTHORIZED',
      'ENTITLEMENT_VISIBLE != EFFECT_AUTHORIZED',
    ]),
  });
}
