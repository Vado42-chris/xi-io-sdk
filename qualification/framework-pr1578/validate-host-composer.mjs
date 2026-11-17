import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  compileProductApiAdmission,
  createProductApiHostAdmission,
  inspectProductApiHostAdmission,
  PRODUCT_API_HOST_INPUT_SCHEMA,
  PRODUCT_API_HOST_ADMISSION_SCHEMA,
} from './compile-product-api-admission.mjs';
import {
  compileProductEntitlementBinding,
  compileProductEntitlementCurrentness,
} from './sdk/product-entitlement-binding.mjs';
import {
  compileProductAccessGrantBinding,
  compileProductAccessGrantCurrentness,
  compileProductBillingAdmissionBinding,
  compileProductBillingAdmissionCurrentness,
} from './sdk/product-operation-admission-binding.mjs';
import {
  WORKER_CONNECTION_SCHEMA,
  WORKER_CANARY_BYTES,
  WORKER_CANARY_SHA256,
} from './worker/connection.mjs';
import {
  WORKER_EXECUTION_ROUTE_READBACK_SCHEMA,
  compileWorkerExecutionRouteObservation,
} from './worker/execution-route.mjs';

const candidatePath = new URL('./compile-product-api-admission.mjs', import.meta.url);
const candidateBytes = fs.readFileSync(candidatePath);
const candidateBlob = createHash('sha1')
  .update(Buffer.from(`blob ${candidateBytes.length}\0`))
  .update(candidateBytes)
  .digest('hex');
assert.equal(candidateBlob, '3aefe7b31167eab9c837939090fbb5517512f10b');

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const epoch = Date.now();
const now = new Date(epoch).toISOString();

const declaration = Object.freeze({
  declaration_ref:'api-declaration:inbox:v1',
  declaration_generation:`sha256:${'a'.repeat(64)}`,
  product_ref:'product:inbox',
  api_ref:'api:inbox:v1',
  runtime_ref:'runtime:inbox',
  operations:Object.freeze([Object.freeze({
    capability_ref:'mail-egress',
    operation_ref:'mail:outbox-dispatch',
    billing_mode:'METERED',
    meter_unit_type:'provider_attempt',
    eligible_roles:Object.freeze(['admin','superadmin','user']),
  })]),
});
const declarationCurrentness = Object.freeze({
  state:'CURRENT',
  custody_verified:true,
  currentness_ref:'api-currentness:inbox:v1',
});
const entitlement = compileProductEntitlementBinding({
  entitlement_ref:'entitlement:inbox:principal-1',
  principal_ref:'principal:1',
  tenant_ref:'tenant:1',
  product_ref:'product:inbox',
  api_declaration_ref:declaration.declaration_ref,
  api_declaration_generation:declaration.declaration_generation,
  tier:'orchestrated',
  state:'ACTIVE',
  issued_at:new Date(epoch - 120000).toISOString(),
  valid_from:new Date(epoch - 60000).toISOString(),
  valid_until:new Date(epoch + 86400000).toISOString(),
  scopes:[{
    entitlement_capability_ref:'mail',
    product_capability_ref:'mail-egress',
    operation_refs:['mail:outbox-dispatch'],
  }],
});
const entitlementCurrentness = compileProductEntitlementCurrentness({
  binding:entitlement,
  currentness_ref:'entitlement-currentness:inbox:principal-1',
  source_ref:'billing-ledger:entitlements',
  source_generation:entitlement.entitlement_generation,
  readback_ref:'readback:entitlement:inbox:principal-1',
  readback_generation:entitlement.entitlement_generation,
  observed_at:now,
});
const operationScope = {
  principal_ref:'principal:1',
  tenant_ref:'tenant:1',
  product_ref:'product:inbox',
  api_declaration_ref:declaration.declaration_ref,
  api_declaration_generation:declaration.declaration_generation,
  product_capability_ref:'mail-egress',
  operation_ref:'mail:outbox-dispatch',
  entitlement_ref:entitlement.entitlement_ref,
  entitlement_generation:entitlement.entitlement_generation,
};
const grant = compileProductAccessGrantBinding({
  access_grant_ref:'access-grant:inbox:principal-1:dispatch',
  issuer_ref:'authority:ward',
  ...operationScope,
  role:'user',
  state:'ACTIVE',
  issued_at:new Date(epoch - 120000).toISOString(),
  valid_from:new Date(epoch - 60000).toISOString(),
  valid_until:new Date(epoch + 86400000).toISOString(),
});
const grantCurrentness = compileProductAccessGrantCurrentness({
  binding:grant,
  currentness_ref:'access-currentness:inbox:principal-1:dispatch',
  source_ref:'ward:access-grant-store',
  source_generation:grant.access_grant_generation,
  readback_ref:'ward:readback:inbox:principal-1:dispatch',
  readback_generation:grant.access_grant_generation,
  observed_at:now,
});
const billing = compileProductBillingAdmissionBinding({
  billing_admission_ref:'billing-admission:inbox:principal-1:dispatch',
  billing_authority_ref:'billing-authority:xiio',
  pricing_ref:'pricing:inbox:v1',
  rate_card_ref:'rate-card:inbox:v1',
  budget_ref:'budget:tenant-1:inbox',
  budget_reservation_ref:'budget-reservation:inbox:dispatch:1',
  access_grant_ref:grant.access_grant_ref,
  access_grant_generation:grant.access_grant_generation,
  meter_unit_type:'provider_attempt',
  maximum_quantity:1,
  state:'ADMITTED',
  budget_state:'RESERVED',
  ...operationScope,
  issued_at:new Date(epoch - 120000).toISOString(),
  valid_from:new Date(epoch - 60000).toISOString(),
  valid_until:new Date(epoch + 3600000).toISOString(),
});
const billingCurrentness = compileProductBillingAdmissionCurrentness({
  binding:billing,
  currentness_ref:'billing-currentness:inbox:principal-1:dispatch',
  source_ref:'billing:admission-store',
  source_generation:billing.billing_admission_generation,
  readback_ref:'billing:readback:inbox:principal-1:dispatch',
  readback_generation:billing.billing_admission_generation,
  observed_at:now,
});

const request = Object.freeze({
  request_ref:'request:inbox:dispatch:1',
  runtime_ref:'runtime:inbox',
  product_ref:'product:inbox',
  api_ref:'api:inbox:v1',
  capability_ref:'mail-egress',
  operation_ref:'mail:outbox-dispatch',
  worker_ref:'worker:loki',
  device_ref:'device:loki',
});
const bindingBasis = {
  worker_ref:request.worker_ref,
  device_ref:request.device_ref,
  source_generation:'generation:worker:installed',
  installed_generation:'generation:worker:installed',
  owner_principal_ref:'principal:1',
  account_principal_ref:'principal:1',
  installation_ref:'installation:loki:1',
  installation_sha256:'c'.repeat(64),
  binding_ref:'binding:loki:1',
};
const workerBinding = Object.freeze({
  schema:WORKER_CONNECTION_SCHEMA,
  state:'BINDING_OBSERVED',
  ...bindingBasis,
  binding_digest:digest(bindingBasis),
  authority_granted:false,
  provider_effect:false,
});
const liveness = Object.freeze({
  schema:WORKER_CONNECTION_SCHEMA,
  state:'LIVENESS_OBSERVED',
  worker_ref:request.worker_ref,
  device_ref:request.device_ref,
  installed_generation:bindingBasis.installed_generation,
  observation_ref:'observation:liveness:inbox-host',
  authority_granted:false,
  provider_effect:false,
});
const canary = Object.freeze({
  schema:WORKER_CONNECTION_SCHEMA,
  state:'CANARY_RETURN_VERIFIED',
  worker_ref:request.worker_ref,
  work_ref:'work:route-canary:inbox-host',
  request_digest:'d'.repeat(64),
  result_ref:'result:route-canary:inbox-host',
  return_ref:'return:route-canary:inbox-host',
  resource_ref:'resource:route-canary:inbox-host',
  version_ref:'version:route-canary:inbox-host',
  data_base64:WORKER_CANARY_BYTES.toString('base64'),
  bytes:WORKER_CANARY_BYTES.length,
  sha256:WORKER_CANARY_SHA256,
  authority_granted:false,
  provider_effect:false,
  apply_return_verified:false,
});
const observation = compileWorkerExecutionRouteObservation({
  observation_ref:'observation:execution-route:inbox-host',
  route_ref:'route:inbox:dispatch:loki',
  runtime_ref:request.runtime_ref,
  product_ref:request.product_ref,
  api_ref:request.api_ref,
  capability_ref:request.capability_ref,
  operation_ref:request.operation_ref,
  worker_ref:request.worker_ref,
  device_ref:request.device_ref,
  installed_generation:bindingBasis.installed_generation,
  binding_digest:workerBinding.binding_digest,
  liveness_observation_ref:liveness.observation_ref,
  canary_return_ref:canary.return_ref,
  session_ref:'session:loki:inbox-host',
  producer_ref:'producer:inbox-host-route',
  producer_generation:'generation:inbox-host-route:1',
  observed_at:new Date(epoch - 1000).toISOString(),
  expires_at:new Date(epoch + 29000).toISOString(),
  connection_session_authenticated:true,
  connection_session_authorized:true,
  capability_available:true,
  operation_supported:true,
  tool_executable:true,
  authority_granted:false,
  effect_authority:false,
  provider_effect:false,
  billing_effect_authority:false,
});
const routeReadback = Object.freeze({
  schema:WORKER_EXECUTION_ROUTE_READBACK_SCHEMA,
  state:'OBSERVATION_REOPENED',
  observation_ref:observation.observation_ref,
  route_digest:observation.route_digest,
  producer_ref:observation.producer_ref,
  producer_generation:observation.producer_generation,
  readback_ref:'readback:execution-route:inbox-host',
  readback_generation:observation.producer_generation,
  authority_granted:false,
  effect_authority:false,
  provider_effect:false,
  billing_effect_authority:false,
});
const input = Object.freeze({
  product_ref:request.product_ref,
  api_ref:request.api_ref,
  capability_ref:request.capability_ref,
  operation_ref:request.operation_ref,
  principal_ref:'principal:1',
  tenant_ref:'tenant:1',
  role:'user',
  billing_mode:'METERED',
  requested_quantity:1,
  api_declaration:declaration,
  api_declaration_currentness:declarationCurrentness,
  product_entitlement_binding:entitlement,
  product_entitlement_currentness:entitlementCurrentness,
});
const authority = Object.freeze({
  product_access_grant_binding:grant,
  product_access_grant_currentness:grantCurrentness,
  product_billing_admission_binding:billing,
  product_billing_admission_currentness:billingCurrentness,
});
const readbackFor = (selectedInput=input, selectedAuthority=authority, overrides={}) => {
  const subjectDigest = digest({input:selectedInput, authority:selectedAuthority});
  return {
    schema:PRODUCT_API_HOST_INPUT_SCHEMA,
    state:'CURRENT_INPUT_REOPENED',
    request_ref:request.request_ref,
    source_ref:'source:inbox-api-admission:1',
    source_generation:'generation:inbox-api-admission:1',
    readback_ref:'readback:inbox-api-admission:1',
    readback_generation:'generation:inbox-api-admission:1',
    input:selectedInput,
    authority:selectedAuthority,
    subject_digest:subjectDigest,
    readback_digest:subjectDigest,
    authority_granted:false,
    effect_authority:false,
    provider_effect:false,
    billing_effect_authority:false,
    ...overrides,
  };
};
const portsFor = ({
  selectedBinding=workerBinding,
  selectedLiveness=liveness,
  selectedCanary=canary,
  selectedObservation=observation,
  selectedRouteReadback=routeReadback,
  selectedInputReadback=readbackFor(),
}={}) => ({
  readBinding:async()=>selectedBinding,
  observeLiveness:async()=>selectedLiveness,
  readCanaryReturn:async()=>selectedCanary,
  observeExecutionRoute:async()=>selectedObservation,
  readExecutionRouteObservation:async()=>selectedRouteReadback,
  readProductApiAdmissionInput:async()=>selectedInputReadback,
});
const admit = async (options={}, selectedRequest=request) => createProductApiHostAdmission({
  ports:portsFor(options),
  clock:()=>now,
}).admit(selectedRequest);

const admitted = await admit();
assert.equal(admitted.schema, PRODUCT_API_HOST_ADMISSION_SCHEMA);
assert.equal(admitted.state, 'ADMITTED');
assert.equal(admitted.action_allowed, true);
assert.equal(admitted.product_api_admission.schema, 'xiio.product-api-admission/v6');
assert.equal(admitted.product_api_admission.access_grant_ref, grant.access_grant_ref);
assert.equal(admitted.product_api_admission.billing_admission_ref, billing.billing_admission_ref);
assert.equal(admitted.product_api_admission.provider_attempt_allowed, true);
assert.equal(admitted.product_api_admission.billing_commit_allowed, false);
assert.equal(admitted.product_api_admission.worker_execution_route_readback_ref, routeReadback.readback_ref);
assert.equal(admitted.effect_authority, false);
assert.strictEqual(inspectProductApiHostAdmission(admitted, request, {clock:()=>now}), admitted);

for (const copy of [structuredClone(admitted), JSON.parse(JSON.stringify(admitted))]) {
  const refused = inspectProductApiHostAdmission(copy, request, {clock:()=>now});
  assert.equal(refused.state, 'REFUSED');
  assert.equal(refused.first_red, 'PRODUCT_API_HOST_ADMISSION_PRODUCER_UNBOUND');
}
let refused = inspectProductApiHostAdmission(
  admitted,
  {...request, operation_ref:'mail:other'},
  {clock:()=>now},
);
assert.equal(refused.first_red, 'PRODUCT_API_HOST_ADMISSION_IDENTITY_MISMATCH');
refused = inspectProductApiHostAdmission(
  admitted,
  request,
  {clock:()=>new Date(epoch + 30000).toISOString()},
);
assert.equal(refused.first_red, 'WORKER_EXECUTION_ROUTE_STALE');

assert.throws(
  () => compileProductApiAdmission({...input, product_access_grant_binding:grant}),
  /PRODUCT_API_CALLER_AUTHORITY_EVIDENCE_FORBIDDEN/,
);
refused = await admit({
  selectedInputReadback:readbackFor(input, authority, {readback_digest:'0'.repeat(64)}),
});
assert.equal(refused.first_red, 'PRODUCT_API_HOST_INPUT_DIGEST_MISMATCH');
refused = await admit({
  selectedInputReadback:readbackFor({...input, principal_ref:'principal:other'}, authority),
});
assert.equal(refused.first_red, 'ACCESS_GRANT_PRINCIPAL_REF_MISMATCH');
refused = await admit({
  selectedInputReadback:readbackFor({...input, role:'admin'}, authority),
});
assert.equal(refused.first_red, 'ACCESS_GRANT_ROLE_MISMATCH');
refused = await admit({
  selectedInputReadback:readbackFor({...input, requested_quantity:2}, authority),
});
assert.equal(refused.first_red, 'BILLING_ADMISSION_QUANTITY_EXCEEDED');
refused = await admit({
  selectedInputReadback:readbackFor(input, {
    ...authority,
    product_access_grant_currentness:structuredClone(grantCurrentness),
  }),
});
assert.equal(refused.first_red, 'ACCESS_GRANT_CURRENTNESS_UNVERIFIED');
refused = await admit({
  selectedInputReadback:readbackFor(input, {
    ...authority,
    product_billing_admission_currentness:structuredClone(billingCurrentness),
  }),
});
assert.equal(refused.first_red, 'BILLING_ADMISSION_CURRENTNESS_UNVERIFIED');
refused = await admit({
  selectedRouteReadback:{...routeReadback, route_digest:'e'.repeat(64)},
});
assert.equal(refused.first_red, 'WORKER_EXECUTION_ROUTE_READBACK_MISMATCH');

let accessorReads = 0;
const accessorReadback = readbackFor();
Object.defineProperty(accessorReadback, 'state', {
  enumerable:true,
  configurable:true,
  get() {
    accessorReads += 1;
    return 'CURRENT_INPUT_REOPENED';
  },
});
refused = await admit({selectedInputReadback:accessorReadback});
assert.equal(refused.first_red, 'PRODUCT_API_HOST_INPUT_ACCESSOR_FIELD_REFUSED');
assert.equal(accessorReads, 0);

console.log(JSON.stringify({
  schema:'xiio.qualification.framework-pr1578-host-composer/v1',
  result:'PASS',
  candidate_git_blob:candidateBlob,
  product_ref:request.product_ref,
  operation_ref:request.operation_ref,
  typed_access_grant_bound:true,
  typed_billing_admission_bound:true,
  live_route_readback_bound:true,
  clones_refused:true,
  stale_route_refused:true,
  cross_principal_refused:true,
  privileged_role_bypass_refused:true,
  quantity_overrun_refused:true,
  accessor_reads:accessorReads,
  billing_commit_allowed:false,
  effect_authority:false,
  provider_effect:false,
  billing_effect_authority:false,
}, null, 2));
