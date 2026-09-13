const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);
const PRE_ATTEMPT_STATES = new Set(['POSTED','ACK','REJECT','WAIT']);
const NONBLANK = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const SHA256 = /^[a-f0-9]{64}$/i;
const PROJECTION_ONLY_REF = /^(?:git|github|drive|gdrive|slack|http|https):/i;

function timestamp(value) {
  if (!NONBLANK(value)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day] = parts.map(Number);
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays;
}

function validateSourceReadback(envelope, sourceReadback, errors) {
  if (!sourceReadback || typeof sourceReadback !== 'object' || Array.isArray(sourceReadback)) {
    errors.push('SOURCE_BASIS_READBACK_REQUIRED');
    return;
  }
  if (sourceReadback.verified !== true) errors.push('SOURCE_BASIS_NOT_VERIFIED');
  const fields=['source_store_ref','source_basis_ref','source_basis_generation','source_basis_digest','dogfood_formula_ref','dogfood_formula_digest'];
  for (const field of fields) {
    if (!NONBLANK(sourceReadback[field])) errors.push(`SOURCE_READBACK_INVALID_FIELD:${field}`);
    else if (sourceReadback[field] !== envelope[field]) errors.push(`SOURCE_READBACK_MISMATCH:${field}`);
  }
  if (!NONBLANK(sourceReadback.readback_ref)) errors.push('SOURCE_READBACK_REF_REQUIRED');
  if (!timestamp(sourceReadback.observed_at)) errors.push('SOURCE_READBACK_OBSERVED_AT_INVALID');
}

export function validateDistributedAck(envelope, sourceReadback=null) {
  const required=['ack_id','root_ref','work_ref','baseline_generation','target_ref','provider_family',
    'agent_ref','capability_profile_ref','subject_generation','effect_ceiling','ack_state',
    'attempt','return_target_ref','observed_at','source_store_ref','source_basis_ref',
    'source_basis_generation','source_basis_digest','dogfood_formula_ref','dogfood_formula_digest'];
  const errors=[];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return {ok:false,errors:['ENVELOPE_INVALID'],provider_agnostic:true,proof_state:'STRUCTURAL_ONLY',authenticated:false,authority_granted:false,source_basis_required:true};
  }
  const missing=required.filter(k=>!Object.hasOwn(envelope,k) || envelope[k]===undefined || envelope[k]===null || envelope[k]==='');
  if (missing.length) errors.push(`MISSING:${missing.join(',')}`);
  for (const field of required.filter(k=>k!=='attempt')) {
    if (!NONBLANK(envelope[field])) errors.push(`INVALID_FIELD:${field}`);
  }
  if (!STATES.has(envelope.ack_state)) errors.push('ACK_STATE_INVALID');
  if (!Number.isSafeInteger(envelope.attempt) || envelope.attempt < 0) errors.push('ATTEMPT_INVALID');
  if (PRE_ATTEMPT_STATES.has(envelope.ack_state) && envelope.attempt!==0) errors.push('PRE_ATTEMPT_STATE_WITH_NONZERO_ATTEMPT');
  if (envelope.ack_state==='ATTEMPTED' && envelope.attempt===0) errors.push('ATTEMPTED_REQUIRES_POSITIVE_ATTEMPT');
  if (!timestamp(envelope.observed_at)) errors.push('OBSERVED_AT_INVALID');
  if (NONBLANK(envelope.source_store_ref) && PROJECTION_ONLY_REF.test(envelope.source_store_ref)) errors.push('SOURCE_STORE_PROJECTION_ONLY');
  if (NONBLANK(envelope.source_basis_ref) && PROJECTION_ONLY_REF.test(envelope.source_basis_ref)) errors.push('SOURCE_BASIS_PROJECTION_ONLY');
  if (NONBLANK(envelope.dogfood_formula_ref) && PROJECTION_ONLY_REF.test(envelope.dogfood_formula_ref)) errors.push('DOGFOOD_FORMULA_PROJECTION_ONLY');
  if (NONBLANK(envelope.source_basis_digest) && !SHA256.test(envelope.source_basis_digest)) errors.push('SOURCE_BASIS_DIGEST_INVALID');
  if (NONBLANK(envelope.dogfood_formula_digest) && !SHA256.test(envelope.dogfood_formula_digest)) errors.push('DOGFOOD_FORMULA_DIGEST_INVALID');
  validateSourceReadback(envelope, sourceReadback, errors);
  // Source binding is still structural. It cannot authenticate a worker, prove execution, or grant effects.
  return {ok:errors.length===0,errors,provider_agnostic:true,proof_state:'SOURCE_BOUND_STRUCTURAL_ONLY',authenticated:false,authority_granted:false,source_basis_required:true};
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT'}) {
  const target={target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling};
  if (Object.values(target).some(value=>!NONBLANK(value))) throw new TypeError('ACK target fields must be bounded nonblank strings');
  return Object.fromEntries(Object.entries(target).map(([key,value])=>[key,value.trim()]));
}
