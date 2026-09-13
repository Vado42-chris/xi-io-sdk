import crypto from 'node:crypto';
import { BASELINE_SCHEMA, BASELINE_CELLS } from './compiler.mjs';

export const ROOT_MATERIALIZATION_RESOLVERS_SCHEMA = 'xiio.sdk.root-materialization-resolvers/v1';
export const ROOT_MATERIALIZATION_PLAN_SCHEMA = 'xiio.sdk.root-materialization-plan/v1';

const RESOLVERS = new Set(['MACHINE', 'OWNER', 'EXTERNAL', 'TRUE_WAIT', 'UNKNOWN']);
const TERMINAL_DECLARED = new Set(['PASS', 'N_A']);
const UNBOUND = new Set(['UNKNOWN', 'UNBOUND', 'UNVERIFIED', 'UNOBSERVED', 'MISSING', 'NONE', 'NULL', 'N/A', 'NA', 'TBD', 'TODO']);

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

function ref(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 512 &&
    !UNBOUND.has(value.toUpperCase()) ? value : null;
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('/') || value.includes('\\')) return null;
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return value;
}

function assertBaseline(baseline) {
  if (!baseline || baseline.schema !== BASELINE_SCHEMA) throw new TypeError('baseline schema invalid');
  if (!Array.isArray(baseline.repositories) || baseline.repositories.length === 0) throw new TypeError('baseline repositories missing');
  if (baseline.cells_per_repository !== BASELINE_CELLS.length) throw new TypeError('baseline R0-R13 denominator invalid');
  for (const repo of baseline.repositories) {
    if (!Array.isArray(repo.punchcard?.cells) || repo.punchcard.cells.length !== BASELINE_CELLS.length) {
      throw new TypeError(`baseline punchcard invalid for ${repo.repo_ref || 'unknown repo'}`);
    }
  }
}

function normalizeDirective(repoRef, cellId, raw = {}) {
  const resolver = RESOLVERS.has(raw.resolver) ? raw.resolver : 'UNKNOWN';
  const targetPaths = Array.isArray(raw.target_paths) ? raw.target_paths : [];
  if (targetPaths.some((path) => !safeRelativePath(path))) throw new TypeError(`${repoRef}.${cellId}.target_paths contains unsafe path`);
  return {
    cell_id: cellId,
    resolver,
    reason: ref(raw.reason) || 'RESOLVER_REASON_UNBOUND',
    work_ref: ref(raw.work_ref),
    worker_profile_ref: ref(raw.worker_profile_ref),
    writer_ref: ref(raw.writer_ref),
    admission_ref: ref(raw.admission_ref),
    hotfolder_ref: ref(raw.hotfolder_ref),
    detonator_ref: ref(raw.detonator_ref),
    return_target_ref: ref(raw.return_target_ref),
    root_target_ref: ref(raw.root_target_ref),
    target_paths: [...new Set(targetPaths)].sort(),
  };
}

function machineBlockers(directive) {
  const blockers = [];
  for (const [field, code] of [
    ['work_ref', 'WORK_REF_MISSING'],
    ['worker_profile_ref', 'WORKER_PROFILE_REF_MISSING'],
    ['writer_ref', 'WRITER_REF_MISSING'],
    ['admission_ref', 'MUTATION_ADMISSION_REF_MISSING'],
    ['hotfolder_ref', 'HOTFOLDER_REF_MISSING'],
    ['detonator_ref', 'DETONATOR_REF_MISSING'],
    ['return_target_ref', 'RETURN_TARGET_REF_MISSING'],
    ['root_target_ref', 'ROOT_TARGET_REF_MISSING'],
  ]) if (!directive[field]) blockers.push(code);
  if (directive.target_paths.length === 0) blockers.push('TARGET_PATH_DENOMINATOR_MISSING');
  return blockers;
}

function groupKey(directive) {
  return canonical({
    work_ref: directive.work_ref,
    worker_profile_ref: directive.worker_profile_ref,
    writer_ref: directive.writer_ref,
    admission_ref: directive.admission_ref,
    hotfolder_ref: directive.hotfolder_ref,
    detonator_ref: directive.detonator_ref,
    return_target_ref: directive.return_target_ref,
    root_target_ref: directive.root_target_ref,
    target_paths: directive.target_paths,
  });
}

function compileRepoPlan(repo, directives) {
  const missingCells = repo.punchcard.cells.filter((cell) => !TERMINAL_DECLARED.has(cell.declared_state));
  const missingIds = new Set(missingCells.map((cell) => cell.id));
  for (const cellId of Object.keys(directives)) {
    if (!BASELINE_CELLS.includes(cellId)) throw new TypeError(`${repo.repo_ref}.${cellId} is not R0-R13`);
    if (!missingIds.has(cellId)) throw new TypeError(`${repo.repo_ref}.${cellId} is not currently missing`);
  }

  const normalized = missingCells.map((cell) => normalizeDirective(repo.repo_ref, cell.id, directives[cell.id]));
  const groups = new Map();
  const waits = [];
  const unknown = [];

  for (const directive of normalized) {
    if (directive.resolver === 'MACHINE') {
      const key = groupKey(directive);
      const group = groups.get(key) || [];
      group.push(directive);
      groups.set(key, group);
    } else if (['OWNER', 'EXTERNAL', 'TRUE_WAIT'].includes(directive.resolver)) {
      waits.push({
        cell_id: directive.cell_id,
        resolver: directive.resolver,
        reason: directive.reason,
        state: 'WAIT_EXACT_RESOLVER',
      });
    } else {
      unknown.push({
        cell_id: directive.cell_id,
        resolver: 'UNKNOWN',
        reason: directive.reason,
        state: 'RESOLVER_UNBOUND',
      });
    }
  }

  const workerRequests = [...groups.values()].map((group) => {
    const exemplar = group[0];
    const blockers = [...new Set(group.flatMap(machineBlockers))].sort();
    const requestedCells = group.map((entry) => entry.cell_id).sort();
    const requestCore = {
      repo_ref: repo.repo_ref,
      repo_head_sha: repo.head_sha || null,
      root_ref: repo.root_ref || null,
      root_generation: repo.root_generation || null,
      requested_cells: requestedCells,
      work_ref: exemplar.work_ref,
      worker_profile_ref: exemplar.worker_profile_ref,
      writer_ref: exemplar.writer_ref,
      admission_ref: exemplar.admission_ref,
      hotfolder_ref: exemplar.hotfolder_ref,
      detonator_ref: exemplar.detonator_ref,
      return_target_ref: exemplar.return_target_ref,
      root_target_ref: exemplar.root_target_ref,
      target_paths: exemplar.target_paths,
    };
    return {
      schema: 'xiio.sdk.root-materialization-worker-request/v1',
      request_id: `root-materialization:${digest(requestCore).slice('sha256:'.length, 'sha256:'.length + 24)}`,
      ...requestCore,
      state: blockers.length ? 'BLOCKED_BINDING' : 'COMPILED_NOT_DISPATCHED',
      blockers,
      attempt: 0,
      ack_state: 'NOT_DELIVERED',
      authority: {
        source_mutation: false,
        provider_effect: false,
        merge: false,
        deploy: false,
      },
      next: blockers.length
        ? 'BIND_MISSING_CURRENT_REFS_WITHOUT_DISPATCH'
        : 'QUALIFIED_HOST_VERIFIES_CURRENT_ADMISSION_THEN_DELIVERS_TO_IBAL_FORMATION',
    };
  });

  const machineCellCount = workerRequests.reduce((sum, request) => sum + request.requested_cells.length, 0);
  const blockedRequestCount = workerRequests.filter((request) => request.state === 'BLOCKED_BINDING').length;
  let state = 'NO_MISSING_OBLIGATIONS';
  if (missingCells.length > 0) {
    state = unknown.length ? 'RESOLVER_GAPS'
      : blockedRequestCount ? 'MATERIALIZATION_BINDINGS_INCOMPLETE'
        : workerRequests.length ? 'MATERIALIZATION_REQUESTS_COMPILED'
          : 'TRUE_WAIT_ONLY';
  }

  return {
    repo_ref: repo.repo_ref,
    repo_head_sha: repo.head_sha || null,
    root_ref: repo.root_ref || null,
    root_generation: repo.root_generation || null,
    missing_denominator: missingCells.length,
    machine_cell_count: machineCellCount,
    wait_cell_count: waits.length,
    unknown_cell_count: unknown.length,
    worker_requests: workerRequests,
    waits,
    unknowns: unknown,
    state,
  };
}

/**
 * Compile supplied R0-R13 holes into bounded materialization candidates without
 * granting authority or dispatching work. The host must authenticate current
 * baseline/profile/root generations, mutation admission, writer custody, ACK,
 * Attempt, Result, RETURN, APPLY_RETURN and provider/root readback.
 */
export function compileRootMaterializationPlan(baseline, resolvers) {
  assertBaseline(baseline);
  if (!resolvers || resolvers.schema !== ROOT_MATERIALIZATION_RESOLVERS_SCHEMA) {
    throw new TypeError('root materialization resolvers schema invalid');
  }
  if (resolvers.baseline_generation !== baseline.baseline_generation) throw new TypeError('baseline generation mismatch');
  if (resolvers.baseline_profile_generation !== baseline.baseline_profile?.source_generation) {
    throw new TypeError('baseline profile generation mismatch');
  }
  if (!Array.isArray(resolvers.repositories)) throw new TypeError('resolvers.repositories must be an array');

  const repoIndex = new Map(baseline.repositories.map((repo) => [repo.repo_ref, repo]));
  const seen = new Set();
  const directives = new Map();
  for (const row of resolvers.repositories) {
    const repoRef = ref(row?.repo_ref);
    if (!repoRef || !repoIndex.has(repoRef)) throw new TypeError(`resolver repo outside baseline: ${row?.repo_ref || 'UNKNOWN'}`);
    if (seen.has(repoRef)) throw new TypeError(`duplicate resolver repo ${repoRef}`);
    seen.add(repoRef);
    directives.set(repoRef, row.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells : {});
  }

  const repositories = baseline.repositories.map((repo) => compileRepoPlan(repo, directives.get(repo.repo_ref) || {}));
  const workerRequests = repositories.flatMap((repo) => repo.worker_requests);
  const plan = {
    schema: ROOT_MATERIALIZATION_PLAN_SCHEMA,
    baseline_generation: baseline.baseline_generation,
    baseline_profile_generation: baseline.baseline_profile?.source_generation || null,
    repository_denominator: repositories.length,
    missing_cell_denominator: repositories.reduce((sum, repo) => sum + repo.missing_denominator, 0),
    machine_cell_count: repositories.reduce((sum, repo) => sum + repo.machine_cell_count, 0),
    wait_cell_count: repositories.reduce((sum, repo) => sum + repo.wait_cell_count, 0),
    unknown_cell_count: repositories.reduce((sum, repo) => sum + repo.unknown_cell_count, 0),
    worker_request_count: workerRequests.length,
    blocked_request_count: workerRequests.filter((request) => request.state === 'BLOCKED_BINDING').length,
    repositories,
    authority: {
      source_mutation: false,
      provider_effect: false,
      dispatch: false,
      merge: false,
      deploy: false,
    },
    next: workerRequests.length
      ? 'QUALIFIED_HOST_AUTHENTICATES_BINDINGS_AND_DELIVERS_ELIGIBLE_REQUESTS'
      : 'RESOLVE_TRUE_WAITS_OR_UNKNOWN_RESOLVERS',
  };
  return { ...plan, plan_generation: digest(plan) };
}
