import {createHash} from 'node:crypto';
/**
 * Product-neutral BINS legal-evidence event -> existing SDK worker.file-read.
 * Structural projection only: no filesystem access, provider credential,
 * Ward grant, BINS custody certification or new receipt ledger.
 */
export const BINS_VERSION_CONSUMER_SCHEMA = 'xiio.sdk.bins-version-consumer/v1';
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const SHA = /^[0-9a-f]{64}$/;
function required(value, code) {
  if (typeof value !== 'string' || !REF.test(value)) throw new Error(code);
  return value;
}
function equal(a, b, code) {
  if (a !== b) throw new Error(code);
}
function boundedBytes(value) {
  // #205 currently supports at most 16 KiB. Larger originals use the
  // existing authorized BINS/Switchboard transfer, not a direct-path read.
  if (!Number.isSafeInteger(value) || value < 0 || value > 16 * 1024) {
    throw new Error('BINS_VERSION_CONSUMER_REQUIRES_BOUNDED_RETURN');
  }
  return value;
}

const GENERIC_RESOURCE_KEYS=new Set([
  'state','resource_ref','version_ref','parent_version_ref','storage_binding_ref',
  'sha256','byte_length','subject_ref'
]);
function genericResource(value){
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('BINS_VERSION_CONSUMER_RESOURCE_REQUIRED');
  for(const key of Object.keys(value)) if(!GENERIC_RESOURCE_KEYS.has(key))
    throw new Error('BINS_VERSION_CONSUMER_RESOURCE_FIELD_FORBIDDEN');
  if(value.state!=='BINS_CUSTODIED')
    throw new Error('BINS_VERSION_CONSUMER_RESOURCE_UNQUALIFIED');
  const resourceRef=required(value.resource_ref,'BINS_VERSION_CONSUMER_RESOURCE_REQUIRED');
  const versionRef=required(value.version_ref,'BINS_VERSION_CONSUMER_VERSION_REQUIRED');
  const storageBindingRef=required(value.storage_binding_ref,'BINS_VERSION_CONSUMER_STORAGE_BINDING_REQUIRED');
  if(typeof value.sha256!=='string'||!SHA.test(value.sha256))
    throw new Error('BINS_VERSION_CONSUMER_DIGEST_INVALID');
  const size=boundedBytes(value.byte_length);
  return Object.freeze({
    state:'BINS_CUSTODIED',
    resource_ref:resourceRef,
    version_ref:versionRef,
    parent_version_ref:value.parent_version_ref==null?null:
      required(value.parent_version_ref,'BINS_VERSION_CONSUMER_PARENT_VERSION_INVALID'),
    storage_binding_ref:storageBindingRef,
    sha256:value.sha256,
    byte_length:size,
    subject_ref:value.subject_ref==null?null:
      required(value.subject_ref,'BINS_VERSION_CONSUMER_SUBJECT_REF_INVALID'),
  });
}

export function prepareBinsResourceVersionRead({resource,work,returned}={}){
  const stored=genericResource(resource);
  equal(work?.work_ref,returned?.work_ref,'BINS_VERSION_CONSUMER_WORK_MISMATCH');
  equal(work?.work_generation,returned?.work_generation,
    'BINS_VERSION_CONSUMER_WORK_GENERATION_MISMATCH');
  equal(returned?.resource_ref,stored.resource_ref,'BINS_VERSION_CONSUMER_RETURN_RESOURCE_MISMATCH');
  equal(returned?.version_ref,stored.version_ref,'BINS_VERSION_CONSUMER_RETURN_VERSION_MISMATCH');
  equal(returned?.storage_binding_ref,stored.storage_binding_ref,'BINS_VERSION_CONSUMER_RETURN_BINDING_MISMATCH');
  const scope=Object.freeze({
    work_ref:required(work?.work_ref,'BINS_VERSION_CONSUMER_WORK_REQUIRED'),
    work_generation:required(work?.work_generation,'BINS_VERSION_CONSUMER_WORK_GENERATION_REQUIRED'),
    return_ref:required(returned?.return_ref,'BINS_VERSION_CONSUMER_RETURN_REQUIRED'),
    resource_ref:stored.resource_ref,
    version_ref:stored.version_ref,
    storage_binding_ref:stored.storage_binding_ref,
    expected_sha256:stored.sha256,
    expected_bytes:stored.byte_length,
  });
  return Object.freeze({
    schema:BINS_VERSION_CONSUMER_SCHEMA,
    state:'REQUEST_SCOPE_PREPARED_UNVERIFIED',
    subject_ref:stored.subject_ref,
    parent_version_ref:stored.parent_version_ref,
    scope,
    authority_granted:false,
    custody_independently_verified:false,
    return_certified:false,
    apply_return_verified:false,
  });
}

/**
 * Event is the BINS owner's normalized record. Work and return coordinates
 * must come from the separately authenticated original requester/broker.
 * Merely supplying these references does not establish their authority.
 */
export function prepareBinsVersionRead({event, work, returned} = {}) {
  if (event?.schema !== 'xiio.dataforge.legal-evidence/v1' ||
      event.state !== 'BINS_CUSTODIED') {
    throw new Error('BINS_VERSION_CONSUMER_EVENT_UNQUALIFIED');
  }
  const matterRef = required(event.case_ref, 'BINS_VERSION_CONSUMER_MATTER_REQUIRED');
  equal(required(work?.matter_ref, 'BINS_VERSION_CONSUMER_WORK_MATTER_REQUIRED'),
    matterRef, 'BINS_VERSION_CONSUMER_MATTER_MISMATCH');
  const destination = event.destination_binding;
  required(destination?.registry_ref, 'BINS_VERSION_CONSUMER_REGISTRY_REQUIRED');
  required(destination?.registry_generation, 'BINS_VERSION_CONSUMER_REGISTRY_GENERATION_REQUIRED');
  required(destination?.binding_ref, 'BINS_VERSION_CONSUMER_REGISTRY_BINDING_REQUIRED');
  const stored = event.bins || {};
  const coordinate = stored.custody_coordinate || {};
  const resourceRef = required(stored.resource_ref, 'BINS_VERSION_CONSUMER_RESOURCE_REQUIRED');
  const versionRef = required(stored.version_ref, 'BINS_VERSION_CONSUMER_VERSION_REQUIRED');
  equal(coordinate.resource_ref, resourceRef, 'BINS_VERSION_CONSUMER_RESOURCE_MISMATCH');
  equal(coordinate.version_ref, versionRef, 'BINS_VERSION_CONSUMER_VERSION_MISMATCH');
  const storageBindingRef = required(stored.binding_ref, 'BINS_VERSION_CONSUMER_STORAGE_BINDING_REQUIRED');
  const digest = coordinate.sha256;
  if (typeof digest !== 'string' || !SHA.test(digest)) {
    throw new Error('BINS_VERSION_CONSUMER_DIGEST_INVALID');
  }
  equal(event.source?.sha256, digest, 'BINS_VERSION_CONSUMER_SOURCE_DIGEST_MISMATCH');
  const size = boundedBytes(coordinate.byte_length);
  equal(event.source?.size_bytes, size, 'BINS_VERSION_CONSUMER_SOURCE_BYTES_MISMATCH');
  const prepared=prepareBinsResourceVersionRead({
    resource:{
      state:'BINS_CUSTODIED',
      resource_ref:resourceRef,
      version_ref:versionRef,
      parent_version_ref:stored.parent_version_ref??null,
      storage_binding_ref:storageBindingRef,
      sha256:digest,
      byte_length:size,
      subject_ref:matterRef,
    },
    work,
    returned,
  });
  return Object.freeze({
    ...prepared,
    matter_ref:matterRef,
    event_id:required(event.event_id,'BINS_VERSION_CONSUMER_EVENT_ID_REQUIRED'),
  });
}

/** Compare the existing SDK worker's actual readFile return to the pinned
 * request. This does not authenticate a caller-generated readback or authorize
 * APPLY_RETURN. Only the admitted worker can supply trustworthy bytes.
 */
export function checkBinsVersionReadReturn(prepared, readback) {
  if (prepared?.schema !== BINS_VERSION_CONSUMER_SCHEMA ||
      prepared.state !== 'REQUEST_SCOPE_PREPARED_UNVERIFIED' ||
      readback?.schema !== 'xiio.sdk.worker-connection/v1' ||
      readback.state !== 'REQUESTER_FILE_BYTES_MATCHED') {
    throw new Error('BINS_VERSION_CONSUMER_READBACK_UNQUALIFIED');
  }
  const scope = prepared.scope;
  for (const key of ['work_ref','work_generation','return_ref','resource_ref',
      'version_ref','storage_binding_ref']) {
    equal(readback[key], scope[key], 'BINS_VERSION_CONSUMER_READBACK_IDENTITY_MISMATCH');
  }
  equal(readback.sha256, scope.expected_sha256, 'BINS_VERSION_CONSUMER_READBACK_DIGEST_MISMATCH');
  equal(readback.bytes, scope.expected_bytes, 'BINS_VERSION_CONSUMER_READBACK_BYTES_MISMATCH');
  // Recompute integrity from the actual bytes of the worker's return.
  // A supplied digest and length alone can describe bytes that never arrived.
  const b64=readback.contentBase64;
  if(typeof b64!=='string' ||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) {
    throw new Error('BINS_VERSION_CONSUMER_RETURN_BYTES_MISSING');
  }
  const bytes=Buffer.from(b64,'base64');
  if(bytes.toString('base64')!==b64 || bytes.length!==scope.expected_bytes ||
     createHash('sha256').update(bytes).digest('hex')!==scope.expected_sha256) {
    throw new Error('BINS_VERSION_CONSUMER_RETURN_BYTE_INTEGRITY_MISMATCH');
  }
  required(readback.readback_ref, 'BINS_VERSION_CONSUMER_READBACK_REF_REQUIRED');
  if (readback.authority_granted !== false || readback.apply_return_verified !== false) {
    throw new Error('BINS_VERSION_CONSUMER_READBACK_AUTHORITY_CLAIM');
  }
  return Object.freeze({
    schema: BINS_VERSION_CONSUMER_SCHEMA,
    state: 'RECEIVER_SCOPE_MATCHED_UNVERIFIED',
    readback_ref: readback.readback_ref,
    resource_ref: scope.resource_ref,
    version_ref: scope.version_ref,
    authority_granted: false,
    return_certified: false,
    apply_return_verified: false,
  });
}

// Preserve an existing worker repair route, never arbitrary provider payload.
// Snapshot data descriptors so accessors cannot change validated output fields.
function repairRecord(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw new Error('BINS_VERSION_CONSUMER_REPAIR_UNQUALIFIED');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Object.values(descriptors).some(d=>!Object.hasOwn(d,'value')))
    throw new Error('BINS_VERSION_CONSUMER_REPAIR_UNQUALIFIED');
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key,d])=>[key,d.value])));
}
function blockedRepair(returned,scope) {
  returned=repairRecord(returned);
  if(returned.required_repair==null)return {};
  if(returned.schema!=='xiio.sdk.worker-connection/v1' || returned.state!=='BLOCKED' ||
     returned.authority_granted!==false || returned.apply_return_verified!==false)
    throw new Error('BINS_VERSION_CONSUMER_REPAIR_UNQUALIFIED');
  const operation=repairRecord(returned.blocked_operation);
  if(operation.operation!=='worker.file-read')
    throw new Error('BINS_VERSION_CONSUMER_REPAIR_SCOPE_MISMATCH');
  for(const key of Object.keys(scope))
    equal(operation[key],scope[key],'BINS_VERSION_CONSUMER_REPAIR_SCOPE_MISMATCH');
  const repair=repairRecord(returned.required_repair);
  if(typeof repair.owner_approval_needed!=='boolean')
    throw new Error('BINS_VERSION_CONSUMER_REPAIR_UNQUALIFIED');
  return {state:'BLOCKED',
    first_red:required(returned.first_red,'BINS_VERSION_CONSUMER_FIRST_RED_REQUIRED'),
    next_action:required(returned.next_action,'BINS_VERSION_CONSUMER_REPAIR_ACTION_INVALID'),
    required_repair:Object.freeze({
      owner_ref:required(repair.owner_ref,'BINS_VERSION_CONSUMER_REPAIR_OWNER_INVALID'),
      action:required(repair.action,'BINS_VERSION_CONSUMER_REPAIR_ACTION_INVALID'),
      owner_approval_needed:repair.owner_approval_needed,
    })};
}

/**
 * Invoke the existing SDK #205 worker, never a direct BINS path or endpoint.
 * Only the worker's admitted runtime adapter can provide a trustworthy result.
 * This glue neither creates a Ward grant nor performs APPLY_RETURN.
 */
export async function readBinsVersionWithWorker({prepared,worker,binding}={}) {
  // Read caller-controlled accessors exactly once. A frozen object may still
  // expose a getter returning a different frozen scope on each access. Pin
  // owned scalar fields before the asynchronous worker admission boundary.
  const sourceScope=prepared?.scope;
  if(prepared?.schema!==BINS_VERSION_CONSUMER_SCHEMA ||
     prepared.state!=='REQUEST_SCOPE_PREPARED_UNVERIFIED' ||
     !sourceScope || !Object.isFrozen(sourceScope)) {
    throw new Error('BINS_VERSION_CONSUMER_SCOPE_NOT_PREPARED');
  }
  const keys=['work_ref','work_generation','return_ref','resource_ref','version_ref',
    'storage_binding_ref','expected_sha256','expected_bytes'];
  // Frozen does not mean data-only. Reject accessors before evaluating any
  // coordinate so a getter cannot retarget identity across the async boundary.
  const descriptors=Object.getOwnPropertyDescriptors(sourceScope);
  if(Reflect.ownKeys(descriptors).length!==keys.length ||
     !keys.every(key=>descriptors[key] && Object.hasOwn(descriptors[key],'value'))) {
    throw new Error('BINS_VERSION_CONSUMER_SCOPE_FIELDS_INVALID');
  }
  const scope=Object.freeze(Object.fromEntries(keys.map(key=>[key,descriptors[key].value])));
  for(const key of keys.slice(0,6)) required(scope[key],'BINS_VERSION_CONSUMER_SCOPE_IDENTITY_INVALID');
  if(typeof scope.expected_sha256!=='string'||!SHA.test(scope.expected_sha256))
    throw new Error('BINS_VERSION_CONSUMER_SCOPE_DIGEST_INVALID');
  boundedBytes(scope.expected_bytes);
  const pinned=Object.freeze({schema:BINS_VERSION_CONSUMER_SCHEMA,
    state:'REQUEST_SCOPE_PREPARED_UNVERIFIED',scope});
  if(!worker || typeof worker.readFile!=='function') {
    throw new Error('BINS_VERSION_CONSUMER_WORKER_UNBOUND');
  }
  const returned=await worker.readFile(binding,scope);
  if(returned?.state==='OWNER_APPROVAL_REQUIRED') {
    const operation=returned.blocked_operation;
    const approval=returned.required_approval;
    if(returned.schema!=='xiio.sdk.worker-connection/v1'||
       returned.first_red!=='WARD_EXACT_OWNER_APPROVAL_REQUIRED'||
       returned.next_action!=='REVIEW_EXISTING_WARD_CHALLENGE'||
       returned.owner_approval_needed!==true||
       returned.authority_granted!==false||returned.provider_effect!==false||
       returned.apply_return_verified!==false||
       operation?.operation!=='worker.file-read'||
       operation.capability_ref!=='device.return.bytes.read'||
       approval?.owner_ref!=='EXISTING_WARD_RUNTIME_OWNER'||
       approval.action!=='REVIEW_EXISTING_WARD_CHALLENGE'||
       approval.operation!=='worker.file-read'||approval.approval_granted!==false||
       approval.work_ref!==scope.work_ref||operation.work_ref!==scope.work_ref||
       operation.work_generation!==scope.work_generation||
       operation.return_ref!==scope.return_ref||
       operation.resource_ref!==scope.resource_ref||
       operation.version_ref!==scope.version_ref||
       operation.storage_binding_ref!==scope.storage_binding_ref||
       operation.expected_sha256!==scope.expected_sha256||
       operation.expected_bytes!==scope.expected_bytes||
       approval.challenge_ref!==returned.challenge_ref||
       approval.request_digest!==operation.request_digest||
       approval.intent_digest!==operation.intent_digest||
       approval.expires_at!==returned.expires_at||
       typeof approval.request_digest!=='string'||!SHA.test(approval.request_digest)||
       typeof approval.intent_digest!=='string'||!SHA.test(approval.intent_digest)||
       !(Date.parse(returned.expires_at)>Date.now())) {
      throw new Error('BINS_VERSION_CONSUMER_WARD_CHALLENGE_MISMATCH');
    }
    return Object.freeze({schema:BINS_VERSION_CONSUMER_SCHEMA,
      state:'OWNER_APPROVAL_REQUIRED',
      first_red:'WARD_EXACT_OWNER_APPROVAL_REQUIRED',
      next_action:'REVIEW_EXISTING_WARD_CHALLENGE',
      challenge_ref:required(returned.challenge_ref,'BINS_VERSION_CONSUMER_CHALLENGE_REF_INVALID'),
      work_ref:scope.work_ref,resource_ref:scope.resource_ref,version_ref:scope.version_ref,
      owner_approval_needed:true,authority_granted:false,
      return_certified:false,apply_return_verified:false});
  }
  if(returned?.state==='BLOCKED') {
    // Leave the worker's typed refusal with the originating Work. Never
    // retry an uncertain effect or relabel a refused read as successful.
    return Object.freeze({
      schema:BINS_VERSION_CONSUMER_SCHEMA,state:'BLOCKED',
      first_red:required(returned.first_red,'BINS_VERSION_CONSUMER_FIRST_RED_REQUIRED'),
      work_ref:scope.work_ref,
      resource_ref:scope.resource_ref,
      version_ref:scope.version_ref,
      ...blockedRepair(returned,scope),
      authority_granted:false,return_certified:false,apply_return_verified:false,
    });
  }
  return checkBinsVersionReadReturn(pinned,returned);
}
