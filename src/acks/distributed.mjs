const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);
const PRE_ATTEMPT_STATES = new Set(['POSTED','ACK','REJECT','WAIT']);
const NONBLANK = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

function timestamp(value) {
  if (!NONBLANK(value)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day] = parts.map(Number);
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays;
}

export function validateDistributedAck(envelope) {
  const required=['ack_id','root_ref','work_ref','baseline_generation','target_ref','provider_family',
    'agent_ref','capability_profile_ref','subject_generation','effect_ceiling','ack_state',
    'attempt','return_target_ref','observed_at'];
  const errors=[];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return {ok:false,errors:['ENVELOPE_INVALID'],provider_agnostic:true,proof_state:'STRUCTURAL_ONLY',authenticated:false,authority_granted:false};
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
  // A structurally valid echo cannot authenticate a worker, prove execution, or grant effects.
  return {ok:errors.length===0,errors,provider_agnostic:true,proof_state:'STRUCTURAL_ONLY',authenticated:false,authority_granted:false};
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT'}) {
  const target={target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling};
  if (Object.values(target).some(value=>!NONBLANK(value))) throw new TypeError('ACK target fields must be bounded nonblank strings');
  return Object.fromEntries(Object.entries(target).map(([key,value])=>[key,value.trim()]));
}
