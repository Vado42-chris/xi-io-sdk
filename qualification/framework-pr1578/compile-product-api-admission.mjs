import { createHash } from 'node:crypto';
import { assertCredentialFreeRecord } from './identity/account-binding.mjs';
import { resolveProductApiOperation } from './compile-product-api-declaration.mjs';
import { resolveProductEntitlementScope } from './sdk/product-entitlement-binding.mjs';
import {
  resolveProductAccessGrantScope,
  resolveProductBillingAdmissionScope,
} from './sdk/product-operation-admission-binding.mjs';
import {
  createWorkerExecutionRouteQualifier,
  inspectQualifiedWorkerExecutionRoute,
} from './worker/execution-route.mjs';

export const PRODUCT_API_HOST_INPUT_SCHEMA='xiio.product-api-host-admission-input/v1';
export const PRODUCT_API_HOST_ADMISSION_SCHEMA='xiio.product-api-host-admission/v1';

const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const SECRET_KEY=/token|password|secret|credential|api.?key|authorization/i;
const MODES=new Set(['FREE','METERED','INTERNAL']);
const ROLES=new Set(['user','admin','superadmin','service']);
const TRUSTED_CONTEXT_KEYS=new Set([
  'worker_execution_route_evidence',
  'product_access_grant_binding',
  'product_access_grant_currentness',
  'product_billing_admission_binding',
  'product_billing_admission_currentness',
]);
const CALLER_AUTHORITY_EVIDENCE_KEYS=new Set([
  'worker_execution_route_evidence',
  'product_access_grant_binding','product_access_grant_currentness',
  'product_billing_admission_binding','product_billing_admission_currentness',
  'access_grant_ref','access_grant_current','access_grant_principal_match','access_grant_tenant_match',
  'access_grant_product_match','access_grant_capability_match','access_grant_operation_match','access_grant_not_revoked',
  'pricing_ref','rate_card_ref','billing_authority_ref','budget_ref','billing_admission_current','budget_current',
]);
const HOST_REQUEST_KEYS=new Set([
  'request_ref','runtime_ref','product_ref','api_ref','capability_ref',
  'operation_ref','worker_ref','device_ref',
]);
const HOST_AUTHORITY_KEYS=new Set([
  'product_access_grant_binding','product_access_grant_currentness',
  'product_billing_admission_binding','product_billing_admission_currentness',
]);
const HOST_READBACK_KEYS=new Set([
  'schema','state','request_ref','source_ref','source_generation','readback_ref','readback_generation',
  'input','authority','subject_digest','readback_digest',
  'authority_granted','effect_authority','provider_effect','billing_effect_authority',
]);
const HOST_PORTS=Object.freeze([
  'readBinding','observeLiveness','readCanaryReturn','observeExecutionRoute',
  'readExecutionRouteObservation','readProductApiAdmissionInput',
]);
const LIVE_HOST_ADMISSIONS=new WeakSet();
const LIVE_HOST_ROUTES=new WeakMap();

const fail=(code)=>{const error=new TypeError(code);error.code=code;throw error;};
const ref=(value,code)=>{if(typeof value!=='string'||!REF.test(value))fail(code);return value;};
const optionalMode=(value)=>{
  if(value===undefined||value===null)return null;
  if(typeof value!=='string'||!MODES.has(value))fail('BILLING_MODE_INVALID');
  return value;
};
const positiveNumber=(value,code)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)fail(code);
  return value;
};
function errorCode(error,fallback){
  if(typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{4,120}$/.test(error.code))return error.code;
  if(typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{4,120}$/.test(error.message))return error.message;
  return fallback;
}
function assertPlainTrustedData(value,seen=new WeakSet(),codes={}){
  const nondata=codes.nondata??'PRODUCT_API_TRUSTED_CONTEXT_NONDATA_FIELD_REFUSED';
  const prototype=codes.prototype??'PRODUCT_API_TRUSTED_CONTEXT_PROTOTYPE_INVALID';
  const accessor=codes.accessor??'PRODUCT_API_TRUSTED_CONTEXT_ACCESSOR_FIELD_REFUSED';
  if(value===null||value===undefined||['string','number','boolean','bigint'].includes(typeof value))return;
  if(typeof value!=='object')fail(nondata);
  if(seen.has(value))return;
  seen.add(value);
  const actualPrototype=Object.getPrototypeOf(value);
  const expected=Array.isArray(value)?Array.prototype:Object.prototype;
  if(actualPrototype!==expected&&actualPrototype!==null)fail(prototype);
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value'))fail(accessor);
    assertPlainTrustedData(descriptor.value,seen,codes);
  }
}
function stable(value,seen=new WeakSet()){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('PRODUCT_API_HOST_INPUT_NONJSON_VALUE_REFUSED');
    return value;
  }
  if(typeof value!=='object')fail('PRODUCT_API_HOST_INPUT_NONJSON_VALUE_REFUSED');
  if(seen.has(value))fail('PRODUCT_API_HOST_INPUT_CYCLE_REFUSED');
  seen.add(value);
  if(Array.isArray(value)){
    for(let index=0;index<value.length;index+=1){
      if(!Object.hasOwn(value,index))fail('PRODUCT_API_HOST_INPUT_SPARSE_ARRAY_REFUSED');
    }
    const output=value.map((entry)=>stable(entry,seen));
    seen.delete(value);
    return output;
  }
  const keys=Reflect.ownKeys(value);
  if(keys.some((key)=>typeof key!=='string'))fail('PRODUCT_API_HOST_INPUT_SYMBOL_FIELD_REFUSED');
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||descriptor.enumerable!==true){
      fail('PRODUCT_API_HOST_INPUT_NONENUMERABLE_FIELD_REFUSED');
    }
  }
  const output=Object.fromEntries(keys.sort().map((key)=>[key,stable(value[key],seen)]));
  seen.delete(value);
  return output;
}
function digest(value){
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function trustedContext(value){
  if(value===undefined)return Object.freeze({});
  if(value===null||typeof value!=='object'||Array.isArray(value))fail('PRODUCT_API_TRUSTED_CONTEXT_INVALID');
  assertPlainTrustedData(value);
  assertCredentialFreeRecord(value,{
    secretKeyPattern:SECRET_KEY,
    secretCode:'PRODUCT_API_TRUSTED_CONTEXT_SECRET_FIELD_REFUSED',
    accessorCode:'PRODUCT_API_TRUSTED_CONTEXT_ACCESSOR_FIELD_REFUSED'
  });
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!TRUSTED_CONTEXT_KEYS.has(key))fail('PRODUCT_API_TRUSTED_CONTEXT_FIELD_FORBIDDEN');
  }
  return Object.freeze(Object.fromEntries([...TRUSTED_CONTEXT_KEYS].map((key)=>[
    key,Object.getOwnPropertyDescriptor(value,key)?.value
  ])));
}
function rejectCallerAuthorityEvidence(input){
  for(const key of Reflect.ownKeys(input)){
    if(typeof key==='string'&&CALLER_AUTHORITY_EVIDENCE_KEYS.has(key)){
      fail('PRODUCT_API_CALLER_AUTHORITY_EVIDENCE_FORBIDDEN');
    }
  }
}
function refusedAccessGrant(code){
  return Object.freeze({
    schema:'xiio.sdk.product-access-grant-resolution/v1',state:'REFUSED',matched:false,
    blockers:Object.freeze([code]),access_grant_ref:null,access_grant_generation:null,currentness_ref:null,
    action_allowed:false,authority_granted:false,provider_effect:false,billing_effect:false,effect_authority:false,
  });
}
function refusedBilling(code){
  return Object.freeze({
    schema:'xiio.sdk.product-billing-admission-resolution/v1',state:'REFUSED',matched:false,
    blockers:Object.freeze([code]),billing_admission_ref:null,billing_admission_generation:null,currentness_ref:null,
    billing_authority_ref:null,pricing_ref:null,rate_card_ref:null,budget_ref:null,budget_reservation_ref:null,
    requested_quantity:null,maximum_quantity:null,provider_attempt_allowed:false,billing_commit_allowed:false,
    billing_effect_authority:false,provider_effect:false,effect_authority:false,
  });
}

export function compileProductApiAdmission(input={},trusted=undefined){
  assertCredentialFreeRecord(input,{
    secretKeyPattern:SECRET_KEY,
    secretCode:'PRODUCT_API_ADMISSION_SECRET_FIELD_REFUSED',
    accessorCode:'PRODUCT_API_ADMISSION_ACCESSOR_FIELD_REFUSED'
  });
  rejectCallerAuthorityEvidence(input);
  const host=trustedContext(trusted);
  const product_ref=ref(input.product_ref,'PRODUCT_REF_INVALID');
  const api_ref=ref(input.api_ref,'API_REF_INVALID');
  const capability_ref=ref(input.capability_ref,'CAPABILITY_REF_INVALID');
  const operation_ref=ref(input.operation_ref,'OPERATION_REF_INVALID');
  const principal_ref=ref(input.principal_ref,'PRINCIPAL_REF_INVALID');
  const tenant_ref=ref(input.tenant_ref,'TENANT_REF_INVALID');
  const role=ref(input.role,'ROLE_INVALID');
  if(!ROLES.has(role))fail('ROLE_INVALID');
  const callerMode=optionalMode(input.billing_mode);

  const declaration=resolveProductApiOperation({
    declaration:input.api_declaration,currentness:input.api_declaration_currentness,
    product_ref,api_ref,capability_ref,operation_ref,role,
  });
  const mode=declaration.billing_mode;
  const runtime_ref=ref(input.api_declaration?.runtime_ref,'RUNTIME_REF_INVALID');

  const entitlement=resolveProductEntitlementScope({
    binding:input.product_entitlement_binding,currentness:input.product_entitlement_currentness,
    principal_ref,tenant_ref,product_ref,
    api_declaration_ref:declaration.declaration_ref,
    api_declaration_generation:declaration.declaration_generation,
    product_capability_ref:capability_ref,operation_ref,
  });
  const scope=Object.freeze({
    principal_ref,tenant_ref,product_ref,
    api_declaration_ref:declaration.declaration_ref,
    api_declaration_generation:declaration.declaration_generation,
    product_capability_ref:capability_ref,operation_ref,
    entitlement_ref:entitlement.entitlement_ref,
    entitlement_generation:entitlement.entitlement_generation,
  });

  const route=inspectQualifiedWorkerExecutionRoute(host.worker_execution_route_evidence);
  const routeQualified=route?.state==='QUALIFIED'&&route.execution_route_qualified===true;
  const routeIdentityMatches=routeQualified&&
    route.runtime_ref===runtime_ref&&route.product_ref===product_ref&&route.api_ref===api_ref&&
    route.capability_ref===capability_ref&&route.operation_ref===operation_ref;
  const executionRouteAdmitted=routeQualified&&routeIdentityMatches;

  let grant;
  try{
    grant=resolveProductAccessGrantScope({
      binding:host.product_access_grant_binding,
      currentness:host.product_access_grant_currentness,
      ...scope,role,
    });
  }catch(error){
    grant=refusedAccessGrant(errorCode(error,'ACCESS_GRANT_RESOLUTION_FAILED'));
  }

  const billingModeMatches=callerMode===null||callerMode===mode;
  const billingEvidenceSupplied=[
    host.product_billing_admission_binding,
    host.product_billing_admission_currentness,
  ].some((value)=>value!==undefined&&value!==null);
  let requested_quantity=null;
  let billing;
  if(mode==='METERED'){
    try{
      requested_quantity=positiveNumber(input.requested_quantity,'BILLING_REQUESTED_QUANTITY_INVALID');
      billing=resolveProductBillingAdmissionScope({
        binding:host.product_billing_admission_binding,
        currentness:host.product_billing_admission_currentness,
        ...scope,
        access_grant_ref:grant.access_grant_ref,
        access_grant_generation:grant.access_grant_generation,
        meter_unit_type:declaration.meter_unit_type,
        requested_quantity,
      });
    }catch(error){
      billing=refusedBilling(errorCode(error,'BILLING_ADMISSION_RESOLUTION_FAILED'));
    }
  }else if(billingEvidenceSupplied||input.requested_quantity!==undefined){
    billing=refusedBilling('NON_METERED_OPERATION_BILLING_EVIDENCE_FORBIDDEN');
  }else{
    billing=Object.freeze({
      schema:'xiio.sdk.product-billing-admission-resolution/v1',state:'NOT_REQUIRED',matched:true,
      blockers:Object.freeze([]),billing_admission_ref:null,billing_admission_generation:null,currentness_ref:null,
      billing_authority_ref:null,pricing_ref:null,rate_card_ref:null,budget_ref:null,budget_reservation_ref:null,
      requested_quantity:null,maximum_quantity:null,provider_attempt_allowed:false,billing_commit_allowed:false,
      billing_effect_authority:false,provider_effect:false,effect_authority:false,
    });
  }

  const admitted=declaration.matched&&entitlement.matched&&executionRouteAdmitted&&
    grant.matched&&billing.matched&&billingModeMatches;
  const blockers=[...declaration.blockers,...entitlement.blockers,...grant.blockers,...billing.blockers];
  if(!routeQualified)blockers.push(route?.first_red??'WORKER_EXECUTION_ROUTE_NOT_QUALIFIED');
  else if(!routeIdentityMatches)blockers.push('WORKER_EXECUTION_ROUTE_IDENTITY_MISMATCH');
  if(!billingModeMatches)blockers.push('BILLING_MODE_MISMATCH');

  const acceptedRoute=executionRouteAdmitted?route:null;
  return Object.freeze({
    schema:'xiio.product-api-admission/v6',
    product_ref,api_ref,runtime_ref,capability_ref,operation_ref,principal_ref,tenant_ref,role,
    api_declaration_ref:declaration.declaration_ref,
    api_declaration_generation:declaration.declaration_generation,
    api_declaration_currentness_ref:declaration.currentness_ref,
    api_declaration_custody_verified:declaration.declaration_custody_verified,
    api_declaration_dependency_id:declaration.dependency_id,
    api_declaration_owner_repo:declaration.owner_repo,
    api_declaration_accepted_generation:declaration.accepted_generation,
    product_entitlement_ref:entitlement.entitlement_ref,
    product_entitlement_generation:entitlement.entitlement_generation,
    product_entitlement_currentness_ref:entitlement.currentness_ref,
    entitlement_capability_ref:entitlement.entitlement_capability_ref,
    entitlement_tier:entitlement.tier,
    access_grant_ref:grant.access_grant_ref,
    access_grant_generation:grant.access_grant_generation,
    access_grant_currentness_ref:grant.currentness_ref,
    access_grant_current:grant.matched===true,
    worker_execution_route_qualified:executionRouteAdmitted,
    worker_execution_route_ref:acceptedRoute?.route_ref??null,
    worker_execution_route_digest:acceptedRoute?.route_digest??null,
    worker_execution_route_observation_ref:acceptedRoute?.observation_ref??null,
    worker_execution_route_readback_ref:acceptedRoute?.route_readback_ref??null,
    worker_execution_route_readback_generation:acceptedRoute?.route_readback_generation??null,
    worker_ref:acceptedRoute?.worker_ref??null,
    worker_device_ref:acceptedRoute?.device_ref??null,
    worker_installed_generation:acceptedRoute?.installed_generation??null,
    worker_installation_ref:acceptedRoute?.installation_ref??null,
    worker_installation_sha256:acceptedRoute?.installation_sha256??null,
    worker_binding_ref:acceptedRoute?.binding_ref??null,
    worker_binding_digest:acceptedRoute?.binding_digest??null,
    worker_liveness_observation_ref:acceptedRoute?.liveness_observation_ref??null,
    worker_canary_work_ref:acceptedRoute?.canary_work_ref??null,
    worker_canary_request_digest:acceptedRoute?.canary_request_digest??null,
    worker_canary_result_ref:acceptedRoute?.canary_result_ref??null,
    worker_canary_return_ref:acceptedRoute?.canary_return_ref??null,
    worker_route_producer_ref:acceptedRoute?.producer_ref??null,
    worker_route_producer_generation:acceptedRoute?.producer_generation??null,
    worker_route_observed_at:acceptedRoute?.observed_at??null,
    worker_route_expires_at:acceptedRoute?.expires_at??null,
    execution_route_first_red:executionRouteAdmitted?null:
      routeQualified?'WORKER_EXECUTION_ROUTE_IDENTITY_MISMATCH':route?.first_red??'WORKER_EXECUTION_ROUTE_NOT_QUALIFIED',
    billing_mode:mode,meter_unit_type:declaration.meter_unit_type,
    billing_admission_ref:billing.billing_admission_ref,
    billing_admission_generation:billing.billing_admission_generation,
    billing_admission_currentness_ref:billing.currentness_ref,
    billing_authority_ref:billing.billing_authority_ref,
    pricing_ref:billing.pricing_ref,
    rate_card_ref:billing.rate_card_ref,
    budget_ref:billing.budget_ref,
    budget_reservation_ref:billing.budget_reservation_ref,
    requested_quantity:billing.requested_quantity,
    maximum_quantity:billing.maximum_quantity,
    provider_attempt_allowed:admitted&&mode==='METERED'&&billing.provider_attempt_allowed===true,
    billing_commit_allowed:false,
    state:admitted?'ADMITTED':'REFUSED',action_allowed:admitted,
    provider_effect:false,effect_authority:false,billing_effect_authority:false,
    blockers:Object.freeze(blockers),
    hard:Object.freeze([
      'ROLE!=ENTITLEMENT','ADMIN!=ENTITLEMENT','SUPERADMIN!=ENTITLEMENT',
      'ADMIN_ROLE!=ACCESS_GRANT','SUPERADMIN_ROLE!=ACCESS_GRANT',
      'ADMIN_ROLE!=BILLING_ADMISSION','SUPERADMIN_ROLE!=BILLING_ADMISSION',
      'ACCESS_GRANT!=ENTITLEMENT','ACCESS_GRANT_CURRENT!=BILLING_ADMISSION',
      'ENTITLEMENT_BINDING!=BILLING_ADMISSION','BILLING_ADMISSION!=BILLING_COMMIT',
      'API_DECLARATION!=ACCESS_GRANT','SUPPLIED_DECLARATION_CURRENTNESS!=VERIFIED_DECLARATION_CUSTODY',
      'CALLER_BILLING_MODE!=DECLARED_BILLING_MODE','MALFORMED_BILLING_FIELD!=ABSENT_BILLING_FIELD',
      'CALLER_ENTITLEMENT_BOOLEAN!=ENTITLEMENT_BINDING','CALLER_ACCESS_GRANT_BOOLEAN!=ACCESS_GRANT_BINDING',
      'CALLER_BILLING_BOOLEAN!=BILLING_ADMISSION_BINDING','PRODUCT_API_ADMISSION_REQUEST!=CREDENTIAL_STORE',
      'CALLER_AUTHORITY_EVIDENCE!=TRUSTED_HOST_AUTHORITY_EVIDENCE',
      'TRUSTED_AUTHORITY_EVIDENCE_MUST_BE_PLAIN_DATA','SERIALIZED_ROUTE!=QUALIFIED_ROUTE',
      'ENTITLEMENT_CURRENT!=EXECUTION_ROUTE_QUALIFIED','TOOL_VISIBLE!=TOOL_EXECUTABLE',
      'EXECUTION_ROUTE_QUALIFIED!=PRODUCT_API_ADMITTED','EXECUTION_ROUTE_QUALIFIED!=WARD_EFFECT_AUTHORIZED',
      'REMOTE_EXECUTION_ROUTE!=LOCAL_CONTAINER_RUNTIME','METER_EVENT!=MONEY',
      'ACTION_ALLOWED!=EFFECT_AUTHORIZED'
    ])
  });
}

function hostRequest(value={}){
  assertPlainTrustedData(value,new WeakSet(),{
    nondata:'PRODUCT_API_HOST_REQUEST_NONDATA_FIELD_REFUSED',
    prototype:'PRODUCT_API_HOST_REQUEST_PROTOTYPE_INVALID',
    accessor:'PRODUCT_API_HOST_REQUEST_ACCESSOR_FIELD_REFUSED',
  });
  assertCredentialFreeRecord(value,{
    secretKeyPattern:SECRET_KEY,
    secretCode:'PRODUCT_API_HOST_REQUEST_SECRET_FIELD_REFUSED',
    accessorCode:'PRODUCT_API_HOST_REQUEST_ACCESSOR_FIELD_REFUSED',
  });
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!HOST_REQUEST_KEYS.has(key))fail('PRODUCT_API_HOST_REQUEST_FIELD_FORBIDDEN');
  }
  return Object.freeze({
    request_ref:ref(value.request_ref,'PRODUCT_API_HOST_REQUEST_REF_INVALID'),
    runtime_ref:ref(value.runtime_ref,'PRODUCT_API_HOST_RUNTIME_REF_INVALID'),
    product_ref:ref(value.product_ref,'PRODUCT_API_HOST_PRODUCT_REF_INVALID'),
    api_ref:ref(value.api_ref,'PRODUCT_API_HOST_API_REF_INVALID'),
    capability_ref:ref(value.capability_ref,'PRODUCT_API_HOST_CAPABILITY_REF_INVALID'),
    operation_ref:ref(value.operation_ref,'PRODUCT_API_HOST_OPERATION_REF_INVALID'),
    worker_ref:ref(value.worker_ref,'PRODUCT_API_HOST_WORKER_REF_INVALID'),
    device_ref:ref(value.device_ref,'PRODUCT_API_HOST_DEVICE_REF_INVALID'),
  });
}
function hostRefused(request,first_red,extra={}){
  return Object.freeze({
    schema:PRODUCT_API_HOST_ADMISSION_SCHEMA,state:'REFUSED',first_red,
    request_ref:request?.request_ref??null,runtime_ref:request?.runtime_ref??null,
    product_ref:request?.product_ref??null,api_ref:request?.api_ref??null,
    capability_ref:request?.capability_ref??null,operation_ref:request?.operation_ref??null,
    worker_ref:request?.worker_ref??null,device_ref:request?.device_ref??null,
    ...extra,
    product_api_admitted:false,action_allowed:false,authority_granted:false,
    effect_authority:false,provider_effect:false,billing_effect_authority:false,
  });
}
function exactKeys(value,allowed,code){
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!allowed.has(key))fail(code);
  }
}
function readHostInput(raw,request){
  const codes={
    nondata:'PRODUCT_API_HOST_INPUT_NONDATA_FIELD_REFUSED',
    prototype:'PRODUCT_API_HOST_INPUT_PROTOTYPE_INVALID',
    accessor:'PRODUCT_API_HOST_INPUT_ACCESSOR_FIELD_REFUSED',
  };
  assertPlainTrustedData(raw,new WeakSet(),codes);
  assertCredentialFreeRecord(raw,{
    secretKeyPattern:SECRET_KEY,
    secretCode:'PRODUCT_API_HOST_INPUT_SECRET_FIELD_REFUSED',
    accessorCode:'PRODUCT_API_HOST_INPUT_ACCESSOR_FIELD_REFUSED',
  });
  exactKeys(raw,HOST_READBACK_KEYS,'PRODUCT_API_HOST_INPUT_FIELD_FORBIDDEN');
  if(raw?.schema!==PRODUCT_API_HOST_INPUT_SCHEMA||raw?.state!=='CURRENT_INPUT_REOPENED'||
    raw.request_ref!==request.request_ref||raw.authority_granted!==false||
    raw.effect_authority!==false||raw.provider_effect!==false||raw.billing_effect_authority!==false){
    fail('PRODUCT_API_HOST_INPUT_READBACK_INVALID');
  }
  const source_ref=ref(raw.source_ref,'PRODUCT_API_HOST_INPUT_SOURCE_REF_INVALID');
  const source_generation=ref(raw.source_generation,'PRODUCT_API_HOST_INPUT_SOURCE_GENERATION_INVALID');
  const readback_ref=ref(raw.readback_ref,'PRODUCT_API_HOST_INPUT_READBACK_REF_INVALID');
  const readback_generation=ref(raw.readback_generation,'PRODUCT_API_HOST_INPUT_READBACK_GENERATION_INVALID');
  if(source_generation!==readback_generation)fail('PRODUCT_API_HOST_INPUT_CURRENTNESS_MISMATCH');
  const input=raw.input;
  const authority=raw.authority;
  assertPlainTrustedData(input,new WeakSet(),codes);
  assertPlainTrustedData(authority,new WeakSet(),codes);
  if(!input||typeof input!=='object'||Array.isArray(input))fail('PRODUCT_API_HOST_INPUT_REQUIRED');
  if(!authority||typeof authority!=='object'||Array.isArray(authority))fail('PRODUCT_API_HOST_AUTHORITY_REQUIRED');
  exactKeys(authority,HOST_AUTHORITY_KEYS,'PRODUCT_API_HOST_AUTHORITY_FIELD_FORBIDDEN');
  rejectCallerAuthorityEvidence(input);
  const subject=Object.freeze({input,authority});
  const subject_digest=String(raw.subject_digest??'');
  const readback_digest=String(raw.readback_digest??'');
  const actual_digest=digest(subject);
  if(!/^[a-f0-9]{64}$/.test(subject_digest)||!/^[a-f0-9]{64}$/.test(readback_digest)||
    subject_digest!==readback_digest||subject_digest!==actual_digest){
    fail('PRODUCT_API_HOST_INPUT_DIGEST_MISMATCH');
  }
  if(input.product_ref!==request.product_ref||input.api_ref!==request.api_ref||
    input.capability_ref!==request.capability_ref||input.operation_ref!==request.operation_ref||
    input.api_declaration?.runtime_ref!==request.runtime_ref){
    fail('PRODUCT_API_HOST_INPUT_REQUEST_MISMATCH');
  }
  return Object.freeze({
    input,authority:Object.freeze(Object.fromEntries([...HOST_AUTHORITY_KEYS].map((key)=>[
      key,Object.getOwnPropertyDescriptor(authority,key)?.value
    ]))),source_ref,source_generation,readback_ref,readback_generation,subject_digest,
  });
}

export function createProductApiHostAdmission({ports,clock=()=>new Date().toISOString()}={}){
  if(!ports||HOST_PORTS.some((name)=>typeof ports[name]!=='function'))fail('PRODUCT_API_HOST_PORTS_UNBOUND');
  if(typeof clock!=='function')fail('PRODUCT_API_HOST_CLOCK_INVALID');
  const qualifier=createWorkerExecutionRouteQualifier({ports,clock});
  async function admit(value={}){
    let request;
    try{
      request=hostRequest(value);
      const readback=readHostInput(await ports.readProductApiAdmissionInput(request),request);
      const route=await qualifier.qualify(request);
      if(route?.state!=='QUALIFIED'){
        return hostRefused(request,route?.first_red??'WORKER_EXECUTION_ROUTE_NOT_QUALIFIED');
      }
      const admission=compileProductApiAdmission(readback.input,{
        worker_execution_route_evidence:route,
        ...readback.authority,
      });
      if(admission.state!=='ADMITTED'||admission.action_allowed!==true){
        return hostRefused(request,admission.blockers?.[0]??'PRODUCT_API_ADMISSION_REFUSED',{
          blockers:admission.blockers??Object.freeze([]),
        });
      }
      if(admission.runtime_ref!==request.runtime_ref||admission.product_ref!==request.product_ref||
        admission.api_ref!==request.api_ref||admission.capability_ref!==request.capability_ref||
        admission.operation_ref!==request.operation_ref||admission.worker_ref!==request.worker_ref||
        admission.worker_device_ref!==request.device_ref){
        fail('PRODUCT_API_HOST_ADMISSION_REQUEST_MISMATCH');
      }
      const result=Object.freeze({
        schema:PRODUCT_API_HOST_ADMISSION_SCHEMA,state:'ADMITTED',first_red:null,...request,
        input_source_ref:readback.source_ref,input_source_generation:readback.source_generation,
        input_readback_ref:readback.readback_ref,input_readback_generation:readback.readback_generation,
        subject_digest:readback.subject_digest,product_api_admission:admission,
        product_api_admitted:true,action_allowed:true,authority_granted:false,
        effect_authority:false,provider_effect:false,billing_effect_authority:false,
        hard:Object.freeze([
          'HOST_INPUT_READBACK!=CALLER_INPUT','LIVE_ROUTE!=SERIALIZED_ROUTE',
          'LIVE_ACCESS_CURRENTNESS!=SERIALIZED_ACCESS_CURRENTNESS',
          'LIVE_BILLING_CURRENTNESS!=SERIALIZED_BILLING_CURRENTNESS',
          'PRODUCT_API_HOST_ADMITTED!=WARD_EFFECT_AUTHORIZED',
          'PRODUCT_API_HOST_ADMITTED!=PROVIDER_EFFECT','PRODUCT_API_HOST_ADMITTED!=BILLING_COMMIT',
        ]),
      });
      LIVE_HOST_ADMISSIONS.add(result);
      LIVE_HOST_ROUTES.set(result,route);
      return result;
    }catch(error){
      return hostRefused(request,errorCode(error,'PRODUCT_API_HOST_UNAVAILABLE'));
    }
  }
  return Object.freeze({admit});
}

export function inspectProductApiHostAdmission(value,expected={}, {clock=()=>new Date().toISOString()}={}){
  if(typeof clock!=='function')return hostRefused(null,'PRODUCT_API_HOST_CLOCK_INVALID');
  if(!value||typeof value!=='object'||!LIVE_HOST_ADMISSIONS.has(value)){
    return hostRefused(null,'PRODUCT_API_HOST_ADMISSION_PRODUCER_UNBOUND');
  }
  const currentRoute=inspectQualifiedWorkerExecutionRoute(LIVE_HOST_ROUTES.get(value),{clock});
  if(currentRoute?.state!=='QUALIFIED'){
    return hostRefused(value,currentRoute?.first_red??'WORKER_EXECUTION_ROUTE_NOT_QUALIFIED');
  }
  let coordinates;
  try{coordinates=hostRequest(expected);}catch(error){
    return hostRefused(value,errorCode(error,'PRODUCT_API_HOST_EXPECTED_REQUEST_INVALID'));
  }
  for(const key of HOST_REQUEST_KEYS){
    if(value[key]!==coordinates[key])return hostRefused(value,'PRODUCT_API_HOST_ADMISSION_IDENTITY_MISMATCH');
  }
  const admission=value.product_api_admission;
  if(value.schema!==PRODUCT_API_HOST_ADMISSION_SCHEMA||value.state!=='ADMITTED'||
    value.product_api_admitted!==true||value.action_allowed!==true||value.authority_granted!==false||
    value.effect_authority!==false||value.provider_effect!==false||value.billing_effect_authority!==false||
    admission?.schema!=='xiio.product-api-admission/v6'||admission.state!=='ADMITTED'||
    admission.action_allowed!==true||admission.billing_commit_allowed!==false||
    admission.effect_authority!==false||admission.provider_effect!==false||admission.billing_effect_authority!==false){
    return hostRefused(value,'PRODUCT_API_HOST_ADMISSION_BRAND_INVALID');
  }
  return value;
}