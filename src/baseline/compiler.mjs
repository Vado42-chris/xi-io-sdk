import crypto from 'node:crypto';

export const BASELINE_SCHEMA = 'xiio.sdk.portfolio-baseline/v1';
export const ACK_DISTRIBUTION_SCHEMA = 'xiio.sdk.distributed-ack-set/v1';
export const BURNMAP_SCHEMA = 'xiio.sdk.org-burnmap/v1';

// Public obligation vocabulary: SDK issue #16. A caller must supply the current
// profile reference/generation; this vocabulary is not an accepted-source claim.
const OBLIGATIONS = Object.freeze([
  'ROOT_IDENTITY', 'PROVIDER_CURRENT_ACCEPTED_REF', 'SDK_BASELINE_CURRENT',
  'SDK_SURFACE_APPLICABILITY', 'IBAL_ENTRY_CURRENT_ASSIGNMENT_FORMATION',
  'CURRENT_WORK_CUSTODY', 'HOTFOLDER_MACHINE_WAKE_LEAF',
  'DETONATOR_AFFECTED_NO_EFFECT_UNKNOWN', 'CHILD_ACK_BEFORE_ATTEMPT',
  'RESULT_AND_RETURN_TARGET', 'APPLY_RETURN_EXACTLY_ONCE',
  'PROVIDER_CONSUMER_READBACK', 'ROTF_HUMAN_PROJECTION', 'NO_ARCHAEOLOGY',
]);
export const BASELINE_CELLS = Object.freeze(OBLIGATIONS.map((_, i) => `R${i}`));
const LEGACY_DIAGNOSTIC_CELLS = Object.freeze([
  'REGISTRATION',
  'INTEGRATION',
  'HYDRATION',
  'WORKER_CAPABILITY',
  'MAIN_STATUS',
  'BRANCH_STEW',
  'ACK_CURRENTNESS',
  'RETURN_READBACK',
]);

const STATES = new Set(['PASS', 'PARTIAL', 'BLOCKED', 'UNKNOWN', 'N_A', 'SUPPLIED_UNVERIFIED']);
const UNBOUND_REFS = new Set(['UNKNOWN', 'UNBOUND', 'UNVERIFIED', 'UNOBSERVED', 'MISSING', 'NONE', 'NULL', 'N/A', 'NA', 'TBD', 'TODO']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function observedBool(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function state(value, fallback = 'UNKNOWN') {
  return STATES.has(value) ? value : fallback;
}

function branchState(repo) {
  if (repo.branch_census_state !== 'COMPLETE' || !Array.isArray(repo.branches)) return { state: 'UNKNOWN', reason: 'BRANCH_CENSUS_UNKNOWN' };
  const branches = repo.branches;
  const nonDefault = branches.filter((b) => b?.name && b.name !== repo.default_branch);
  const undispositioned = nonDefault.filter((b) => !['KEEP', 'ACTIVE', 'MERGED', 'RETIRE_CANDIDATE', 'DONOR', 'HOLD'].includes(b.disposition));
  if (undispositioned.length > 0) return { state: 'BLOCKED', reason: 'UNDISPOSITIONED_BRANCH_STEW', count: undispositioned.length };
  if (nonDefault.length > 0) return { state: 'PARTIAL', reason: 'BRANCHES_PRESENT_DISPOSITIONED', count: nonDefault.length };
  return { state: 'PASS', reason: 'NO_NONDEFAULT_BRANCH_STEW', count: 0 };
}

function cell(id, value, reason, evidence = []) {
  const declared = state(value);
  if (!Array.isArray(evidence) || evidence.some(ref => typeof ref !== 'string' || !ref.trim() || ref.length > 512)) throw new TypeError('invalid evidence refs');
  return { id, state: ['PASS', 'N_A'].includes(declared) ? 'SUPPLIED_UNVERIFIED' : declared, declared_state: declared, verified: false, reason, evidence_refs: [...new Set(evidence)].sort() };
}

function pairState(a, b, passReason, aMissingReason, bMissingReason, bothMissingReason) {
  if (a === null || b === null) {
    return { state: 'UNKNOWN', reason: 'OBSERVATION_INCOMPLETE' };
  }
  if (a && b) return { state: 'PASS', reason: passReason };
  if (a || b) return { state: 'PARTIAL', reason: a ? bMissingReason : aMissingReason };
  return { state: 'BLOCKED', reason: bothMissingReason };
}

function unaryState(value, trueReason, falseReason) {
  if (value === null) return { state: 'UNKNOWN', reason: 'OBSERVATION_NOT_RUN' };
  return value ? { state: 'PASS', reason: trueReason } : { state: 'BLOCKED', reason: falseReason };
}

function compileLegacyDiagnostics(repo) {
  const repoRef = requiredString(repo.repo_ref, 'repo_ref');
  const defaultBranch = requiredString(repo.default_branch || 'main', `${repoRef}.default_branch`);
  const head = typeof repo.head_sha === 'string' && /^[0-9a-f]{40}$/i.test(repo.head_sha) ? repo.head_sha : null;
  const managedManifest = observedBool(repo.managed_manifest_current);
  const hydration = observedBool(repo.hydration_current);
  const workerProjection = observedBool(repo.worker_capability_current);
  const ackCurrent = observedBool(repo.ack_current);
  const returnCurrent = observedBool(repo.return_readback_current);
  const sdkCli = observedBool(repo.sdk_cli_adopted);
  const b = branchState(repo);
  const classified = typeof repo.classification === 'string' && repo.classification.trim() && !['UNCLASSIFIED', 'UNKNOWN'].includes(repo.classification);

  const integration = pairState(
    managedManifest,
    sdkCli,
    'MANAGED_AND_SDK_CLI_ADOPTED',
    'MANAGED_MANIFEST_MISSING',
    'SDK_CLI_MISSING',
    'MANAGED_INTEGRATION_MISSING',
  );

  if (integration.state === 'PASS' && !classified) { integration.state = 'PARTIAL'; integration.reason = 'CLASSIFICATION_UNBOUND'; }

  let hydrationCell;
  if (hydration === null || managedManifest === null) hydrationCell = { state: 'UNKNOWN', reason: 'OBSERVATION_INCOMPLETE' };
  else if (hydration) hydrationCell = { state: 'PASS', reason: 'HYDRATION_CURRENT' };
  else if (managedManifest) hydrationCell = { state: 'PARTIAL', reason: 'HYDRATION_MISSING_OR_STALE' };
  else hydrationCell = { state: 'BLOCKED', reason: 'UNMANAGED_CANNOT_HYDRATE' };

  let workerCell;
  if (workerProjection === null || managedManifest === null) workerCell = { state: 'UNKNOWN', reason: 'OBSERVATION_INCOMPLETE' };
  else if (workerProjection) workerCell = { state: 'PASS', reason: 'WORKER_CAPABILITY_CURRENT' };
  else if (managedManifest) workerCell = { state: 'PARTIAL', reason: 'WORKER_CAPABILITY_UNQUALIFIED' };
  else workerCell = { state: 'BLOCKED', reason: 'WORKER_CAPABILITY_NOT_BOUND' };

  let ackCell;
  if (ackCurrent === null || managedManifest === null) ackCell = { state: 'UNKNOWN', reason: 'OBSERVATION_INCOMPLETE' };
  else if (ackCurrent) ackCell = { state: 'PASS', reason: 'ACK_CURRENT' };
  else if (managedManifest) ackCell = { state: 'PARTIAL', reason: 'ACK_MISSING_OR_STALE' };
  else ackCell = { state: 'BLOCKED', reason: 'ACK_NOT_ADMITTED' };

  let returnCell;
  if (returnCurrent === null || ackCurrent === null) returnCell = { state: 'UNKNOWN', reason: 'OBSERVATION_INCOMPLETE' };
  else if (returnCurrent) returnCell = { state: 'PASS', reason: 'RETURN_READBACK_CURRENT' };
  else if (ackCurrent) returnCell = { state: 'PARTIAL', reason: 'RETURN_READBACK_MISSING' };
  else returnCell = { state: 'BLOCKED', reason: 'NO_CURRENT_ACK_RETURN_CHAIN' };

  const mainCell = head
    ? defaultBranch === 'main'
      ? { state: 'PASS', reason: 'MAIN_HEAD_OBSERVED' }
      : { state: 'PARTIAL', reason: 'DEFAULT_BRANCH_NOT_MAIN' }
    : { state: 'UNKNOWN', reason: 'HEAD_NOT_OBSERVED' };

  const cells = [
    cell('REGISTRATION', 'PASS', 'REPOSITORY_REGISTERED', repo.registration_evidence_refs),
    cell('INTEGRATION', integration.state, integration.reason, repo.integration_evidence_refs),
    cell('HYDRATION', hydrationCell.state, hydrationCell.reason, repo.hydration_evidence_refs),
    cell('WORKER_CAPABILITY', workerCell.state, workerCell.reason, repo.worker_evidence_refs),
    cell('MAIN_STATUS', mainCell.state, mainCell.reason, repo.main_evidence_refs),
    cell('BRANCH_STEW', b.state, b.reason, repo.branch_evidence_refs),
    cell('ACK_CURRENTNESS', ackCell.state, ackCell.reason, repo.ack_evidence_refs),
    cell('RETURN_READBACK', returnCell.state, returnCell.reason, repo.return_evidence_refs),
  ];

  const counts = Object.fromEntries([...STATES].map((s) => [s, cells.filter((c) => c.state === s).length]));
  const firstRed = cells.find((c) => c.declared_state !== 'PASS' && c.declared_state !== 'N_A') || null;
  return {
    repo_ref: repoRef,
    visibility: repo.visibility || 'UNKNOWN',
    default_branch: defaultBranch,
    head_sha: head,
    sdk_cli_adopted: sdkCli,
    classification: repo.classification || 'UNCLASSIFIED',
    evidence_state: 'SUPPLIED_UNVERIFIED',
    punchcard: {
      denominator: LEGACY_DIAGNOSTIC_CELLS.length,
      counts,
      cells,
      accounting_100: cells.length === LEGACY_DIAGNOSTIC_CELLS.length,
      supplied_coverage_complete: cells.every((c) => c.declared_state === 'PASS' || c.declared_state === 'N_A'),
      closure_100: false,
    },
    next: firstRed ? { cell: firstRed.id, reason: firstRed.reason } : { cell: 'VERIFY_SUPPLIED_BASELINE', reason: 'AUTHENTICATED_BASELINE_REQUIRED' },
  };
}

function ref(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 512 &&
    !UNBOUND_REFS.has(value.toUpperCase()) ? value : null;
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function profileBinding(value) {
  const input = record(value);
  const sourceRef = ref(input?.source_ref);
  const generation = ref(input?.source_generation);
  return {
    vocabulary_source_ref: 'https://github.com/Vado42-chris/xi-io-sdk/issues/16',
    source_ref: sourceRef,
    source_generation: generation,
    state: sourceRef && generation ? 'SUPPLIED_UNVERIFIED' : 'UNKNOWN',
    reason: sourceRef && generation ? 'PROFILE_SOURCE_REQUIRES_AUTHENTICATED_READBACK' : 'BASELINE_PROFILE_UNBOUND',
    required_cells: [...BASELINE_CELLS],
    denominator: BASELINE_CELLS.length,
    verified: false,
  };
}

function compileRepo(repo, profile) {
  const legacy = compileLegacyDiagnostics(repo);
  const context = record(repo.baseline_context);
  const rootRef = ref(context?.root_ref);
  const rootGeneration = ref(context?.root_generation);
  const contextMatches = context?.profile_ref === profile.source_ref && context?.profile_generation === profile.source_generation;
  const observations = record(repo.baseline_observations) || {};
  if (Object.keys(observations).some(id => !BASELINE_CELLS.includes(id))) throw new TypeError('unknown baseline obligation');
  const bindingReason = profile.state === 'UNKNOWN' ? 'BASELINE_PROFILE_UNBOUND'
    : !rootRef || !rootGeneration ? 'ROOT_GENERATION_UNBOUND'
      : !contextMatches ? 'BASELINE_PROFILE_GENERATION_MISMATCH' : null;
  const cells = BASELINE_CELLS.map((id, i) => {
    const observation = record(observations[id]);
    const evidence = observation?.evidence_refs ?? [];
    const declared = state(observation?.state);
    const reason = bindingReason || (!observation ? 'OBLIGATION_NOT_OBSERVED'
      : ['PASS', 'N_A'].includes(declared) && (!Array.isArray(evidence) || evidence.length === 0) ? 'OBLIGATION_EVIDENCE_MISSING'
        : ref(observation.reason) || 'SUPPLIED_OBLIGATION_REQUIRES_VERIFICATION');
    const unknown = bindingReason || !observation || reason === 'OBLIGATION_EVIDENCE_MISSING';
    return { ...cell(id, unknown ? 'UNKNOWN' : declared, reason, evidence), obligation: OBLIGATIONS[i] };
  });
  const counts = Object.fromEntries([...STATES].map(s => [s, cells.filter(c => c.state === s).length]));
  const missing = cells.filter(c => !['PASS', 'N_A'].includes(c.declared_state));
  return {
    ...legacy,
    baseline_profile: profile,
    root_ref: rootRef,
    root_generation: rootGeneration,
    context_binding_state: bindingReason ? 'UNKNOWN' : 'SUPPLIED_UNVERIFIED',
    legacy_diagnostics: {
      schema: 'xiio.sdk.repo-diagnostics/v1',
      purpose: 'CLASSIFICATION_OBSERVATIONS_ONLY_NOT_R0_R13_BASELINE',
      punchcard: legacy.punchcard,
      next: legacy.next,
    },
    punchcard: {
      denominator: BASELINE_CELLS.length,
      counts,
      cells,
      accounting_100: cells.length === BASELINE_CELLS.length,
      supplied_coverage_complete: missing.length === 0,
      closure_100: false,
    },
    missing_obligations: missing.map(c => ({ cell: c.id, reason: c.reason })),
    next: missing[0] ? { cell: missing[0].id, reason: missing[0].reason }
      : { cell: 'VERIFY_SUPPLIED_BASELINE', reason: 'AUTHENTICATED_BASELINE_REQUIRED' },
  };
}

function assertBaseline(baseline) {
  if (!baseline || baseline.schema !== BASELINE_SCHEMA) throw new TypeError('baseline schema invalid');
  if (baseline.cells_per_repository !== BASELINE_CELLS.length || !Array.isArray(baseline.repositories) ||
      baseline.repositories.length === 0 || baseline.repositories.some(repo =>
        repo.punchcard?.denominator !== BASELINE_CELLS.length || !Array.isArray(repo.punchcard?.cells) ||
        repo.punchcard.cells.length !== BASELINE_CELLS.length ||
        repo.punchcard.cells.some((c, i) => c?.id !== BASELINE_CELLS[i]))) {
    throw new TypeError('baseline requires all fourteen R0-R13 obligations; recompile legacy diagnostics');
  }
}

/**
 * R0-R13 input uses baseline_profile: { source_ref, source_generation } and,
 * per repository, baseline_context: { profile_ref, profile_generation, root_ref,
 * root_generation }, plus baseline_observations: { R0: { state, evidence_refs,
 * reason? }, ... R13 }. Source references/generations must come from the host's
 * profile resolver. This pure compiler cannot authenticate them. Legacy boolean
 * observations remain diagnostics and never populate the R0-R13 obligations.
 */
export function compilePortfolioBaseline(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('snapshot must be an object');
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length === 0) throw new TypeError('snapshot.repositories must be non-empty');
  const profile = profileBinding(snapshot.baseline_profile);
  const seen = new Set();
  const repos = snapshot.repositories.map((repo) => {
    const compiled = compileRepo(repo, profile);
    if (seen.has(compiled.repo_ref)) throw new TypeError(`duplicate repo_ref ${compiled.repo_ref}`);
    seen.add(compiled.repo_ref);
    return compiled;
  }).sort((a, b) => a.repo_ref.localeCompare(b.repo_ref));
  const cellDenominator = repos.length * BASELINE_CELLS.length;
  const stateCounts = Object.fromEntries([...STATES].map((s) => [s, repos.reduce((n, r) => n + r.punchcard.counts[s], 0)]));
  const payload = {
    schema: BASELINE_SCHEMA,
    source_generation: requiredString(snapshot.source_generation, 'source_generation'),
    observed_at: requiredString(snapshot.observed_at, 'observed_at'),
    baseline_profile: profile,
    repository_denominator: repos.length,
    cells_per_repository: BASELINE_CELLS.length,
    cell_denominator: cellDenominator,
    state_counts: stateCounts,
    evidence_state: 'SUPPLIED_UNVERIFIED',
    provider_effect: false,
    authority_granted: false,
    repository_accounting_100: repos.length === snapshot.repositories.length,
    org_closure_100: false,
    repositories: repos,
    hard: [
      'REGISTERED != INTEGRATED',
      'INTEGRATED != HYDRATED',
      'HYDRATED != WORKER_QUALIFIED',
      'DEFAULT_BRANCH_PRESENT != MAIN_CURRENT',
      'BRANCH_CENSUS_NOT_RUN != NO_STEW',
      'ACK_PRESENT != ACK_CURRENT',
      'RESULT != RETURN != APPLY_RETURN',
      'ACCOUNTING_100 != CLOSURE_100',
      'UNOBSERVED != FALSE',
      'UNKNOWN != NO_EFFECT',
      'EXTERNAL_AI != AUTHORITY',
      'EIGHT_DIAGNOSTICS != FOURTEEN_BASELINE_OBLIGATIONS',
      'SUPPLIED_PROFILE != ACCEPTED_CURRENT_PROFILE',
    ],
  };
  return { ...payload, baseline_generation: digest(payload) };
}

export function compileDistributedAcks(baseline) {
  assertBaseline(baseline);
  const acks = baseline.repositories.map((repo) => ({
    schema: 'xiio.sdk.distributed-ack/v1',
    repo_ref: repo.repo_ref,
    baseline_generation: baseline.baseline_generation,
    repo_head_sha: repo.head_sha,
    root_ref: repo.root_ref,
    root_generation: repo.root_generation,
    baseline_profile: repo.baseline_profile,
    classification: repo.classification,
    current_punchcard: { ...repo.punchcard, closure_100: false, evidence_state: 'SUPPLIED_UNVERIFIED' },
    next: repo.next,
    requested_return: {
      schema: 'xiio.sdk.distributed-return/v1',
      required_cells: BASELINE_CELLS,
      return_fields: ['repo_ref', 'repo_head_sha', 'root_ref', 'root_generation', 'baseline_generation', 'baseline_profile_generation', 'cell_receipts', 'next', 'blockers'],
    },
    authority: { source_mutation: false, provider_effect: false, merge: false, deploy: false },
  }));
  const payload = {
    schema: ACK_DISTRIBUTION_SCHEMA,
    baseline_generation: baseline.baseline_generation,
    repository_denominator: baseline.repository_denominator,
    ack_denominator: acks.length,
    delivery_state: 'NOT_DELIVERED',
    acks,
  };
  return { ...payload, ack_set_generation: digest(payload) };
}

export function compileOrgBurnMap(baseline, returns = []) {
  assertBaseline(baseline);
  if (!Array.isArray(returns)) throw new TypeError('returns must be an array');
  const repositoryIds = new Set(baseline.repositories.map(repo => repo.repo_ref));
  const byRepo = new Map();
  for (const returned of returns) {
    if (!returned || !repositoryIds.has(returned.repo_ref)) throw new TypeError('return subject outside baseline');
    if (byRepo.has(returned.repo_ref)) throw new TypeError('duplicate return subject');
    byRepo.set(returned.repo_ref, returned);
  }
  const rows = baseline.repositories.map((repo) => {
    const ret = byRepo.get(repo.repo_ref) || null;
    const bound = !!ret && repo.context_binding_state === 'SUPPLIED_UNVERIFIED' && !!repo.head_sha &&
      ret.baseline_generation === baseline.baseline_generation && ret.repo_head_sha === repo.head_sha &&
      ret.root_ref === repo.root_ref && ret.root_generation === repo.root_generation &&
      ret.baseline_profile_generation === repo.baseline_profile.source_generation;
    const receipts = Array.isArray(ret?.cell_receipts) ? ret.cell_receipts : [];
    const receiptIds = new Set();
    const complete = receipts.length === BASELINE_CELLS.length && receipts.every(receipt => {
      if (!receipt || !BASELINE_CELLS.includes(receipt.cell_id) || receiptIds.has(receipt.cell_id) ||
          typeof receipt.receipt_ref !== 'string' || !receipt.receipt_ref.trim() || receipt.receipt_ref.length > 512) return false;
      receiptIds.add(receipt.cell_id);
      return true;
    });
    return {
      repo_ref: repo.repo_ref,
      classification: repo.classification,
      baseline_profile: repo.baseline_profile,
      root_ref: repo.root_ref,
      root_generation: repo.root_generation,
      baseline_closure_100: false,
      first_blocker: repo.next,
      return_state: !ret ? 'MISSING' : repo.context_binding_state === 'UNKNOWN' || !repo.head_sha ? 'UNKNOWN'
        : !bound ? 'STALE' : !complete ? 'INCOMPLETE' : 'SUPPLIED_UNVERIFIED',
      current_return: false,
      supplied_binding: bound && complete,
      supplied_cell_receipts: receipts.length,
      required_cell_receipts: BASELINE_CELLS.length,
      evidence_state: 'SUPPLIED_UNVERIFIED',
    };
  });
  const payload = {
    schema: BURNMAP_SCHEMA,
    baseline_generation: baseline.baseline_generation,
    repository_denominator: baseline.repository_denominator,
    returns_observed: returns.length,
    current_returns: 0,
    supplied_binding_count: rows.filter(r => r.supplied_binding).length,
    incomplete_returns: rows.filter(r => r.return_state === 'INCOMPLETE').length,
    missing_returns: rows.filter(r => r.return_state === 'MISSING').length,
    stale_returns: rows.filter(r => r.return_state === 'STALE').length,
    unknown_returns: rows.filter(r => r.return_state === 'UNKNOWN').length,
    closure_repositories: 0,
    evidence_state: 'SUPPLIED_UNVERIFIED',
    authority_granted: false,
    provider_effect: false,
    rows,
    hard: ['BURNMAP != AUTHORITY', 'MISSING_RETURN != NO_EFFECT', 'STALE_RETURN != CURRENT', 'REPO_100 != ORG_100', 'SUPPLIED_RETURN != AUTHENTICATED_READBACK'],
  };
  return { ...payload, burnmap_generation: digest(payload) };
}
