import { validateRotflAckTemplateRuns } from './rotfl-template.mjs';
import { validateRotflOrderOfOperations } from '../preflight/order-of-operations.mjs';
const STATES = new Set(['POSTED','ACK','REJECT','WAIT','ATTEMPTED','RESULT','RETURN','APPLY_RETURN']);
const PRE_ATTEMPT_STATES = new Set(['POSTED','ACK','REJECT','WAIT']);
const TERMINAL_ROTFL_STATES = new Set(['RESULT','RETURN','APPLY_RETURN']);
const NONBLANK = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const BOUNDED_REF = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 512;
const ROTFL_SCHEMA = 'xiio.sdk.rotfl-ack-context/v1';
export const UNIVERSAL_EFFECT_POLICY_SCHEMA = 'xiio.sdk.universal-effect-policy/v1';
export const UNIVERSAL_EFFECT_SCOPES = Object.freeze([
  'EXTERNAL','INTERNAL','INTER_APP','INTER_DEPARTMENT','API','SDK','ACK','PROVIDER','CRM','SWITCHBOARD','REPOSITORY','DEPLOYMENT','MESSAGE','FILE_MUTATION','OTHER_CONSEQUENTIAL'
]);
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

export function validateUniversalEffectPolicy(policy) {
  const errors=[];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return {ok:false,errors:['EFFECT_POLICY_INVALID'],user_gate_bound:false,effect_attempt_eligible:false,authority_granted:false};
  }
  if (policy.schema !== UNIVERSAL_EFFECT_POLICY_SCHEMA) errors.push('EFFECT_POLICY_SCHEMA_INVALID');
  if (!UNIVERSAL_EFFECT_SCOPES.includes(policy.effect_scope)) errors.push('EFFECT_SCOPE_INVALID');
  if (typeof policy.consequential !== 'boolean') errors.push('EFFECT_CONSEQUENTIAL_INVALID');
  if (policy.draft_plan_propose_prepare_allowed !== true) errors.push('PREPARATION_POLICY_INVALID');
  if (policy.approval_persists !== false) errors.push('EFFECT_APPROVAL_PERSISTS_FORBIDDEN');
  if (policy.prior_approval_replay_allowed !== false) errors.push('PRIOR_APPROVAL_REPLAY_FORBIDDEN');
  const occurrenceBound=BOUNDED_REF(policy.occurrence_ref);
  const effectBound=BOUNDED_REF(policy.requested_effect_ref);
  const authorizedEffects=Array.isArray(policy.authorized_effect_refs)
    ? [...new Set(policy.authorized_effect_refs.filter(BOUNDED_REF))]
    : [];
  const currentBound=BOUNDED_REF(policy.current_instruction_ref);
  const authorizingBound=BOUNDED_REF(policy.authorizing_instruction_ref);

  if (policy.consequential) {
    if (!occurrenceBound || !effectBound) errors.push('EXACT_EFFECT_OCCURRENCE_UNBOUND');
    if (!currentBound) errors.push('CURRENT_USER_INSTRUCTION_REF_MISSING');
    if (!authorizingBound) errors.push('AUTHORIZING_INSTRUCTION_REF_MISSING');
    if (currentBound && authorizingBound && policy.current_instruction_ref !== policy.authorizing_instruction_ref) {
      errors.push('PRIOR_OR_DIFFERENT_INSTRUCTION_NOT_AUTHORITY');
    }
    if (effectBound && !authorizedEffects.includes(policy.requested_effect_ref)) {
      errors.push('CURRENT_INSTRUCTION_NOT_BOUND_TO_REQUESTED_EFFECT');
    }
  }

  const userGateBound=Boolean(
    policy.consequential
    && occurrenceBound
    && effectBound
    && currentBound
    && authorizingBound
    && policy.current_instruction_ref === policy.authorizing_instruction_ref
    && authorizedEffects.includes(policy.requested_effect_ref)
    && errors.length === 0
  );
  if (policy.user_effect_instruction_bound !== userGateBound) errors.push('USER_EFFECT_GATE_STATE_MISMATCH');
  if (policy.effect_attempt_eligible !== userGateBound) errors.push('EFFECT_ATTEMPT_ELIGIBILITY_MISMATCH');
  if (policy.effect_authority !== false) errors.push('SDK_EFFECT_AUTHORITY_FORBIDDEN');
  if (!policy.consequential && (policy.user_effect_instruction_bound === true || policy.effect_attempt_eligible === true)) {
    errors.push('NO_EFFECT_CANNOT_MINT_EFFECT_GATE');
  }

  return {
    ok:errors.length===0,
    errors,
    user_gate_bound:userGateBound,
    effect_attempt_eligible:userGateBound,
    authority_granted:false,
  };
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
  const templateVerdict = validateRotflAckTemplateRuns(rotfl.reusable_template_refs, rotfl.template_runs);
  if (!templateVerdict.ok) errors.push(...templateVerdict.errors.map(x => 'ROTFL_'+x));
  const orderVerdict = validateRotflOrderOfOperations(rotfl.order_of_operations);
  if (!orderVerdict.ok) errors.push(...orderVerdict.errors.map(x => 'ROTFL_'+x));
  return {
    ok:errors.length === 0,
    errors,
    schema:ROTFL_SCHEMA,
    complete:errors.length === 0 && templateVerdict.runtime_complete && orderVerdict.complete,
    template_runtime_complete:templateVerdict.runtime_complete,
    template_run_count:templateVerdict.run_count,
    order_of_operations_ok:orderVerdict.ok,
    order_of_operations_complete:orderVerdict.complete,
    order_of_operations_pre_attempt_ready:orderVerdict.pre_attempt_ready,
    order_of_operations_next_step:orderVerdict.next_step_id,
  };
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
  const effectPolicy=validateUniversalEffectPolicy(envelope.effect_policy);
  if (!effectPolicy.ok) errors.push(...effectPolicy.errors.map(x=>`EFFECT_POLICY:${x}`));
  return {
    ok:errors.length===0,
    errors,
    provider_agnostic:true,
    proof_state:'STRUCTURAL_ONLY',
    authenticated:false,
    authority_granted:false,
    current_user_effect_instruction_bound:effectPolicy.user_gate_bound,
    effect_attempt_eligible:effectPolicy.effect_attempt_eligible,
  };
}

export function validateRotflDistributedAck(envelope) {
  const structural = validateDistributedAck(envelope);
  const rotfl = validateRotflAckContext(envelope?.rotfl);
  const lifecycleErrors = [];
  if (['ACK','ATTEMPTED','RESULT','RETURN','APPLY_RETURN'].includes(envelope?.ack_state)
      && rotfl.order_of_operations_pre_attempt_ready !== true) {
    lifecycleErrors.push('ROTFL_OOR_PRE_ATTEMPT_REQUIRED_BEFORE_ACK_OR_ATTEMPT');
  }
  if (TERMINAL_ROTFL_STATES.has(envelope?.ack_state) && rotfl.template_runtime_complete !== true) {
    lifecycleErrors.push('ROTFL_TEMPLATE_RUNTIME_REQUIRED_BEFORE_TERMINAL_ACK_STATE');
  }
  return {
    ...structural,
    ok: structural.ok && rotfl.ok && lifecycleErrors.length === 0,
    errors: [...structural.errors, ...rotfl.errors, ...lifecycleErrors],
    rotfl_complete: rotfl.ok && rotfl.template_runtime_complete && rotfl.order_of_operations_complete,
    template_runtime_complete: rotfl.template_runtime_complete,
    order_of_operations_complete: rotfl.order_of_operations_complete,
    order_of_operations_pre_attempt_ready: rotfl.order_of_operations_pre_attempt_ready,
    order_of_operations_next_step: rotfl.order_of_operations_next_step,
  };
}

export function makeAckTarget({target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling='NO_EFFECT',effect_policy=null}) {
  const target={target_ref,provider_family,agent_ref,capability_profile_ref,effect_ceiling,effect_policy};
  for (const key of ['target_ref','provider_family','agent_ref','capability_profile_ref','effect_ceiling']) {
    if (!NONBLANK(target[key])) throw new TypeError('ACK target fields must be bounded nonblank strings');
  }
  const effectVerdict=validateUniversalEffectPolicy(effect_policy);
  if (!effectVerdict.ok) throw new TypeError(`ACK target effect policy invalid: ${effectVerdict.errors.join('|')}`);
  return {
    target_ref:target_ref.trim(),
    provider_family:provider_family.trim(),
    agent_ref:agent_ref.trim(),
    capability_profile_ref:capability_profile_ref.trim(),
    effect_ceiling:effect_ceiling.trim(),
    effect_policy:structuredClone(effect_policy),
  };
}
