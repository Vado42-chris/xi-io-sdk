export const ROTFL_ORDER_SCHEMA = 'xiio.sdk.rotfl-order-of-operations/v1';
export const ROTFL_ORDER_PROFILE_REF = 'sdk:rotfl-ack-oor:v1';
export const ROTFL_INCREMENT_PREFLIGHT_PROFILE_REF = 'sdk:rotfl-ack-increment-preflight:v1';

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

// Source discovery is structural evidence, never a Ward/worker admission claim.
// Caller-supplied graphs are untrusted. Every parent must be traversed to an
// explicit original source before a managed plan can claim that it was reused.
export function resolveManagedSourceGraph(input={}) {
  const nodes=Array.isArray(input.nodes)?input.nodes:[];
  const byId=new Map();
  const errors=[];
  for(const node of nodes) {
    if(!bounded(node?.id)||byId.has(node.id)) { errors.push('SOURCE_NODE_ID_DUPLICATE_OR_INVALID');continue; }
    byId.set(node.id,node);
  }
  const root=input.selected_ref;
  const visited=new Set();
  const active=new Set();
  const originals=new Set();
  const assigned=new Set();
  const walk=(id)=>{
    if(active.has(id)) {errors.push('SOURCE_CYCLE:'+id);return;}
    if(visited.has(id)) return;
    const node=byId.get(id);
    if(!node) {errors.push('SOURCE_MISSING:'+id);return;}
    visited.add(id);active.add(id);
    if(!bounded(node.repo)||!bounded(node.generation)) errors.push('SOURCE_PROVENANCE_UNBOUND:'+id);
    if(node.kind==='original') {
      if((node.parents??[]).length) errors.push('SOURCE_ORIGINAL_HAS_PARENTS:'+id);
      originals.add(id);
    } else {
      if(!Array.isArray(node.parents)||!node.parents.length) errors.push('SOURCE_ANCESTRY_MISSING:'+id);
      else for(const parent of node.parents) walk(parent);
    }
    if(node.kind==='work') {
      if(!bounded(node.agent_id)||!bounded(node.assigned_pr_ref)) errors.push('SOURCE_WORK_ASSIGNMENT_UNBOUND:'+id);
      else {
        if(!node.assigned_pr_ref.startsWith(node.repo+'#')) errors.push('SOURCE_WORK_REPO_PR_COLLISION:'+id);
        if(input.expected_agent_id && node.id===root && node.agent_id!==input.expected_agent_id) errors.push('SOURCE_WORK_AGENT_COLLISION:'+id);
        if(input.expected_pr_ref && node.id===root && node.assigned_pr_ref!==input.expected_pr_ref) errors.push('SOURCE_WORK_PR_COLLISION:'+id);
        assigned.add(node.agent_id+'|'+node.assigned_pr_ref);
      }
    }
    active.delete(id);
  };
  if(!bounded(root)) errors.push('SOURCE_SELECTION_UNBOUND');
  else walk(root);
  if(!originals.size) errors.push('SOURCE_ORIGINAL_UNRESOLVED');
  const deduped=[...new Set(errors)];
  return Object.freeze({schema:'xiio.sdk.managed-source-resolution/v1',ok:deduped.length===0,
    selected_ref:bounded(root)?root:null,original_refs:[...originals].sort(),
    visited_refs:[...visited].sort(),assignment_refs:[...assigned].sort(),
    errors:deduped,authority_granted:false,provider_effect:false});
}

const managedCurrentFields = Object.freeze([
  'provider_current_ref',
  'studio_handoff_ref',
  'studio_session_ingress_ref',
  'current_selector_ref',
  'waterfall_ref',
  'registered_backlog_ref',
  'waterfall_generation',
  'registered_backlog_generation',
]);

function normalizeManagedCurrent(value={}) {
  const out={};
  for (const key of managedCurrentFields) out[key]=bounded(value?.[key]) ? value[key] : null;
  out.owner_restatement_count=Number.isInteger(value?.owner_restatement_count) && value.owner_restatement_count>=0
    ? value.owner_restatement_count
    : null;
  return out;
}

function managedCurrentBound(value) {
  return managedCurrentFields.every((key)=>bounded(value?.[key]))
    && value.waterfall_generation===value.registered_backlog_generation
    && value.owner_restatement_count===0;
}

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
  if (value.increment_preflight_profile_ref !== ROTFL_INCREMENT_PREFLIGHT_PROFILE_REF) errors.push('ROTFL_OOR_INCREMENT_PREFLIGHT_PROFILE_INVALID');
  if (value.preflight_before_every_increment !== true) errors.push('ROTFL_OOR_INCREMENT_PREFLIGHT_DISABLED');
  if (!bounded(value.source_generation)) errors.push('ROTFL_OOR_SOURCE_GENERATION_INVALID');

  const completed = Array.isArray(value.completed_step_ids) ? value.completed_step_ids : [];
  if (new Set(completed).size !== completed.length) errors.push('ROTFL_OOR_COMPLETED_DUPLICATE');
  const unknown = completed.filter((id)=>!canonicalIds.includes(id));
  if (unknown.length) errors.push('ROTFL_OOR_COMPLETED_UNKNOWN');

  const expectedPrefix = canonicalIds.slice(0, completed.length);
  if (JSON.stringify(completed) !== JSON.stringify(expectedPrefix)) errors.push('ROTFL_OOR_NOT_STRICT_PREFIX');

  const expectedCurrent = completed.length < canonicalIds.length ? canonicalIds[completed.length] : null;
  if ((value.current_step_id ?? null) !== expectedCurrent) errors.push('ROTFL_OOR_CURRENT_STEP_MISMATCH');

  if(value.source_graph){
    const recomputed=resolveManagedSourceGraph(value.source_graph);
    if(JSON.stringify(recomputed)!==JSON.stringify(value.source_resolution)) errors.push('ROTFL_OOR_SOURCE_RESOLUTION_TAMPERED');
  } else if(value.source_resolution) errors.push('ROTFL_OOR_SOURCE_GRAPH_LOST');
  const managedCurrent=normalizeManagedCurrent(value.managed_current);
  if (completed.includes('O0') && !managedCurrent.provider_current_ref) {
    errors.push('ROTFL_OOR_O0_PROVIDER_CURRENT_UNBOUND');
  }
  if (completed.includes('O2')) {
    for (const key of managedCurrentFields.filter((key)=>key!=='provider_current_ref')) {
      if (!managedCurrent[key]) errors.push('ROTFL_OOR_O2_MANAGED_CURRENT_UNBOUND:'+key);
    }
    if (managedCurrent.waterfall_generation && managedCurrent.registered_backlog_generation
      && managedCurrent.waterfall_generation!==managedCurrent.registered_backlog_generation) {
      errors.push('ROTFL_OOR_WATERFALL_BACKLOG_GENERATION_MISMATCH');
    }
    if (managedCurrent.owner_restatement_count===null) errors.push('ROTFL_OOR_OWNER_RESTATEMENT_COUNT_REQUIRED');
    else if (managedCurrent.owner_restatement_count!==0) errors.push('ROTFL_OOR_OWNER_RESTATEMENT_NONZERO');
    if (value.source_resolution && !value.source_resolution.ok) errors.push('ROTFL_OOR_SOURCE_ANCESTRY_UNRESOLVED');
  }
  const managedBound=managedCurrentBound(managedCurrent);
  if (value.managed_current_bound !== managedBound) errors.push('ROTFL_OOR_MANAGED_CURRENT_STATE_MISMATCH');

  const evidence = normalizeEvidence(value.evidence_refs);
  const preflight = normalizeEvidence(value.preflight_refs);
  for (const id of completed) {
    if (!Array.isArray(evidence[id]) || evidence[id].length === 0) errors.push('ROTFL_OOR_COMPLETED_WITHOUT_EVIDENCE:'+id);
    if (!Array.isArray(preflight[id]) || preflight[id].length === 0) errors.push('ROTFL_OOR_INCREMENT_WITHOUT_PREFLIGHT:'+id);
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
    managed_current_bound: managedBound,
  };
}

export function compileRotflOrderOfOperations(input={}) {
  const completed = Array.isArray(input.completed_step_ids) ? [...input.completed_step_ids] : [];
  const evidence = normalizeEvidence(input.evidence_refs);
  const managedCurrent=normalizeManagedCurrent(input.managed_current);
  const provisional = {
    schema: ROTFL_ORDER_SCHEMA,
    profile_ref: ROTFL_ORDER_PROFILE_REF,
    increment_preflight_profile_ref: ROTFL_INCREMENT_PREFLIGHT_PROFILE_REF,
    preflight_before_every_increment: true,
    source_generation: input.source_generation || null,
    managed_current: managedCurrent,
    managed_current_bound: managedCurrentBound(managedCurrent),
    source_graph: input.source_graph ? JSON.parse(JSON.stringify(input.source_graph)) : null,
    source_resolution: input.source_graph ? resolveManagedSourceGraph(input.source_graph) : null,
    steps: ROTFL_ORDER_STEPS.map((step)=>({...step})),
    completed_step_ids: completed,
    current_step_id: completed.length < canonicalIds.length ? canonicalIds[completed.length] : null,
    evidence_refs: evidence,
    preflight_refs: normalizeEvidence(input.preflight_refs),
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
      'EVERY_INCREMENT_REQUIRES_PREFLIGHT',
      'INCREMENT_WITHOUT_PREFLIGHT!=COMPLETE',
      'PREFLIGHT_PASS_AT_PRIOR_INCREMENT!=CURRENT_INCREMENT_PREFLIGHT',
      'DRIFT_BETWEEN_INCREMENTS->REENTER_PREFLIGHT',
      'STUDIO_CURRENT_UNBOUND!=PRE_ATTEMPT_READY',
      'WATERFALL_BACKLOG_GENERATION_MISMATCH=FAIL_CLOSED',
      'OWNER_RESTATEMENT_NONZERO!=ADMITTED_COLD_START',
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
    increment_preflight_profile_ref:ROTFL_INCREMENT_PREFLIGHT_PROFILE_REF,
    preflight_before_every_increment:true,
    managed_current_required:true,
    denominator:ROTFL_ORDER_STEPS.length,
    pre_attempt_last_step:ROTFL_PRE_ATTEMPT_LAST_STEP,
    steps:ROTFL_ORDER_STEPS.map((step)=>({...step})),
    authority_granted:false,
    provider_effect:false,
  });
}
