const STATES = new Set(['PASS','FAIL','WAIT','N_A_WITH_REASON','UNKNOWN']);

export const GRADUATION_PROFILES = Object.freeze({
  ROOT_R0_R13: Object.freeze([
    ['R0','ROOT_IDENTITY'],
    ['R1','PROVIDER_CURRENT_ACCEPTED_REF'],
    ['R2','SDK_BASELINE_CURRENT'],
    ['R3','SDK_SURFACE_APPLICABILITY'],
    ['R4','IBAL_ENTRY_CURRENT_ASSIGNMENT_FORMATION'],
    ['R5','CURRENT_WORK_CUSTODY'],
    ['R6','HOTFOLDER_MACHINE_WAKE_LEAF'],
    ['R7','DETONATOR_AFFECTED_NO_EFFECT_UNKNOWN'],
    ['R8','CHILD_ACK_BEFORE_ATTEMPT'],
    ['R9','RESULT_AND_RETURN_TARGET'],
    ['R10','APPLY_RETURN_EXACTLY_ONCE'],
    ['R11','PROVIDER_CONSUMER_READBACK'],
    ['R12','ROTF_HUMAN_PROJECTION'],
    ['R13','NO_ARCHAEOLOGY'],
  ]),
  TEMPLATE_L1_L10: Object.freeze([
    ['L1','CURRENTNESS'],
    ['L2','IDENTITY'],
    ['L3','TEMPLATE'],
    ['L4','PRIMITIVE'],
    ['L5','FORMATION'],
    ['L6','EXECUTION'],
    ['L7','VERIFICATION'],
    ['L8','BLASTWAVE'],
    ['L9','RETURN'],
    ['L10','LIVE_TRUTH'],
  ]),
  RELEASE_P0_P13: Object.freeze([
    ['P0','IDENTITY'],
    ['P1','SOURCE'],
    ['P2','DEPENDENCY'],
    ['P3','BUILD'],
    ['P4','AUTOMATED_VERIFICATION'],
    ['P5','ARTIFACT_INSPECTION'],
    ['P6','TARGET_READINESS'],
    ['P7','SIMULATION'],
    ['P8','INDEPENDENT_REVIEW'],
    ['P9','OWNER_APPROVAL'],
    ['P10','EFFECT_ADMISSION'],
    ['P11','PROVIDER_ATTEMPT_RESULT'],
    ['P12','READBACK_OBSERVATION'],
    ['P13','CLOSEOUT_RETURN_REAP'],
  ]),
  WORK_0_15: Object.freeze([
    ['W0','DISCOVER_ONBOARD'],
    ['W1','RESEARCH_ARCHAEOLOGY'],
    ['W2','STRATEGY_WATERFALL_PLAN'],
    ['W3','GATE_READINESS'],
    ['W4','BACKLOG_DECOMPOSITION'],
    ['W5','SPRINT_FLOW_PLANNING'],
    ['W6','WORK_ITEM_ELIGIBILITY_ORDERING'],
    ['W7','WORKER_ROLE_RESOURCE_SCHEDULING'],
    ['W8','EXECUTION_SLICE_LOOP'],
    ['W9','TARGETED_VERIFICATION'],
    ['W10','HOSTILE_INDEPENDENT_REVIEW'],
    ['W11','OWNER_RELEASE_GATES'],
    ['W12','MERGED_MAIN_VERIFICATION'],
    ['W13','HANDOFF_CONTINUATION'],
    ['W14','POSTMORTEM_LEARNING'],
    ['W15','VERIFIED_LESSON_PROMOTION'],
  ]),
  STUDIO_CHILD_G0_G15: Object.freeze([
    ['G0','LOCAL_CURRENTNESS_AND_PROJECT_BASELINE'],
    ['G1','BINS_RESOURCE_VERSION_AND_LIBRARY_CUSTODY'],
    ['G2','API_GLASS_BOX_CURRENT_TOOL_AND_SKILL_ROSTER'],
    ['G3','RESUME_PERSONA_SKILL_CONTEXT'],
    ['G4','CALENDAR_CHRONAL_DEADLINE_CONTEXT'],
    ['G5','TIMESHEETS_EFFORT_TIME_METER_CONTEXT'],
    ['G6','HEADLESS_SKILL_RECALL'],
    ['G7','SDK_PRIMITIVE_INVARIANTS'],
    ['G8','PUBLISHER_TEMPLATE_RECIPE'],
    ['G9','BRAND_VARIABLE_RECONNECT'],
    ['G10','IMPLEMENTATION_VARIABLE_RECONNECT'],
    ['G11','RCUBE_BINARY_SIMULATION'],
    ['G12','X42_HOSTILE_QUALIFICATION'],
    ['G13','X43_CONDITIONAL_DEEP_REVIEW'],
    ['G14','METERED_RUNTIME_OR_BUILD_PROOF'],
    ['G15','RETURN_APPLY_RETURN_READBACK_REAP'],
  ]),
  WARD_E0_E9: Object.freeze([
    ['E0','EXACT_ADAPTER_SURFACE_AND_GENERATION'],
    ['E1','EXACT_EFFECT_CLASS_AND_SUBJECT_SCOPE'],
    ['E2','WARD_POLICY_GUARD_AND_GENERATION_CURRENT'],
    ['E3','APPLICABILITY_AND_AFFECTED_NO_EFFECT_UNKNOWN_DISPOSITION'],
    ['E4','PRIVACY_DISCLOSURE_AND_LEAST_DISCLOSURE_BOUNDARY'],
    ['E5','SWITCHBOARD_OR_EFFECT_ADMISSION_WHERE_CONSEQUENTIAL'],
    ['E6','PRIOR_EFFECT_IDEMPOTENCY_REPLAY_AND_UNCERTAINTY_STATE'],
    ['E7','ATTEMPT_ONLY_AFTER_CURRENT_GUARD_AND_ADMISSION'],
    ['E8','PROVIDER_NATIVE_RESULT_AND_READBACK'],
    ['E9','RETURN_APPLY_RETURN_AFFECTED_REREAD_AND_REAP'],
  ]),
});

function bounded(value, max = 512) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function normalizeCell(id, label, raw = {}) {
  const state = STATES.has(raw.state) ? raw.state : 'UNKNOWN';
  const reason = bounded(raw.reason) ? raw.reason : null;
  const evidence = Array.isArray(raw.evidence_refs)
    ? [...new Set(raw.evidence_refs.filter((ref) => bounded(ref)))].sort()
    : [];
  const blockers = Array.isArray(raw.blockers)
    ? [...new Set(raw.blockers.filter((ref) => bounded(ref)))].sort()
    : [];

  let effective = state;
  let defect = null;
  if (state === 'PASS' && evidence.length === 0) {
    effective = 'UNKNOWN';
    defect = 'PASS_WITHOUT_EVIDENCE';
  } else if (state === 'N_A_WITH_REASON' && (!reason || evidence.length === 0)) {
    effective = 'UNKNOWN';
    defect = 'NA_WITHOUT_REASON_OR_EVIDENCE';
  } else if (state === 'FAIL' && blockers.length === 0 && !reason) {
    defect = 'FAIL_WITHOUT_REASON_OR_BLOCKER';
  } else if (state === 'WAIT' && (!reason || blockers.length === 0)) {
    defect = 'WAIT_WITHOUT_REASON_AND_WAKE_BLOCKER';
  }
  return { id, label, state: effective, declared_state: state, reason, evidence_refs: evidence, blockers, defect };
}

function normalizeX43TriggerEvaluation(input) {
  const raw = input?.x43_trigger_evaluation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { state:'UNKNOWN', triggers:[], evidence_refs:[] };
  }
  const state = raw.state === 'TRIGGERED' || raw.state === 'NO_TRIGGER' ? raw.state : 'UNKNOWN';
  const triggers = Array.isArray(raw.triggers)
    ? [...new Set(raw.triggers.filter((v) => bounded(v)))].sort()
    : [];
  const evidence_refs = Array.isArray(raw.evidence_refs)
    ? [...new Set(raw.evidence_refs.filter((v) => bounded(v)))].sort()
    : [];
  return { state, triggers, evidence_refs };
}

function applyStudioChildConditionalGates(profileId, cells, input) {
  if (profileId !== 'STUDIO_CHILD_G0_G15') return cells;
  const x43 = cells.find((cell) => cell.id === 'G13');
  const evaluation = normalizeX43TriggerEvaluation(input);

  if (!x43) return cells;

  if (evaluation.state === 'NO_TRIGGER') {
    if (evaluation.evidence_refs.length === 0) {
      x43.state = 'UNKNOWN';
      x43.reason = 'X43_NO_TRIGGER_EVIDENCE_MISSING';
      x43.evidence_refs = [];
      x43.blockers = ['wake:x43-trigger-evaluation'];
      x43.defect = 'X43_TRIGGER_EVALUATION_UNPROVEN';
      return cells;
    }
    if (x43.declared_state === 'UNKNOWN' || x43.declared_state === 'N_A_WITH_REASON') {
      x43.state = 'N_A_WITH_REASON';
      x43.reason = 'NO_X43_TRIGGER';
      x43.evidence_refs = evaluation.evidence_refs;
      x43.blockers = [];
      x43.defect = null;
    }
    return cells;
  }

  if (evaluation.state === 'TRIGGERED') {
    const triggerRefs = evaluation.triggers.length ? evaluation.triggers : ['UNSPECIFIED_TRIGGER'];
    if (x43.state !== 'PASS') {
      x43.state = 'UNKNOWN';
      x43.reason = 'X43_TRIGGER_PRESENT';
      x43.evidence_refs = evaluation.evidence_refs;
      x43.blockers = [...new Set([...(x43.blockers || []), ...triggerRefs.map((t) => `x43:${t}`)])].sort();
      x43.defect = 'X43_REQUIRED_BUT_NOT_PROVEN';
    }
    return cells;
  }

  if (x43.state !== 'PASS') {
    x43.state = 'UNKNOWN';
    x43.reason = 'X43_TRIGGER_EVALUATION_UNKNOWN';
    x43.blockers = [...new Set([...(x43.blockers || []), 'wake:x43-trigger-evaluation'])].sort();
    x43.defect = 'X43_TRIGGER_EVALUATION_UNPROVEN';
  }
  return cells;
}

function passLikeForProfile(profileId, cell) {
  if (cell.state === 'PASS') return true;
  if (cell.state !== 'N_A_WITH_REASON') return false;
  if (profileId !== 'STUDIO_CHILD_G0_G15') return true;
  return cell.id === 'G13';
}

export function compileGraduationPreflight(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('preflight input must be an object');
  const profileId = input.profile;
  const profile = GRADUATION_PROFILES[profileId];
  if (!profile) throw new TypeError(`unknown graduation profile ${profileId}`);
  if (!bounded(input.subject_ref)) throw new TypeError('subject_ref required');
  if (!bounded(input.source_generation)) throw new TypeError('source_generation required');
  const supplied = input.cells && typeof input.cells === 'object' && !Array.isArray(input.cells) ? input.cells : {};
  const known = new Set(profile.map(([id]) => id));
  const extras = Object.keys(supplied).filter((id) => !known.has(id));
  if (extras.length) throw new TypeError(`unknown graduation cells: ${extras.join(',')}`);

  const cells = applyStudioChildConditionalGates(
    profileId,
    profile.map(([id, label]) => normalizeCell(id, label, supplied[id])),
    input,
  );
  const firstRed = cells.find((cell) => !passLikeForProfile(profileId, cell)) || null;
  let graduatedThrough = null;
  for (const cell of cells) {
    if (!passLikeForProfile(profileId, cell)) break;
    graduatedThrough = cell.id;
  }
  const counts = Object.fromEntries([...STATES].map((state) => [state, cells.filter((cell) => cell.state === state).length]));
  const defects = cells.filter((cell) => cell.defect).map((cell) => ({ cell: cell.id, defect: cell.defect }));
  const releaseEligible = !firstRed && defects.length === 0;
  return {
    schema: 'xiio.sdk.graduation-preflight/v1',
    profile: profileId,
    subject_ref: input.subject_ref,
    source_generation: input.source_generation,
    denominator: cells.length,
    accounting_100: cells.length === profile.length,
    counts,
    cells,
    first_red: firstRed ? { cell: firstRed.id, label: firstRed.label, state: firstRed.state, reason: firstRed.reason, blockers: firstRed.blockers } : null,
    graduated_through: graduatedThrough,
    release_eligible: releaseEligible,
    defects,
    authority_granted: false,
    provider_effect: false,
    hard: [
      'ONE_REQUIRED_RED->NOT_GRADUATED',
      'ACCOUNTING_100!=CLOSURE_100',
      'PASS_WITHOUT_EVIDENCE!=PASS',
      'N_A_WITHOUT_REASON_AND_EVIDENCE!=N_A',
      'WAIT_WITHOUT_WAKE!=VALID_WAIT',
      'SIMULATION_PASS!=RUNTIME_PASS',
      'SOURCE!=BUILD!=RUNNING!=LIVE',
      'PREFLIGHT!=AUTHORITY',
      'WARD_DECISION!=SWITCHBOARD_OR_PROVIDER_AUTHORITY',
      'READABLE!=DISCLOSABLE',
      'CONNECTED!=AFFECTED',
      'UNKNOWN!=NO_EFFECT',
      'RESULT!=RETURN!=APPLY_RETURN',
      'STUDIO_CHILD_GRADUATION_REQUIRES_BINS_SDK_PUBLISHER_RECONNECT',
      'BRAND_VARIABLE!=SDK_INVARIANT',
      'IMPLEMENTATION_VARIABLE!=SDK_INVARIANT',
      'HEADLESS_RECALL!=LIVE_RUNTIME',
      'GRADUATED_CHILD!=PUBLISHED_OR_EFFECT_AUTHORIZED',
      'RESUME_CONTEXT!=HUMAN_AUTHORITY',
      'CALENDAR_CONTEXT!=CADENCE_AUTHORITY',
      'TIMESHEET_METER!=BILLABLE_FACT',
      'API_GLASS_BOX_VISIBLE!=TOOL_CONNECTED_OR_AUTHORIZED',
      'X42_PASS!=X43_N_A_WHEN_TRIGGERED',
      'X43_N_A_WITH_TRIGGER!=VALID',
      'X43_REQUIRED_ONLY_WHEN_TRIGGER_PREDICATE_TRUE',
      'X43_TRIGGER_EVALUATION_MISSING!=NO_TRIGGER',
      'STUDIO_CHILD_G9_G10_REQUIRE_PASS_NOT_N_A',
      'STUDIO_CHILD_ENTRYPOINT_PINS_PROFILE',
    ],
  };
}

export function profileCatalog() {
  return {
    schema: 'xiio.sdk.graduation-profile-catalog/v1',
    profiles: Object.entries(GRADUATION_PROFILES).map(([id, cells]) => ({
      id,
      denominator: cells.length,
      cells: cells.map(([cell_id, label]) => ({ cell_id, label })),
    })),
    authority_granted: false,
    provider_effect: false,
  };
}


export function compileStudioChildGraduationPreflight(input = {}) {
  if (input?.profile && input.profile !== 'STUDIO_CHILD_G0_G15') {
    throw new TypeError('Studio child graduation profile is pinned to STUDIO_CHILD_G0_G15');
  }
  return compileGraduationPreflight({
    ...input,
    profile: 'STUDIO_CHILD_G0_G15',
    subject_class: 'STUDIO_CHILD',
  });
}
