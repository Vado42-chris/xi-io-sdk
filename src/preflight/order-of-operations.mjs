export const ROTFL_ORDER_SCHEMA = 'xiio.sdk.rotfl-order-of-operations/v1';
export const ROTFL_ORDER_PROFILE_REF = 'sdk:rotfl-ack-oor:v1';

export const ROTFL_ORDER_STEPS = Object.freeze([
  Object.freeze({ id:'O0', label:'REBASE_PROVIDER_CURRENT' }),
  Object.freeze({ id:'O1', label:'REFRESH_CONNECTED_TOOL_ROSTER' }),
  Object.freeze({ id:'O2', label:'CONSUME_CURRENT_HANDOFF_FABRIC' }),
  Object.freeze({ id:'O3', label:'CRM_FIRST_EACH_PASS' }),
  Object.freeze({ id:'O4', label:'TASKS_BUGZILLA_DOTPROJECT_CURRENTNESS' }),
  Object.freeze({ id:'O5', label:'DATAFORGE_INGRESS_EGRESS_CURRENTNESS' }),
  Object.freeze({ id:'O6', label:'BINS_CUSTODY_AND_CONVERSATION_CURRENTNESS' }),
  Object.freeze({ id:'O7', label:'API_GLASS_BOX_CAPABILITY_CURRENTNESS' }),
  Object.freeze({ id:'O8', label:'WARD_EFFECT_POLICY_CURRENTNESS' }),
  Object.freeze({ id:'O9', label:'SWITCHBOARD_ADMISSION_CURRENTNESS' }),
  Object.freeze({ id:'O10', label:'SELECT_EXISTING_FORCE_MULTIPLIER' }),
  Object.freeze({ id:'O11', label:'GREENIE_PLAN_AND_SIM_BEFORE_EXECUTE' }),
  Object.freeze({ id:'O12', label:'ACK_ATTEMPT_RESULT_RETURN_APPLY_RETURN_READBACK' }),
  Object.freeze({ id:'O13', label:'REAP_AND_FRESH_WORKER_REPLAY' }),
]);

export const ROTFL_PRE_ATTEMPT_LAST_STEP = 'O11';

const bounded = (value, max=512) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

const canonicalIds = Object.freeze(ROTFL_ORDER_STEPS.map((step)=>step.id));

function normalizeEvidence(value={}) {
  const out={};
  for (const [key, refs] of Object.entries(value || {})) {
    if (!canonicalIds.includes(key) || !Array.isArray(refs) || refs.length === 0 || refs.some((ref)=>!bounded(ref))) continue;
    out[key]=[...new Set(refs)];
  }
  return out;
}

export function validateRotflOrderOfOperations(value) {
  const errors=[];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok:false, errors:['ROTFL_OOR_INVALID'], pre_attempt_ready:false, complete:false, next_step_id:'O0' };
  }
  if (value.schema !== ROTFL_ORDER_SCHEMA) errors.push('ROTFL_OOR_SCHEMA_INVALID');
  if (value.profile_ref !== ROTFL_ORDER_PROFILE_REF) errors.push('ROTFL_OOR_PROFILE_INVALID');
  if (!bounded(value.source_generation)) errors.push('ROTFL_OOR_SOURCE_GENERATION_INVALID');

  const completed = Array.isArray(value.completed_step_ids) ? value.completed_step_ids : [];
  if (new Set(completed).size !== completed.length) errors.push('ROTFL_OOR_COMPLETED_DUPLICATE');
  const unknown = completed.filter((id)=>!canonicalIds.includes(id));
  if (unknown.length) errors.push('ROTFL_OOR_COMPLETED_UNKNOWN');

  const expectedPrefix = canonicalIds.slice(0, completed.length);
  if (JSON.stringify(completed) !== JSON.stringify(expectedPrefix)) errors.push('ROTFL_OOR_NOT_STRICT_PREFIX');

  const expectedCurrent = completed.length < canonicalIds.length ? canonicalIds[completed.length] : null;
  if ((value.current_step_id ?? null) !== expectedCurrent) errors.push('ROTFL_OOR_CURRENT_STEP_MISMATCH');

  const evidence = normalizeEvidence(value.evidence_refs);
  for (const id of completed) {
    if (!Array.isArray(evidence[id]) || evidence[id].length === 0) errors.push('ROTFL_OOR_COMPLETED_WITHOUT_EVIDENCE:'+id);
  }

  const preAttemptIndex = canonicalIds.indexOf(ROTFL_PRE_ATTEMPT_LAST_STEP);
  const preAttemptReady = completed.length > preAttemptIndex;
  const complete = completed.length === canonicalIds.length;

  if (value.pre_attempt_ready !== preAttemptReady) errors.push('ROTFL_OOR_PRE_ATTEMPT_STATE_MISMATCH');
  if (value.complete !== complete) errors.push('ROTFL_OOR_COMPLETE_STATE_MISMATCH');
  if (value.mutation_admitted !== preAttemptReady) errors.push('ROTFL_OOR_MUTATION_ADMISSION_MISMATCH');

  return {
    ok: errors.length === 0,
    errors,
    pre_attempt_ready: preAttemptReady,
    complete,
    next_step_id: expectedCurrent,
    completed_count: completed.length,
    denominator: canonicalIds.length,
  };
}

export function compileRotflOrderOfOperations(input={}) {
  const completed = Array.isArray(input.completed_step_ids) ? [...input.completed_step_ids] : [];
  const evidence = normalizeEvidence(input.evidence_refs);
  const provisional = {
    schema: ROTFL_ORDER_SCHEMA,
    profile_ref: ROTFL_ORDER_PROFILE_REF,
    source_generation: input.source_generation || null,
    steps: ROTFL_ORDER_STEPS.map((step)=>({...step})),
    completed_step_ids: completed,
    current_step_id: completed.length < canonicalIds.length ? canonicalIds[completed.length] : null,
    evidence_refs: evidence,
    pre_attempt_ready: completed.length > canonicalIds.indexOf(ROTFL_PRE_ATTEMPT_LAST_STEP),
    mutation_admitted: completed.length > canonicalIds.indexOf(ROTFL_PRE_ATTEMPT_LAST_STEP),
    complete: completed.length === canonicalIds.length,
    authority_granted: false,
    provider_effect: false,
    hard: [
      'REBASE!=ONBOARD',
      'GIT_CURRENT!=OPERATING_CONTEXT_CURRENT',
      'HANDOFF_AVAILABLE_AND_UNREAD=PREFLIGHT_DEFECT',
      'PLUGIN_AVAILABLE_AND_UNUSED=PREFLIGHT_DEFECT',
      'CRM_FIRST_EACH_PASS',
      'TASKS=BUGZILLA+DOTPROJECT',
      'DATAFORGE_UUID!=PROVIDER_NATIVE_ID',
      'BINS_CUSTODY_BEFORE_PROVIDER_PROJECTION',
      'WARD!=SWITCHBOARD',
      'GREENIE_POSTED!=GREENIE_RETURNED',
      'SIM_PASS!=MUTATION_AUTHORITY',
      'RESULT!=RETURN!=APPLY_RETURN!=REAP',
      'MERGED!=REAP_COMPLETE',
      'GOLDEN_ONLY=FALSE_GREEN',
    ],
  };
  const verdict = validateRotflOrderOfOperations(provisional);
  if (!verdict.ok) throw new TypeError('ROTFL order invalid: '+verdict.errors.join('|'));
  return Object.freeze(provisional);
}

export function rotflOrderCatalog() {
  return Object.freeze({
    schema:'xiio.sdk.rotfl-order-catalog/v1',
    profile_ref:ROTFL_ORDER_PROFILE_REF,
    denominator:ROTFL_ORDER_STEPS.length,
    pre_attempt_last_step:ROTFL_PRE_ATTEMPT_LAST_STEP,
    steps:ROTFL_ORDER_STEPS.map((step)=>({...step})),
    authority_granted:false,
    provider_effect:false,
  });
}
