export const REJOIN_SEAM_SCHEMA = 'xiio.sdk.rejoin-seam-state/v1';
export const REJOIN_SEAMS_SCHEMA = 'xiio.sdk.rejoin-seams/v1';

const FAMILIES = new Set(['ACK', 'A2A', 'MCP']);
const STATES = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'N_A_WITH_EVIDENCE']);
const CURRENT_STATES = new Set(['CURRENT', 'N_A_WITH_EVIDENCE']);

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

  const missingBindings = [];
  if (required) {
    if (!targetRef) missingBindings.push('target_ref');
    if (!providerFamily) missingBindings.push('provider_family');
    if (!capabilityProfileRef) missingBindings.push('capability_profile_ref');
    if (!subjectGeneration) missingBindings.push('subject_generation');
    if (!currentGeneration) missingBindings.push('current_generation');
    if (observedState === 'CURRENT' && !evidenceRef) missingBindings.push('evidence_ref');
    if (observedState === 'CURRENT' && !readbackRef) missingBindings.push('readback_ref');
    if (observedState === 'CURRENT' && !observedAt) missingBindings.push('observed_at');
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
    authority: 'NONE',
    missing_bindings: missingBindings,
    invalidators,
    next: refreshRequired
      ? `RESOLVE_${family}_CURRENT_BINDING_AND_READBACK`
      : 'NO_EFFECT_CURRENT',
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
  const missingFamilies = [...FAMILIES].filter((family) => !coveredFamilies.has(family));
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

  return {
    schema: REJOIN_SEAMS_SCHEMA,
    ...root,
    status,
    root_generation_current: rootGenerationCurrent,
    denominator: seams.length,
    required_denominator: seams.filter((row) => row.required).length,
    current_required: current.length,
    stale_required: stale.length,
    unknown_required: unknown.length,
    missing_families: missingFamilies,
    refresh_required_count: refresh.length,
    refresh_obligations: refresh.map((row) => ({
      seam_id: row.seam_id,
      family: row.family,
      next: row.next,
      target_ref: row.target_ref,
      provider_family: row.provider_family,
      current_generation: row.current_generation,
      invalidators: row.invalidators,
      missing_bindings: row.missing_bindings,
    })),
    seams,
    effect_ceiling: 'PROJECTION_ONLY',
    provider_effects: 0,
    authority_granted: false,
    current: status === 'CURRENT_BOUNDED',
    next: status === 'CURRENT_BOUNDED'
      ? 'CONTINUE_CURRENT_FRONTIER'
      : 'REFRESH_ONLY_AFFECTED_SEAMS_THEN_RECOMPILE',
    hard: [
      'ACK != A2A != MCP',
      'REJOIN != REUSE_STALE_ACK',
      'SEAM_PRESENT != SEAM_CURRENT',
      'ENDPOINT_PRESENT != PRINCIPAL_CURRENT',
      'PROVIDER_CONNECTED != CAPABILITY_CURRENT',
      'ALTERNATE_SURFACE_PASS != REQUIRED_SURFACE_PASS',
      'N_A != N_A_WITH_EVIDENCE',
      'SDK_SEAM_COMPILER != PROVIDER_EXECUTION',
      'SDK_SEAM_COMPILER != EFFECT_AUTHORITY',
      'ONE_STALE_SEAM != ROOT_STOP_WHEN_INDEPENDENT_WORK_EXISTS',
      'CURRENT_REQUIRES_GENERATION_PLUS_EVIDENCE_PLUS_READBACK',
    ],
  };
}
