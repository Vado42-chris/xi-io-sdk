const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);

export function validateDistributedAck(envelope) {
  const required=['ack_id','root_ref','work_ref','baseline_generation','target_ref','provider_family',
    'agent_ref','capability_profile_ref','subject_generation','effect_ceiling','ack_state',
    'attempt','return_target_ref','observed_at'];
  const missing=required.filter(k=>envelope?.[k]===undefined || envelope?.[k]===null || envelope?.[k]==='');
  const errors=[];
  if (missing.length) errors.push(`MISSING:${missing.join(',')}`);
  if (envelope?.ack_state && !STATES.has(envelope.ack_state)) errors.push('ACK_STATE_INVALID');
  if (Number(envelope?.attempt ?? 0)<0) errors.push('ATTEMPT_NEGATIVE');
  if (['POSTED','ACK','REJECT','WAIT'].includes(envelope?.ack_state) && Number(envelope?.attempt ?? 0)!==0) {
    errors.push('PRE_ATTEMPT_STATE_WITH_NONZERO_ATTEMPT');
  }
  return {ok:errors.length===0,errors,provider_agnostic:true};
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT'}) {
  return {target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling};
}
