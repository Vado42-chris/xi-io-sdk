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

  equal(work?.work_ref, returned?.work_ref, 'BINS_VERSION_CONSUMER_WORK_MISMATCH');
  equal(work?.work_generation, returned?.work_generation,
    'BINS_VERSION_CONSUMER_WORK_GENERATION_MISMATCH');
  equal(returned?.resource_ref, resourceRef, 'BINS_VERSION_CONSUMER_RETURN_RESOURCE_MISMATCH');
  equal(returned?.version_ref, versionRef, 'BINS_VERSION_CONSUMER_RETURN_VERSION_MISMATCH');
  equal(returned?.storage_binding_ref, storageBindingRef, 'BINS_VERSION_CONSUMER_RETURN_BINDING_MISMATCH');
  const scope = Object.freeze({
    work_ref: required(work.work_ref, 'BINS_VERSION_CONSUMER_WORK_REQUIRED'),
    work_generation: required(work.work_generation, 'BINS_VERSION_CONSUMER_WORK_GENERATION_REQUIRED'),
    return_ref: required(returned.return_ref, 'BINS_VERSION_CONSUMER_RETURN_REQUIRED'),
    resource_ref: resourceRef, version_ref: versionRef,
    storage_binding_ref: storageBindingRef, expected_sha256: digest, expected_bytes: size,
  });
  return Object.freeze({
    schema: BINS_VERSION_CONSUMER_SCHEMA,
    state: 'REQUEST_SCOPE_PREPARED_UNVERIFIED',
    matter_ref: matterRef,
    event_id: required(event.event_id, 'BINS_VERSION_CONSUMER_EVENT_ID_REQUIRED'),
    // BINS version ancestry is distinct from SDK previous_receipt.
    parent_version_ref: stored.parent_version_ref ?? null,
    scope,
    authority_granted: false, custody_independently_verified: false,
    return_certified: false, apply_return_verified: false,
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

/**
 * Invoke the existing SDK #205 worker, never a direct BINS path or endpoint.
 * Only the worker's admitted runtime adapter can provide a trustworthy result.
 * This glue neither creates a Ward grant nor performs APPLY_RETURN.
 */
export async function readBinsVersionWithWorker({prepared,worker,binding}={}) {
  if(prepared?.schema!==BINS_VERSION_CONSUMER_SCHEMA ||
     prepared.state!=='REQUEST_SCOPE_PREPARED_UNVERIFIED' ||
     !Object.isFrozen(prepared.scope)) {
    throw new Error('BINS_VERSION_CONSUMER_SCOPE_NOT_PREPARED');
  }
  if(!worker || typeof worker.readFile!=='function') {
    throw new Error('BINS_VERSION_CONSUMER_WORKER_UNBOUND');
  }
  const returned=await worker.readFile(binding,prepared.scope);
  if(returned?.state==='BLOCKED') {
    // Leave the worker's typed refusal with the originating Work. Never
    // retry an uncertain effect or relabel a refused read as successful.
    return Object.freeze({
      schema:BINS_VERSION_CONSUMER_SCHEMA,state:'BLOCKED',
      first_red:required(returned.first_red,'BINS_VERSION_CONSUMER_FIRST_RED_REQUIRED'),
      work_ref:prepared.scope.work_ref,
      resource_ref:prepared.scope.resource_ref,
      version_ref:prepared.scope.version_ref,
      authority_granted:false,return_certified:false,apply_return_verified:false,
    });
  }
  return checkBinsVersionReadReturn(prepared,returned);
}
