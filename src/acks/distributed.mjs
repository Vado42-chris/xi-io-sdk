const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);
const PRE_ATTEMPT_STATES = new Set(['POSTED','ACK','REJECT','WAIT']);
const NONBLANK = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const SOURCE_FIELDS = Object.freeze([
  'source_ref',
  'source_projection_ref',
  'source_projection_provider',
  'source_projection_generation',
  'source_access_ref',
  'source_currentness_receipt_ref',
]);

function timestamp(value) {
  if (!NONBLANK(value)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day] = parts.map(Number);
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays;
}

function sourceBinding(envelope) {
  const present = SOURCE_FIELDS.every((field) => NONBLANK(envelope?.[field]));
  if (!present) {
    return Object.freeze({
      bound: false,
      structural_state: 'SOURCE_BINDING_MISSING',
      proof_state: 'UNPROVEN',
      currentness_state: 'UNPROVEN',
      access_state: 'UNPROVEN',
      canonical_source_ref: null,
      provider_projection_ref: null,
      provider_projection_provider: null,
      provider_projection_generation: null,
      source_access_ref: null,
      currentness_receipt_ref: null,
    });
  }
  return Object.freeze({
    bound: true,
    structural_state: 'SOURCE_BINDING_PRESENT',
    // Pure SDK validation can require the binding but cannot authenticate the
    // provider projection, its access route, or its currentness receipt.
    proof_state: 'SUPPLIED_UNVERIFIED',
    currentness_state: 'SUPPLIED_UNVERIFIED',
    access_state: 'SUPPLIED_UNVERIFIED',
    canonical_source_ref: envelope.source_ref,
    provider_projection_ref: envelope.source_projection_ref,
    provider_projection_provider: envelope.source_projection_provider,
    provider_projection_generation: envelope.source_projection_generation,
    source_access_ref: envelope.source_access_ref,
    currentness_receipt_ref: envelope.source_currentness_receipt_ref,
  });
}

export function validateDistributedAck(envelope) {
  const required=['ack_id','root_ref','work_ref','baseline_generation','target_ref','provider_family',
    'agent_ref','capability_profile_ref','subject_generation','effect_ceiling','ack_state',
    'attempt','return_target_ref','observed_at',...SOURCE_FIELDS];
  const errors=[];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return {
      ok:false,
      errors:['ENVELOPE_INVALID'],
      provider_agnostic:true,
      proof_state:'STRUCTURAL_ONLY',
      authenticated:false,
      authority_granted:false,
      source_binding:sourceBinding(null),
    };
  }
  const missing=required.filter(k=>!Object.hasOwn(envelope,k) || envelope[k]===undefined || envelope[k]===null || envelope[k]==='');
  if (missing.length) errors.push(`MISSING:${missing.join(',')}`);
  for (const field of required.filter(k=>k!=='attempt')) {
    if (!NONBLANK(envelope[field])) errors.push(`INVALID_FIELD:${field}`);
  }
  if (!STATES.has(envelope.ack_state)) errors.push('ACK_STATE_INVALID');
  if (!Number.isSafeInteger(envelope.attempt) || envelope.attempt < 0) errors.push('ATTEMPT_INVALID');
  if (PRE_ATTEMPT_STATES.has(envelope.ack_state) && envelope.attempt!==0) {
    errors.push('PRE_ATTEMPT_STATE_WITH_NONZERO_ATTEMPT');
  }
  if (envelope.ack_state==='ATTEMPTED' && envelope.attempt===0) errors.push('ATTEMPTED_REQUIRES_POSITIVE_ATTEMPT');
  if (!timestamp(envelope.observed_at)) errors.push('OBSERVED_AT_INVALID');
  const source=sourceBinding(envelope);
  if (!source.bound) errors.push('SOURCE_BINDING_REQUIRED');
  if (NONBLANK(envelope.source_ref) && NONBLANK(envelope.source_projection_ref)
    && envelope.source_ref.trim()===envelope.source_projection_ref.trim()) {
    errors.push('SOURCE_REF_PROJECTION_CONFLATED');
  }
  // A structurally valid echo cannot authenticate a worker, prove source access,
  // prove source currentness, prove execution, or grant effects.
  return {
    ok:errors.length===0,
    errors,
    provider_agnostic:true,
    proof_state:'STRUCTURAL_ONLY',
    authenticated:false,
    authority_granted:false,
    source_binding:source,
    hard:[
      'CANONICAL_SOURCE_REF != PROVIDER_PROJECTION_REF',
      'PROVIDER_PROJECTION_PRESENT != SOURCE_CURRENT',
      'SOURCE_ACCESS_REF_PRESENT != SOURCE_ACCESS_PROVEN',
      'CURRENTNESS_RECEIPT_REF_PRESENT != CURRENTNESS_VERIFIED',
      'GIT_REF != DURABLE_SOURCE_PROJECTION',
      'GOOGLE_DRIVE_PROJECTION != CANONICAL_SOURCE_IDENTITY',
      'ACK_STRUCTURAL != AUTHENTICATED_ACK',
    ],
  };
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT'}) {
  const target={target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling};
  if (Object.values(target).some(value=>!NONBLANK(value))) throw new TypeError('ACK target fields must be bounded nonblank strings');
  return Object.fromEntries(Object.entries(target).map(([key,value])=>[key,value.trim()]));
}

export function makeAckSourceBinding({
  source_ref,
  source_projection_ref,
  source_projection_provider,
  source_projection_generation,
  source_access_ref,
  source_currentness_receipt_ref,
}) {
  const binding={
    source_ref,
    source_projection_ref,
    source_projection_provider,
    source_projection_generation,
    source_access_ref,
    source_currentness_receipt_ref,
  };
  if (Object.values(binding).some(value=>!NONBLANK(value))) {
    throw new TypeError('ACK source binding fields must be bounded nonblank strings');
  }
  const normalized=Object.fromEntries(Object.entries(binding).map(([key,value])=>[key,value.trim()]));
  if (normalized.source_ref===normalized.source_projection_ref) {
    throw new TypeError('ACK canonical source_ref must be distinct from source_projection_ref');
  }
  return Object.freeze(normalized);
}
