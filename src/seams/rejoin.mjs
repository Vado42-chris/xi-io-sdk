export const REJOIN_SEAM_SCHEMA = 'xiio.sdk.rejoin-seam-state/v1';
export const REJOIN_SEAMS_SCHEMA = 'xiio.sdk.rejoin-seams/v1';
export const STANDARD_REJOIN_FAMILIES = Object.freeze([
  'ACK', 'A2A', 'MCP', 'CLI', 'SDK', 'ARTICLES', 'PUBLISHER', 'BINS', 'CADENCE',
  'IBAL', 'SWITCHBOARD', 'WARD', 'CRM_MAIL', 'CLOUDFLARE', 'STUDIO', 'RETURN_CHAIN', 'DETONATOR',
]);

const FAMILIES = new Set(STANDARD_REJOIN_FAMILIES);
const TRANSPORT_FAMILIES = new Set(['A2A', 'MCP', 'CRM_MAIL', 'CLOUDFLARE']);
const STATES = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'N_A_WITH_EVIDENCE']);
const CURRENT_STATES = new Set(['CURRENT', 'N_A_WITH_EVIDENCE']);
const RESOLUTION_CLASSES = new Set(['MACHINE_RESOLVABLE', 'TRUE_WAIT', 'OWNER_ONLY', 'NONE']);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function upper(value) {
  return clean(value)?.toUpperCase() ?? null;
}

function requireString(value, field) {
  const out = clean(value);
  if (!out) throw new Error(`MISSING_${field.toUpperCase()}`);
  return out;
}

function normalizeSeam(raw, root) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('SEAM_INVALID');
  const seamId = requireString(raw.seam_id, 'seam_id');
  const family = upper(raw.family);
  if (!FAMILIES.has(family)) throw new Error(`SEAM_FAMILY_INVALID:${seamId}`);

  const required = raw.required !== false;
  const applicability = upper(raw.applicability ?? (required ? 'REQUIRED' : 'OPTIONAL'));
  const observedState = upper(raw.state ?? 'UNKNOWN');
  if (!STATES.has(observedState)) throw new Error(`SEAM_STATE_INVALID:${seamId}`);

  const subjectGeneration = clean(raw.subject_generation) ?? root.subject_generation;
  const currentGeneration = clean(raw.current_generation) ?? root.current_generation;
  const generationBound = Boolean(subjectGeneration && currentGeneration && subjectGeneration === currentGeneration);
  const targetRef = clean(raw.target_ref);
  const providerFamily = clean(raw.provider_family);
  const endpointRef = clean(raw.endpoint_ref);
  const capabilityProfileRef = clean(raw.capability_profile_ref);
  const evidenceRef = clean(raw.evidence_ref);
  const readbackRef = clean(raw.readback_ref);
  const observedAt = clean(raw.observed_at);
  const effectCeiling = clean(raw.effect_ceiling) ?? 'NO_EFFECT';
  const wakeWhen = clean(raw.wake_when);
  const resultRef = clean(raw.result_ref);
  const returnRef = clean(raw.return_ref);
  const applyReturnRef = clean(raw.apply_return_ref);
  const detonatorRef = clean(raw.detonator_ref);
  const tripDebtRef = clean(raw.trip_debt_ref);

  const missingBindings = [];
  if (required) {
    if (!targetRef) missingBindings.push('target_ref');
    if (!providerFamily) missingBindings.push('provider_family');
    if (!capabilityProfileRef) missingBindings.push('capability_profile_ref');
    if (!subjectGeneration) missingBindings.push('subject_generation');
    if (!currentGeneration) missingBindings.push('current_generation');
    if (observedState === 'CURRENT' && TRANSPORT_FAMILIES.has(family) && !endpointRef) missingBindings.push('endpoint_ref');
    if (observedState === 'CURRENT' && !evidenceRef) missingBindings.push('evidence_ref');
    if (observedState === 'CURRENT' && !readbackRef) missingBindings.push('readback_ref');
    if (observedState === 'CURRENT' && !observedAt) missingBindings.push('observed_at');
    if (observedState === 'CURRENT' && family === 'RETURN_CHAIN') {
      if (!resultRef) missingBindings.push('result_ref');
      if (!returnRef) missingBindings.push('return_ref');
      if (!applyReturnRef) missingBindings.push('apply_return_ref');
    }
    if (observedState === 'CURRENT' && family === 'DETONATOR') {
      if (!detonatorRef) missingBindings.push('detonator_ref');
      if (!tripDebtRef) missingBindings.push('trip_debt_ref');
    }
  }

  let state = observedState;
  const invalidators = [];
  if (required && missingBindings.length) {
    state = 'UNKNOWN';
    invalidators.push('REQUIRED_BINDING_MISSING');
  }
  if (required && subjectGeneration && currentGeneration && subjectGeneration !== currentGeneration) {
    state = 'STALE';
    invalidators.push('GENERATION_MISMATCH');
  }
  if (raw.currentness_invalidated === true) {
    state = 'STALE';
    invalidators.push('CURRENTNESS_INVALIDATED');
  }
  if (state === 'N_A_WITH_EVIDENCE' && !evidenceRef) {
    state = 'UNKNOWN';
    invalidators.push('N_A_WITHOUT_EVIDENCE');
  }

  const current = CURRENT_STATES.has(state) && (state === 'N_A_WITH_EVIDENCE' || generationBound);
  const refreshRequired = required && !current;
  let resolutionClass = upper(raw.resolution_class ?? (refreshRequired ? 'MACHINE_RESOLVABLE' : 'NONE'));
  if (!RESOLUTION_CLASSES.has(resolutionClass)) throw new Error(`SEAM_RESOLUTION_CLASS_INVALID:${seamId}`);
  if (!refreshRequired) resolutionClass = 'NONE';
  if (refreshRequired && resolutionClass === 'TRUE_WAIT' && !wakeWhen) {
    resolutionClass = 'MACHINE_RESOLVABLE';
    invalidators.push('TRUE_WAIT_WITHOUT_WAKE');
  }

  return {
    schema: REJOIN_SEAM_SCHEMA,
    root_ref: root.root_ref,
    agent_ref: root.agent_ref,
    seam_id: seamId,
    family,
    required,
    applicability,
    state,
    current,
    refresh_required: refreshRequired,
    resolution_class: resolutionClass,
    wake_when: wakeWhen,
    subject_generation: subjectGeneration,
    current_generation: currentGeneration,
    generation_bound: generationBound,
    target_ref: targetRef,
    provider_family: providerFamily,
    endpoint_ref: endpointRef,
    capability_profile_ref: capabilityProfileRef,
    evidence_ref: evidenceRef,
    readback_ref: readbackRef,
    observed_at: observedAt,
    effect_ceiling: effectCeiling,
    result_ref: resultRef,
    return_ref: returnRef,
    apply_return_ref: applyReturnRef,
    detonator_ref: detonatorRef,
    trip_debt_ref: tripDebtRef,
    authority: 'NONE',
    missing_bindings: missingBindings,
    invalidators,
    next: refreshRequired ? `RESOLVE_${family}_CURRENT_BINDING_AND_READBACK` : 'NO_EFFECT_CURRENT',
  };
}

export function compileRejoinSeams(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const root = {
    root_ref: requireString(input.root_ref, 'root_ref'),
    agent_ref: requireString(input.agent_ref, 'agent_ref'),
    subject_generation: requireString(input.subject_generation, 'subject_generation'),
    current_generation: requireString(input.current_generation, 'current_generation'),
  };
  if (!Array.isArray(input.seams) || input.seams.length === 0) throw new Error('SEAM_DENOMINATOR_REQUIRED');

  const seenIds = new Set();
  const seams = input.seams.map((row) => {
    const seam = normalizeSeam(row, root);
    if (seenIds.has(seam.seam_id)) throw new Error(`DUPLICATE_SEAM_ID:${seam.seam_id}`);
    seenIds.add(seam.seam_id);
    return seam;
  });

  const coveredFamilies = new Set(seams.map((row) => row.family));
  const missingFamilies = STANDARD_REJOIN_FAMILIES.filter((family) => !coveredFamilies.has(family));
  const stale = seams.filter((row) => row.required && row.state === 'STALE');
  const unknown = seams.filter((row) => row.required && row.state === 'UNKNOWN');
  const invalidNa = seams.filter((row) => !row.required && row.state === 'UNKNOWN' && row.invalidators.includes('N_A_WITHOUT_EVIDENCE'));
  const current = seams.filter((row) => row.required && row.current);
  const refresh = seams.filter((row) => row.refresh_required);
  const rootGenerationCurrent = root.subject_generation === root.current_generation;

  const status = !rootGenerationCurrent
    ? 'REBASE_REQUIRED'
    : missingFamilies.length > 0 || unknown.length > 0 || invalidNa.length > 0
      ? 'UNKNOWN'
      : stale.length > 0
        ? 'STALE'
        : 'CURRENT_BOUNDED';

  const obligations = refresh.map((row) => ({
    seam_id: row.seam_id,
    family: row.family,
    next: row.next,
    target_ref: row.target_ref,
    provider_family: row.provider_family,
    endpoint_ref: row.endpoint_ref,
    current_generation: row.current_generation,
    resolution_class: row.resolution_class,
    wake_when: row.wake_when,
    invalidators: row.invalidators,
    missing_bindings: row.missing_bindings,
  }));

  return {
    schema: REJOIN_SEAMS_SCHEMA,
    ...root,
    status,
    root_generation_current: rootGenerationCurrent,
    denominator: seams.length,
    required_denominator: seams.filter((row) => row.required).length,
    standard_family_denominator: STANDARD_REJOIN_FAMILIES.length,
    current_required: current.length,
    stale_required: stale.length,
    unknown_required: unknown.length,
    missing_families: missingFamilies,
    refresh_required_count: refresh.length,
    machine_resolvable_refresh_count: obligations.filter((row) => row.resolution_class === 'MACHINE_RESOLVABLE').length,
    true_wait_refresh_count: obligations.filter((row) => row.resolution_class === 'TRUE_WAIT').length,
    owner_only_refresh_count: obligations.filter((row) => row.resolution_class === 'OWNER_ONLY').length,
    refresh_obligations: obligations,
    seams,
    effect_ceiling: 'PROJECTION_ONLY',
    provider_effects: 0,
    authority_granted: false,
    current: status === 'CURRENT_BOUNDED',
    next: status === 'CURRENT_BOUNDED' ? 'CONTINUE_CURRENT_FRONTIER' : 'REFRESH_ONLY_AFFECTED_SEAMS_THEN_RECOMPILE',
    hard: [
      'ACK != A2A != MCP != CRM_MAIL != CLOUDFLARE',
      'REJOIN != REUSE_STALE_ACK',
      'SEAM_PRESENT != SEAM_CURRENT',
      'ENDPOINT_PRESENT != PRINCIPAL_CURRENT',
      'CONTACT_CARD != MAIL_ACCOUNT_RUNTIME',
      'SMTP_CONFIG_PRESENT != SMTP_SUBMISSION_OR_READBACK',
      'CLOUDFLARE_HOSTNAME_PRESENT != EDGE_READBACK_CURRENT',
      'RESULT != RETURN != APPLY_RETURN',
      'DETONATOR_DECLARED != DETONATOR_TRIP_READBACK',
      'PROVIDER_CONNECTED != CAPABILITY_CURRENT',
      'ALTERNATE_SURFACE_PASS != REQUIRED_SURFACE_PASS',
      'N_A != N_A_WITH_EVIDENCE',
      'TRUE_WAIT_REQUIRES_EXACT_WAKE',
      'SDK_SEAM_COMPILER != PROVIDER_EXECUTION',
      'SDK_SEAM_COMPILER != EFFECT_AUTHORITY',
      'ONE_STALE_SEAM != ROOT_STOP_WHEN_INDEPENDENT_WORK_EXISTS',
      'CURRENT_REQUIRES_GENERATION_PLUS_EVIDENCE_PLUS_READBACK',
    ],
  };
}
