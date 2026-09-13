const LANE_STATES = new Set(['RUNNING', 'WAIT', 'BLOCKED', 'RETURNED', 'UNKNOWN', 'DONE']);

function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integer(value, code) {
  if (!Number.isSafeInteger(value)) throw new Error(code);
  return value;
}

function normalizeLane(lane, expectedGeneration) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) throw new Error('LANE_INVALID');
  const state = text(lane.state, 'LANE_STATE_REQUIRED');
  if (!LANE_STATES.has(state)) throw new Error('LANE_STATE_INVALID');
  const generation = text(lane.generation, 'LANE_GENERATION_REQUIRED');
  const cadenceRef = optionalText(lane.cadence_ref);
  const backbeatRef = optionalText(lane.backbeat_ref);
  const current = generation === expectedGeneration;
  const ownerRelayRequired = lane.owner_relay_required === true;

  const missing = [];
  const requiredRefs = {
    bins_uuid: optionalText(lane.bins_uuid),
    resume_prompt_stack_ref: optionalText(lane.resume_prompt_stack_ref),
    persona_card_ref: optionalText(lane.persona_card_ref),
    brand_profile_ref: optionalText(lane.brand_profile_ref),
    ack_ref: optionalText(lane.ack_ref),
    cadence_ref: cadenceRef,
    backbeat_ref: backbeatRef,
  };
  for (const [key, value] of Object.entries(requiredRefs)) if (!value) missing.push(key);
  if (Boolean(cadenceRef) !== Boolean(backbeatRef)) missing.push('cadence_backbeat_pair');

  return Object.freeze({
    lane_ref: text(lane.lane_ref, 'LANE_REF_REQUIRED'),
    root_ref: text(lane.root_ref, 'LANE_ROOT_REQUIRED'),
    agent_ref: text(lane.agent_ref, 'LANE_AGENT_REQUIRED'),
    work_ref: text(lane.work_ref, 'LANE_WORK_REQUIRED'),
    generation,
    current,
    state,
    attention: lane.attention === true,
    owner_relay_required: ownerRelayRequired,
    owner_cog_delta: integer(lane.owner_cog_delta ?? 0, 'LANE_OWNER_COG_DELTA_INVALID'),
    bins_uuid: requiredRefs.bins_uuid,
    resume_prompt_stack_ref: requiredRefs.resume_prompt_stack_ref,
    persona_card_ref: requiredRefs.persona_card_ref,
    brand_profile_ref: requiredRefs.brand_profile_ref,
    ack_ref: requiredRefs.ack_ref,
    cadence_ref: cadenceRef,
    backbeat_ref: backbeatRef,
    result_ref: optionalText(lane.result_ref),
    return_ref: optionalText(lane.return_ref),
    apply_return_ref: optionalText(lane.apply_return_ref),
    meter_ref: optionalText(lane.meter_ref),
    hotfolder_ref: optionalText(lane.hotfolder_ref),
    detonator_ref: optionalText(lane.detonator_ref),
    missing_refs: [...new Set(missing)].sort(),
  });
}

export function compileMultiThreadWorkProjection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_REQUIRED');
  const missionRootRef = text(input.mission_root_ref, 'MISSION_ROOT_REQUIRED');
  const generation = text(input.generation, 'GENERATION_REQUIRED');
  const binsGeneration = text(input.bins_generation, 'BINS_GENERATION_REQUIRED');
  const audhdBrandOwnerRef = text(input.audhd_brand_owner_ref, 'AUDHD_BRAND_OWNER_REQUIRED');
  const uxOwnerRef = text(input.ux_owner_ref, 'UX_OWNER_REQUIRED');
  const crmProfileOwnerRef = text(input.crm_profile_owner_ref, 'CRM_PROFILE_OWNER_REQUIRED');
  const subterraneanReapRef = text(input.subterranean_reap_ref, 'SUBTERRANEAN_REAP_REF_REQUIRED');
  if (!Array.isArray(input.lanes) || input.lanes.length === 0) throw new Error('LANES_REQUIRED');

  const lanes = input.lanes.map((lane) => normalizeLane(lane, generation));
  const refs = new Set();
  for (const lane of lanes) {
    if (refs.has(lane.lane_ref)) throw new Error(`DUPLICATE_LANE_REF:${lane.lane_ref}`);
    refs.add(lane.lane_ref);
  }

  const active = lanes.filter((lane) => lane.state === 'RUNNING');
  const waiting = lanes.filter((lane) => lane.state === 'WAIT');
  const blocked = lanes.filter((lane) => lane.state === 'BLOCKED');
  const returned = lanes.filter((lane) => lane.state === 'RETURNED');
  const unknown = lanes.filter((lane) => lane.state === 'UNKNOWN');
  const stale = lanes.filter((lane) => !lane.current);
  const ownerRelay = lanes.filter((lane) => lane.owner_relay_required);
  const missingRefs = lanes.filter((lane) => lane.missing_refs.length > 0);
  const cadenceBackbeatGaps = lanes.filter((lane) => lane.missing_refs.includes('cadence_backbeat_pair'));
  const returnGaps = lanes.filter((lane) => lane.state === 'RETURNED' && (!lane.return_ref || !lane.apply_return_ref));

  const ownerCogDelta = lanes.reduce((sum, lane) => sum + lane.owner_cog_delta, 0);
  const attentionFrontier = lanes.filter((lane) => lane.attention || lane.state === 'RUNNING' || lane.state === 'BLOCKED');
  const subterranean = lanes.filter((lane) => !attentionFrontier.includes(lane));

  const failures = [];
  if (stale.length) failures.push('STALE_LANE_GENERATION');
  if (unknown.length) failures.push('UNKNOWN_LANE_STATE');
  if (ownerRelay.length) failures.push('OWNER_RELAY_REQUIRED');
  if (missingRefs.length) failures.push('REQUIRED_CONTEXT_REF_MISSING');
  if (cadenceBackbeatGaps.length) failures.push('CADENCE_BACKBEAT_ASYMMETRY');
  if (returnGaps.length) failures.push('RETURN_APPLY_RETURN_GAP');

  const state = failures.length === 0 ? 'BORING_MULTI_THREAD_READY' : 'MULTI_THREAD_GAPS_VISIBLE';

  return Object.freeze({
    schema: 'xiio.sdk.multithread-work-projection/v1',
    mission_root_ref: missionRootRef,
    generation,
    bins_generation: binsGeneration,
    governance: Object.freeze({
      audhd_brand_owner_ref: audhdBrandOwnerRef,
      ux_owner_ref: uxOwnerRef,
      crm_profile_owner_ref: crmProfileOwnerRef,
      subterranean_reap_ref: subterraneanReapRef,
    }),
    state,
    failures,
    scorecard: Object.freeze({
      lanes_total: lanes.length,
      active: active.length,
      waiting: waiting.length,
      blocked: blocked.length,
      returned: returned.length,
      unknown: unknown.length,
      stale_generation: stale.length,
      owner_relay_required: ownerRelay.length,
      missing_context_refs: missingRefs.length,
      cadence_backbeat_gaps: cadenceBackbeatGaps.length,
      return_apply_return_gaps: returnGaps.length,
      owner_cog_delta: ownerCogDelta,
    }),
    progressive: Object.freeze({
      summary: Object.freeze({
        active_agents: active.length,
        owner_relay_required: ownerRelay.length,
        currentness_failures: stale.length + unknown.length,
        owner_cog_delta: ownerCogDelta,
      }),
      attention_frontier: attentionFrontier,
      subterranean,
      all_lanes: lanes,
    }),
    effects: 0,
    effect_authority: false,
    hard: [
      'MULTI_WINDOW_COUNT != ORCHESTRATION',
      'AGENT_PRESENT != CURRENT',
      'PERSONA_CARD != AUTHORITY',
      'BRAND_PROFILE != EFFECT_AUTHORITY',
      'AUDHD_BRAND_GOVERNANCE != USER_LANGUAGE_REPLACEMENT',
      'CADENCE_WITHOUT_BACKBEAT != COMPLETE',
      'BACKBEAT_WITHOUT_CADENCE != COMPLETE',
      'SUBTERRANEAN != DELETED',
      'RESULT != RETURN != APPLY_RETURN',
      'OWNER_RELAY_REQUIRED != BORING_RUNTIME',
    ],
  });
}
