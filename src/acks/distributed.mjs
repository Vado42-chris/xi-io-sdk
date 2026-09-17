const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);
const PRE_ATTEMPT_STATES = new Set(['POSTED','ACK','REJECT','WAIT']);
const NONBLANK = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const BOUNDED_REF = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 512;
const ROTFL_SCHEMA = 'xiio.sdk.rotfl-ack-context/v1';
const ROTFL_LIST_FIELDS = [
  'knowledge_return_refs','bins_resource_refs','reusable_tool_refs','reusable_template_refs',
  'affected_refs','no_effect_refs','reap_refs',
];
const ROTFL_REF_FIELDS = [
  'hvt_order_ref','coverage_profile_ref','truncation_denominator_ref','first_red_ref','next_ref',
  'wake_ref','fallback_ref','apply_return_target_ref','cold_start_readback_ref',
];
const TRANSPORT_ONLY = /^(?:gmail|email|mail|github-comment|github-notification):/i;

function timestamp(value) {
  if (!NONBLANK(value)) return false;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day] = parts.map(Number);
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays;
}

function typedOrRef(value) {
  if (!BOUNDED_REF(value)) return false;
  return /^(?:N_A|WAIT|UNKNOWN|NO_EFFECT):/.test(value) || !/^(?:N_A|WAIT|UNKNOWN|NO_EFFECT)$/i.test(value);
}

function validList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(typedOrRef) && new Set(value).size === value.length;
}

export function validateRotflAckContext(rotfl) {
  const errors = [];
  if (!rotfl || typeof rotfl !== 'object' || Array.isArray(rotfl)) {
    return { ok:false, errors:['ROTFL_CONTEXT_INVALID'], schema:ROTFL_SCHEMA, complete:false };
  }
  if (rotfl.schema !== ROTFL_SCHEMA) errors.push('ROTFL_SCHEMA_INVALID');
  for (const field of ROTFL_REF_FIELDS) if (!typedOrRef(rotfl[field])) errors.push(`ROTFL_REF_INVALID:${field}`);
  for (const field of ROTFL_LIST_FIELDS) if (!validList(rotfl[field])) errors.push(`ROTFL_LIST_INVALID:${field}`);
  if (!timestamp(rotfl.currentness_checked_at)) errors.push('ROTFL_CURRENTNESS_INVALID');
  for (const field of ['knowledge_return_refs','bins_resource_refs']) {
    for (const value of Array.isArray(rotfl[field]) ? rotfl[field] : []) {
      if (TRANSPORT_ONLY.test(value)) errors.push(`ROTFL_TRANSPORT_ONLY:${field}`);
    }
  }
  if (TRANSPORT_ONLY.test(rotfl.cold_start_readback_ref || '')) errors.push('ROTFL_TRANSPORT_ONLY:cold_start_readback_ref');
  const noEffect = new Set(Array.isArray(rotfl.no_effect_refs) ? rotfl.no_effect_refs : []);
  if ((Array.isArray(rotfl.affected_refs) ? rotfl.affected_refs : []).some(ref => noEffect.has(ref))) errors.push('ROTFL_AFFECTED_NO_EFFECT_OVERLAP');
  return { ok:errors.length === 0, errors, schema:ROTFL_SCHEMA, complete:errors.length === 0 };
}

export function attachRotflContextToAckSet(ackSet, rotfl) {
  const verdict = validateRotflAckContext(rotfl);
  if (!verdict.ok) throw new TypeError(`ROTFL ACK context invalid: ${verdict.errors.join('|')}`);
  if (!ackSet || typeof ackSet !== 'object' || !Array.isArray(ackSet.acks)) throw new TypeError('ACK set invalid');
  return {
    ...ackSet,
    rotfl_required: true,
    rotfl_context: structuredClone(rotfl),
    acks: ackSet.acks.map(ack => ({ ...ack, rotfl: structuredClone(rotfl) })),
  };
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
  return {ok:errors.length===0,errors,provider_agnostic:true,proof_state:'STRUCTURAL_ONLY',authenticated:false,authority_granted:false};
}

export function validateRotflDistributedAck(envelope) {
  const structural = validateDistributedAck(envelope);
  const rotfl = validateRotflAckContext(envelope?.rotfl);
  return {
    ...structural,
    ok: structural.ok && rotfl.ok,
    errors: [...structural.errors, ...rotfl.errors],
    rotfl_complete: rotfl.ok,
  };
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT'}) {
  const target={target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling};
  if (Object.values(target).some(value=>!NONBLANK(value))) throw new TypeError('ACK target fields must be bounded nonblank strings');
  return Object.fromEntries(Object.entries(target).map(([key,value])=>[key,value.trim()]));
}
