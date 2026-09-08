import crypto from 'node:crypto';

export const BASELINE_SCHEMA = 'xiio.sdk.portfolio-baseline/v1';
export const ACK_DISTRIBUTION_SCHEMA = 'xiio.sdk.distributed-ack-set/v1';
export const BURNMAP_SCHEMA = 'xiio.sdk.org-burnmap/v1';

export const BASELINE_CELLS = Object.freeze([
  'REGISTRATION',
  'INTEGRATION',
  'HYDRATION',
  'WORKER_CAPABILITY',
  'MAIN_STATUS',
  'BRANCH_STEW',
  'ACK_CURRENTNESS',
  'RETURN_READBACK',
]);

const STATES = new Set(['PASS', 'PARTIAL', 'BLOCKED', 'UNKNOWN', 'N_A']);

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
  if (repo.branch_census_state !== 'COMPLETE') return { state: 'UNKNOWN', reason: 'BRANCH_CENSUS_UNKNOWN' };
  const branches = Array.isArray(repo.branches) ? repo.branches : [];
  const nonDefault = branches.filter((b) => b?.name && b.name !== repo.default_branch);
  const undispositioned = nonDefault.filter((b) => !['KEEP', 'ACTIVE', 'MERGED', 'RETIRE_CANDIDATE', 'DONOR', 'HOLD'].includes(b.disposition));
  if (undispositioned.length > 0) return { state: 'BLOCKED', reason: 'UNDISPOSITIONED_BRANCH_STEW', count: undispositioned.length };
  if (nonDefault.length > 0) return { state: 'PARTIAL', reason: 'BRANCHES_PRESENT_DISPOSITIONED', count: nonDefault.length };
  return { state: 'PASS', reason: 'NO_NONDEFAULT_BRANCH_STEW', count: 0 };
}

function cell(id, value, reason, evidence = []) {
  return { id, state: state(value), reason, evidence_refs: [...new Set((evidence || []).filter(Boolean))].sort() };
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

function compileRepo(repo) {
  const repoRef = requiredString(repo.repo_ref, 'repo_ref');
  const defaultBranch = requiredString(repo.default_branch || 'main', `${repoRef}.default_branch`);
  const head = typeof repo.head_sha === 'string' && repo.head_sha.trim() ? repo.head_sha.trim() : null;
  const managedManifest = observedBool(repo.managed_manifest_current);
  const hydration = observedBool(repo.hydration_current);
  const workerProjection = observedBool(repo.worker_capability_current);
  const ackCurrent = observedBool(repo.ack_current);
  const returnCurrent = observedBool(repo.return_readback_current);
  const sdkCli = observedBool(repo.sdk_cli_adopted);
  const b = branchState(repo);

  const integration = pairState(
    managedManifest,
    sdkCli,
    'MANAGED_AND_SDK_CLI_ADOPTED',
    'MANAGED_MANIFEST_MISSING',
    'SDK_CLI_MISSING',
    'MANAGED_INTEGRATION_MISSING',
  );

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

  const counts = Object.fromEntries(['PASS', 'PARTIAL', 'BLOCKED', 'UNKNOWN', 'N_A'].map((s) => [s, cells.filter((c) => c.state === s).length]));
  const firstRed = cells.find((c) => c.state !== 'PASS' && c.state !== 'N_A') || null;
  return {
    repo_ref: repoRef,
    visibility: repo.visibility || 'UNKNOWN',
    default_branch: defaultBranch,
    head_sha: head,
    sdk_cli_adopted: sdkCli,
    classification: repo.classification || 'UNCLASSIFIED',
    punchcard: {
      denominator: BASELINE_CELLS.length,
      counts,
      cells,
      accounting_100: cells.length === BASELINE_CELLS.length,
      closure_100: cells.every((c) => c.state === 'PASS' || c.state === 'N_A'),
    },
    next: firstRed ? { cell: firstRed.id, reason: firstRed.reason } : null,
  };
}

export function compilePortfolioBaseline(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('snapshot must be an object');
  if (!Array.isArray(snapshot.repositories) || snapshot.repositories.length === 0) throw new TypeError('snapshot.repositories must be non-empty');
  const seen = new Set();
  const repos = snapshot.repositories.map((repo) => {
    const compiled = compileRepo(repo);
    if (seen.has(compiled.repo_ref)) throw new TypeError(`duplicate repo_ref ${compiled.repo_ref}`);
    seen.add(compiled.repo_ref);
    return compiled;
  }).sort((a, b) => a.repo_ref.localeCompare(b.repo_ref));
  const cellDenominator = repos.length * BASELINE_CELLS.length;
  const stateCounts = Object.fromEntries(['PASS', 'PARTIAL', 'BLOCKED', 'UNKNOWN', 'N_A'].map((s) => [s, repos.reduce((n, r) => n + r.punchcard.counts[s], 0)]));
  const payload = {
    schema: BASELINE_SCHEMA,
    source_generation: requiredString(snapshot.source_generation, 'source_generation'),
    observed_at: requiredString(snapshot.observed_at, 'observed_at'),
    repository_denominator: repos.length,
    cells_per_repository: BASELINE_CELLS.length,
    cell_denominator: cellDenominator,
    state_counts: stateCounts,
    repository_accounting_100: repos.length === snapshot.repositories.length,
    org_closure_100: repos.every((r) => r.punchcard.closure_100),
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
    ],
  };
  return { ...payload, baseline_generation: digest(payload) };
}

export function compileDistributedAcks(baseline) {
  if (!baseline || baseline.schema !== BASELINE_SCHEMA) throw new TypeError('baseline schema invalid');
  const acks = baseline.repositories.map((repo) => ({
    schema: 'xiio.sdk.distributed-ack/v1',
    repo_ref: repo.repo_ref,
    baseline_generation: baseline.baseline_generation,
    repo_head_sha: repo.head_sha,
    classification: repo.classification,
    current_punchcard: repo.punchcard,
    next: repo.next,
    requested_return: {
      schema: 'xiio.sdk.distributed-return/v1',
      required_cells: BASELINE_CELLS,
      return_fields: ['repo_ref', 'repo_head_sha', 'baseline_generation', 'cell_receipts', 'next', 'blockers'],
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
  if (!baseline || baseline.schema !== BASELINE_SCHEMA) throw new TypeError('baseline schema invalid');
  if (!Array.isArray(returns)) throw new TypeError('returns must be an array');
  const byRepo = new Map(returns.filter(Boolean).map((r) => [r.repo_ref, r]));
  const rows = baseline.repositories.map((repo) => {
    const ret = byRepo.get(repo.repo_ref) || null;
    const returnCurrent = !!ret && ret.baseline_generation === baseline.baseline_generation && ret.repo_head_sha === repo.head_sha;
    return {
      repo_ref: repo.repo_ref,
      classification: repo.classification,
      baseline_closure_100: repo.punchcard.closure_100,
      first_blocker: repo.next,
      return_state: ret ? (returnCurrent ? 'CURRENT' : 'STALE') : 'MISSING',
      current_return: returnCurrent,
    };
  });
  const payload = {
    schema: BURNMAP_SCHEMA,
    baseline_generation: baseline.baseline_generation,
    repository_denominator: baseline.repository_denominator,
    returns_observed: returns.length,
    current_returns: rows.filter((r) => r.current_return).length,
    missing_returns: rows.filter((r) => r.return_state === 'MISSING').length,
    stale_returns: rows.filter((r) => r.return_state === 'STALE').length,
    closure_repositories: rows.filter((r) => r.baseline_closure_100).length,
    rows,
    hard: ['BURNMAP != AUTHORITY', 'MISSING_RETURN != NO_EFFECT', 'STALE_RETURN != CURRENT', 'REPO_100 != ORG_100'],
  };
  return { ...payload, burnmap_generation: digest(payload) };
}
