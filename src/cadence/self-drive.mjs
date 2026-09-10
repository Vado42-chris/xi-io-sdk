import crypto from 'node:crypto';
import { compileContinuationCycle } from './continuation.mjs';

export const SELF_DRIVE_DIRECTIVE_SCHEMA = 'xiio.sdk.continuation-directive/v1';
export const SELF_DRIVE_LOOP_SCHEMA = 'xiio.sdk.continuation-loop/v1';
export const SELF_DRIVE_PACKET_SCHEMA = 'xiio.sdk.continuation-next-packet/v1';
export const REJOIN_SEAM_SCHEMA = 'xiio.sdk.rejoin-seams/v1';

const CONTINUE_DISPOSITIONS = new Map([
  ['REBASE_REQUIRED', 'REBASE_CURRENT'],
  ['EAT_REQUIRED', 'EAT'],
  ['REAP_REQUIRED', 'REAP'],
  ['CONTINUE_WORK', 'EXECUTE_WORK'],
  ['WAIT_CURRENTNESS', 'RESOLVE_CURRENTNESS'],
  ['WAIT_WORKER_INBOX_BINDING', 'RESOLVE_WORKER_INBOX_BINDING'],
  ['CONTINUE_QUALIFICATION', 'CONTINUE_QUALIFICATION'],
]);
const EFFECT_STATES = new Set([
  'NO_EFFECT_REPORTED',
  'FAILED_NO_EFFECT',
  'VERIFIED_NO_EFFECT',
  'VERIFIED_EFFECT',
  'EFFECT_UNKNOWN',
  'PARTIAL_EFFECT_UNKNOWN',
]);
const RECONCILE_EFFECT_STATES = new Set(['EFFECT_UNKNOWN', 'PARTIAL_EFFECT_UNKNOWN']);
const RESOLVER_STATES = new Set(['WAIT', 'TRUE_WAIT', 'BLOCKED', 'UNKNOWN']);
const SEAM_STATES = new Set([
  'OPEN',
  'WAIT',
  'TRUE_WAIT',
  'BLOCKED',
  'READBACK_VERIFIED',
  'RETURN_READY',
  'APPLIED',
  'CONSUMED',
]);
const REJOIN_ACTION_RANK = new Map([
  ['VERIFY_SEAM_RECEIPT', 0],
  ['COMPILE_RETURN', 1],
  ['APPLY_RETURN', 2],
  ['VERIFY_CONSUMER_READBACK', 3],
  ['RESOLVE_SEAM', 4],
]);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function opaque(value) {
  return typeof value === 'string' && value.trim() && value.length <= 512 ? value : null;
}

function state(value) {
  return clean(value)?.toUpperCase() ?? 'UNKNOWN';
}

function rows(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function ownerHeartbeatCount(input) {
  const value = input.owner_heartbeat_count ?? 0;
  if (!Number.isInteger(value) || value < 0) throw new Error('OWNER_HEARTBEAT_COUNT_INVALID');
  return value;
}

function effectReconciliation(input) {
  const reported = clean(input.effect_state)?.toUpperCase() ?? 'NO_EFFECT_REPORTED';
  if (!EFFECT_STATES.has(reported)) throw new Error('EFFECT_STATE_INVALID');
  const explicit = input.reconciliation_required === true;
  const required = explicit || RECONCILE_EFFECT_STATES.has(reported);
  return {
    effect_state: reported,
    reconciliation_state: required ? 'RECONCILE_REQUIRED' : 'NOT_REQUIRED',
    reconciliation_required: required,
    destructive_follow_on_allowed: !required,
  };
}

function sourceBacklog(input) {
  return rows(input.backlog).map((item) => ({
    id: clean(item.id) ?? clean(item.work_ref) ?? 'UNKNOWN_WORK',
    state: state(item.state),
    priority: Number.isFinite(item.priority) ? item.priority : null,
    wake_when: clean(item.wake_when),
    owner_required: item.owner_required === true || ['OWNER_ONLY', 'OWNER_REQUIRED'].includes(state(item.state)),
    machine_resolvable: item.machine_resolvable === true,
  }));
}

function selectedWork(cycle) {
  return cycle.backlog.runnable[0] ?? null;
}

function sortTargets(items) {
  return [...items].sort((a, b) =>
    (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id, 'en'));
}

function resolverTarget(backlog, action) {
  if (action === 'RESOLVE_BLOCKER') {
    return sortTargets(backlog.filter((item) => item.machine_resolvable && !item.owner_required && RESOLVER_STATES.has(item.state)))[0] ?? null;
  }
  if (action === 'RESOLVE_CURRENTNESS') {
    return sortTargets(backlog.filter((item) => !item.owner_required && item.state === 'UNKNOWN'))[0] ?? null;
  }
  return null;
}

function machineAction(cycle) {
  return CONTINUE_DISPOSITIONS.get(cycle.disposition) ?? null;
}

function allOwnerOnly(backlog) {
  return backlog.length > 0 && backlog.every((item) => item.owner_required);
}

function seamInputRows(input) {
  return rows(input.seams).map((item, index) => {
    const seamRef = opaque(item.seam_ref ?? item.id);
    const kind = clean(item.kind)?.toUpperCase();
    const seamState = state(item.state);
    if (!seamRef || !kind || !SEAM_STATES.has(seamState)) throw new Error(`REJOIN_SEAM_INVALID:${index}`);
    const wakeReceiptRef = item.wake_receipt_ref === undefined || item.wake_receipt_ref === null
      ? null
      : opaque(item.wake_receipt_ref);
    if ((item.wake_receipt_ref !== undefined && item.wake_receipt_ref !== null) && !wakeReceiptRef) {
      throw new Error(`REJOIN_WAKE_RECEIPT_INVALID:${index}`);
    }
    return {
      seam_ref: seamRef,
      kind,
      state: seamState,
      wake_receipt_ref: wakeReceiptRef,
      priority: Number.isFinite(item.priority) ? item.priority : null,
      machine_resolvable: item.machine_resolvable === true,
      owner_required: item.owner_required === true,
    };
  });
}

function receiptInputRows(input) {
  return rows(input.seam_receipts).map((item, index) => {
    const receiptRef = opaque(item.receipt_ref);
    const seamRef = opaque(item.seam_ref);
    const rootRef = opaque(item.root_ref);
    const subjectGeneration = opaque(item.subject_generation);
    const currentGeneration = opaque(item.current_generation);
    if (!receiptRef || !seamRef || !rootRef || !subjectGeneration || !currentGeneration) {
      throw new Error(`REJOIN_RECEIPT_INVALID:${index}`);
    }
    const returnRef = item.return_ref === undefined || item.return_ref === null ? null : opaque(item.return_ref);
    if ((item.return_ref !== undefined && item.return_ref !== null) && !returnRef) {
      throw new Error(`REJOIN_RETURN_REF_INVALID:${index}`);
    }
    return {
      receipt_ref: receiptRef,
      seam_ref: seamRef,
      root_ref: rootRef,
      subject_generation: subjectGeneration,
      current_generation: currentGeneration,
      authenticated: item.authenticated === true,
      verified: item.verified === true,
      provider_readback: item.provider_readback === true,
      return_ref: returnRef,
      return_applied: item.return_applied === true,
      consumer_readback: item.consumer_readback === true,
    };
  });
}

export function compileRejoinSeams(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const rootRef = opaque(input.root_ref);
  const subjectGeneration = opaque(input.subject_generation);
  const currentGeneration = opaque(input.current_generation);
  if (!rootRef || !subjectGeneration || !currentGeneration) throw new Error('REJOIN_IDENTITY_REQUIRED');

  const seams = seamInputRows(input);
  const receipts = receiptInputRows(input);
  const resolved = [];
  const pending = [];
  let repairedStaleWaitCount = 0;

  for (const seam of seams) {
    const candidates = receipts.filter((receipt) =>
      receipt.seam_ref === seam.seam_ref
        && (!seam.wake_receipt_ref || receipt.receipt_ref === seam.wake_receipt_ref));
    const exact = candidates.find((receipt) =>
      receipt.root_ref === rootRef
        && receipt.subject_generation === subjectGeneration
        && receipt.current_generation === currentGeneration) ?? null;
    const qualified = Boolean(exact && exact.authenticated && exact.verified && exact.provider_readback);

    let disposition = 'UNRESOLVED';
    let nextAction = null;
    let wakeSatisfied = false;

    if (exact && !qualified) {
      nextAction = 'VERIFY_SEAM_RECEIPT';
      disposition = 'RECEIPT_PRESENT_UNQUALIFIED';
    } else if (qualified) {
      wakeSatisfied = true;
      if (['WAIT', 'TRUE_WAIT', 'BLOCKED'].includes(seam.state)) repairedStaleWaitCount += 1;
      if (!exact.return_ref) {
        nextAction = 'COMPILE_RETURN';
        disposition = 'READBACK_VERIFIED_RETURN_MISSING';
      } else if (!exact.return_applied) {
        nextAction = 'APPLY_RETURN';
        disposition = 'RETURN_READY_NOT_APPLIED';
      } else if (!exact.consumer_readback) {
        nextAction = 'VERIFY_CONSUMER_READBACK';
        disposition = 'RETURN_APPLIED_READBACK_MISSING';
      } else {
        disposition = 'CONSUMED_CURRENT';
      }
    } else if (seam.machine_resolvable && !seam.owner_required) {
      nextAction = 'RESOLVE_SEAM';
      disposition = 'MACHINE_RESOLVABLE_NO_CURRENT_RECEIPT';
    } else if (seam.owner_required) {
      disposition = 'OWNER_ONLY';
    } else {
      disposition = 'EXTERNAL_WAIT';
    }

    const row = {
      ...seam,
      wake_satisfied: wakeSatisfied,
      receipt_ref: exact?.receipt_ref ?? null,
      return_ref: exact?.return_ref ?? null,
      disposition,
      next_action: nextAction,
    };
    resolved.push(row);
    if (nextAction) pending.push({ ...row, action: nextAction });
  }

  pending.sort((a, b) =>
    (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      || (REJOIN_ACTION_RANK.get(a.action) ?? 99) - (REJOIN_ACTION_RANK.get(b.action) ?? 99)
      || a.seam_ref.localeCompare(b.seam_ref, 'en'));
  const next = pending[0] ?? null;

  return Object.freeze({
    schema: REJOIN_SEAM_SCHEMA,
    root_ref: rootRef,
    subject_generation: subjectGeneration,
    current_generation: currentGeneration,
    seam_count: seams.length,
    receipt_count: receipts.length,
    repaired_stale_wait_count: repairedStaleWaitCount,
    satisfied_seam_refs: resolved.filter((row) => row.wake_satisfied).map((row) => row.seam_ref),
    current_seam_refs: resolved.filter((row) => row.disposition === 'CONSUMED_CURRENT').map((row) => row.seam_ref),
    unresolved_seam_refs: resolved.filter((row) => !row.wake_satisfied).map((row) => row.seam_ref),
    pending_actions: pending.map((row) => ({
      action: row.action,
      seam_ref: row.seam_ref,
      receipt_ref: row.receipt_ref,
      return_ref: row.return_ref,
      priority: row.priority,
    })),
    next_action: next ? {
      action: next.action,
      seam_ref: next.seam_ref,
      receipt_ref: next.receipt_ref,
      return_ref: next.return_ref,
    } : null,
    seams: resolved,
    evidence_state: 'SUPPLIED_QUALIFICATION_INPUT',
    authority_granted: false,
    provider_effect: false,
    effect_ceiling: 'PROJECTION_ONLY',
    hard: [
      'PROVIDER_RECEIPT != CANONICAL_IDENTITY',
      'SUPPLIED_RECEIPT != AUTHENTICATION',
      'READBACK_VERIFIED != RETURN',
      'RETURN != APPLY_RETURN',
      'APPLY_RETURN != CONSUMER_READBACK',
      'VERIFIED_WAKE_RECEIPT -> WAIT_INVALIDATED',
      'A2A_MCP_ACK_SEAM != EFFECT_AUTHORITY',
    ],
  });
}

function applySatisfiedSeams(input, rejoin) {
  if (!rejoin.satisfied_seam_refs.length) return input;
  const satisfied = new Set(rejoin.satisfied_seam_refs);
  return {
    ...input,
    backlog: rows(input.backlog).map((item) => {
      const id = clean(item.id) ?? clean(item.work_ref);
      return id && satisfied.has(id) ? { ...item, state: 'DONE' } : item;
    }),
  };
}

function waitDisposition(cycle, backlog, action) {
  // A rejoin/return action is unfinished work and must outrank a terminal-looking
  // child projection. This prevents a verified readback from being swallowed by
  // a stale TRUE_WAIT or a four-scale terminal classification.
  if (action) return { stop_class: 'CONTINUE', yield_allowed: false, action, waits: [] };
  if (cycle.terminal) return { stop_class: 'TERMINAL', yield_allowed: true, action: null, waits: [] };
  if (allOwnerOnly(backlog) && cycle.backlog.runnable.length === 0) {
    return {
      stop_class: 'OWNER_ONLY',
      yield_allowed: true,
      action: null,
      waits: backlog.map(({ id, state: itemState, wake_when }) => ({ id, state: itemState, wake_when })),
    };
  }

  const unresolved = backlog.filter((item) => ['WAIT', 'TRUE_WAIT', 'BLOCKED', 'OWNER_ONLY', 'OWNER_REQUIRED'].includes(item.state));
  const ownerRows = unresolved.filter((item) => item.owner_required);
  const machineRows = unresolved.filter((item) => item.machine_resolvable);
  const nonOwnerRows = unresolved.filter((item) => !item.owner_required);

  if (machineRows.length > 0) {
    return { stop_class: 'CONTINUE', yield_allowed: false, action: 'RESOLVE_BLOCKER', waits: [] };
  }

  if (ownerRows.length > 0 && nonOwnerRows.length === 0) {
    return {
      stop_class: 'OWNER_ONLY',
      yield_allowed: true,
      action: null,
      waits: ownerRows.map(({ id, state: itemState, wake_when }) => ({ id, state: itemState, wake_when })),
    };
  }

  if (cycle.disposition === 'WAIT_TRUE_GATE') {
    const exact = unresolved.length > 0 && unresolved.every((item) => item.wake_when && !item.owner_required && !item.machine_resolvable);
    if (exact) {
      return {
        stop_class: 'TRUE_WAIT',
        yield_allowed: true,
        action: null,
        waits: unresolved.map(({ id, state: itemState, wake_when }) => ({ id, state: itemState, wake_when })),
      };
    }
    return { stop_class: 'CONTINUE', yield_allowed: false, action: 'RESOLVE_BLOCKER', waits: [] };
  }

  return { stop_class: 'CONTINUE', yield_allowed: false, action: 'RECOMPUTE_FRONTIER', waits: [] };
}

function nextPacket(cycle, backlog, action, reconciliation, rejoin) {
  const selected = selectedWork(cycle);
  const resolver = resolverTarget(backlog, action);
  const seamTarget = rejoin.next_action && rejoin.next_action.action === action ? rejoin.next_action : null;
  const target = action === 'EXECUTE_WORK' ? selected : resolver;
  const reconciling = action === 'RECONCILE_EFFECT';
  const seamReconciling = ['VERIFY_SEAM_RECEIPT', 'VERIFY_CONSUMER_READBACK', 'RESOLVE_SEAM'].includes(action);
  const pureReturn = action === 'COMPILE_RETURN';
  const applyReturn = action === 'APPLY_RETURN';
  const packet = {
    schema: SELF_DRIVE_PACKET_SCHEMA,
    root_ref: cycle.root_ref,
    agent_ref: cycle.worker_ref,
    subject_generation: cycle.subject_generation,
    current_generation: cycle.current_generation,
    action,
    work_ref: target?.id ?? null,
    work_priority: target?.priority ?? null,
    resolver_target_state: resolver?.state ?? null,
    seam_ref: seamTarget?.seam_ref ?? null,
    receipt_ref: seamTarget?.receipt_ref ?? null,
    return_ref: seamTarget?.return_ref ?? null,
    phase_event: cycle.phase_event,
    effect_state: reconciliation.effect_state,
    reconciliation_state: reconciliation.reconciliation_state,
    reconciliation_required: reconciliation.reconciliation_required,
    destructive_follow_on_allowed: reconciliation.destructive_follow_on_allowed,
    allowed_operation_classes: reconciling || seamReconciling
      ? ['READ_ONLY_RECONCILIATION']
      : pureReturn
        ? ['PURE_RETURN_COMPILATION']
        : applyReturn
          ? ['QUALIFIED_RETURN_APPLICATION']
          : ['QUALIFIED_BY_HOST_AND_EFFECT_OWNER'],
    return_required: true,
    apply_return_required: true,
    reap_then_reread_required: true,
    owner_ingress_required: false,
    effect_ceiling: 'PROJECTION_ONLY',
    provider_effect: false,
  };
  return Object.freeze({ ...packet, resume_cursor: `cursor:${digest(packet).slice(0, 24)}` });
}

export function compileContinuationDirective(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const rejoin = compileRejoinSeams(input);
  const effectiveInput = applySatisfiedSeams(input, rejoin);
  const cycle = compileContinuationCycle(effectiveInput);
  const backlog = sourceBacklog(effectiveInput);
  const heartbeatCount = ownerHeartbeatCount(input);
  const reconciliation = effectReconciliation(input);
  const rejoinAction = rejoin.next_action?.action ?? null;
  const initialAction = reconciliation.reconciliation_required
    ? 'RECONCILE_EFFECT'
    : rejoinAction ?? (allOwnerOnly(backlog) ? null : machineAction(cycle));
  const stop = waitDisposition(cycle, backlog, initialAction);
  const continueWithoutOwner = stop.stop_class === 'CONTINUE';
  const ownerHeartbeatBug = continueWithoutOwner && heartbeatCount > 0;
  const effectReconciliationBug = reconciliation.reconciliation_required;
  const outstandingRejoinBug = rejoin.repaired_stale_wait_count > 0 && rejoin.next_action !== null;
  const bugs = [
    ...(ownerHeartbeatBug ? ['OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT'] : []),
    ...(effectReconciliationBug ? ['EFFECT_UNKNOWN_REQUIRES_RECONCILIATION'] : []),
    ...(outstandingRejoinBug ? ['STALE_WAIT_AFTER_VERIFIED_RECEIPT'] : []),
  ];
  const packet = continueWithoutOwner ? nextPacket(cycle, backlog, stop.action, reconciliation, rejoin) : null;

  return {
    schema: SELF_DRIVE_DIRECTIVE_SCHEMA,
    root_ref: cycle.root_ref,
    agent_ref: cycle.worker_ref,
    subject_generation: cycle.subject_generation,
    current_generation: cycle.current_generation,
    cycle_disposition: cycle.disposition,
    cycle_reason: cycle.reason,
    stop_class: stop.stop_class,
    yield_allowed: stop.yield_allowed,
    continue_without_owner: continueWithoutOwner,
    owner_heartbeat_count: heartbeatCount,
    owner_heartbeat_bug: ownerHeartbeatBug,
    effect_state: reconciliation.effect_state,
    reconciliation_state: reconciliation.reconciliation_state,
    reconciliation_required: reconciliation.reconciliation_required,
    destructive_follow_on_allowed: reconciliation.destructive_follow_on_allowed,
    rejoin,
    status: bugs.length > 0 ? 'FAIL_CURRENT' : 'CURRENT',
    bug: bugs[0] ?? null,
    bugs,
    waits: stop.waits,
    next_packet: packet,
    cycle,
    hard: [
      'REPORT != LOOP_EXIT',
      'RESULT != LOOP_EXIT',
      'WAIT_ONE_CELL != ROOT_STOP',
      'BLOCKED_PROVIDER != ROOT_STOP',
      'MACHINE_RESOLVABLE_BLOCKER -> EXACT_NEXT_PACKET_TARGET',
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG',
      'HEARTBEAT_BUG != STOP_WHILE_NEXT_PACKET_EXISTS',
      'COMMAND_FAILURE != NO_EFFECT',
      'PARTIAL_EFFECT_UNKNOWN -> RECONCILE_REQUIRED',
      'RECONCILE_REQUIRED -> NO_DESTRUCTIVE_FOLLOW_ON',
      'RECONCILE_REQUIRED != ROOT_STOP',
      'VERIFIED_SEAM_RECEIPT -> REJOIN_BEFORE_WAIT',
      'ACK_A2A_MCP_REJOIN -> REFRESH_CURRENTNESS',
      'SDK_LOOP_DIRECTIVE != EFFECT_AUTHORITY',
      'SDK_LOOP_DIRECTIVE != PROVIDER_EXECUTION',
    ],
  };
}

export function compileContinuationLoop(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.cycles) || input.cycles.length === 0) {
    throw new Error('CONTINUATION_LOOP_CYCLES_REQUIRED');
  }

  const maxIterations = input.max_iterations ?? 100;
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10_000) throw new Error('CONTINUATION_LOOP_MAX_INVALID');
  if (input.cycles.length > maxIterations) throw new Error('CONTINUATION_LOOP_MAX_EXCEEDED');

  const directives = [];
  let rootRef = null;
  let agentRef = null;
  let stop = null;

  for (let index = 0; index < input.cycles.length; index += 1) {
    if (stop) throw new Error(`CONTINUATION_LOOP_EVENT_AFTER_STOP:${stop.stop_class}`);
    const directive = compileContinuationDirective(input.cycles[index]);
    rootRef ??= directive.root_ref;
    agentRef ??= directive.agent_ref;
    if (directive.root_ref !== rootRef) throw new Error('CONTINUATION_LOOP_ROOT_CHANGED');
    if (directive.agent_ref !== agentRef) throw new Error('CONTINUATION_LOOP_AGENT_CHANGED');
    directives.push({ iteration: index + 1, ...directive });

    if (directive.yield_allowed) stop = directive;
  }

  const last = directives.at(-1);
  const ownerHeartbeatBug = directives.some((directive) => directive.owner_heartbeat_bug);
  const reconciliationRequired = directives.some((directive) => directive.reconciliation_required);
  const awaitingHostAction = !stop && last?.continue_without_owner === true;
  const loopState = stop ? stop.stop_class : 'HOST_CONTINUE_REQUIRED';
  const bugs = [...new Set(directives.flatMap((directive) => directive.bugs ?? []))];

  return {
    schema: SELF_DRIVE_LOOP_SCHEMA,
    root_ref: rootRef,
    agent_ref: agentRef,
    iterations: directives.length,
    status: bugs.length > 0 ? 'FAIL_CURRENT' : 'CURRENT',
    loop_state: loopState,
    terminal: loopState === 'TERMINAL',
    yield_allowed: Boolean(stop?.yield_allowed),
    awaiting_host_action: awaitingHostAction,
    owner_heartbeat_bug: ownerHeartbeatBug,
    reconciliation_required: reconciliationRequired,
    destructive_follow_on_allowed: last?.destructive_follow_on_allowed ?? true,
    bugs,
    next_packet: awaitingHostAction ? last.next_packet : null,
    directives,
    stop_contract: ['TRUE_WAIT', 'OWNER_ONLY', 'TERMINAL'],
    effects: 0,
    effect_ceiling: 'PROJECTION_ONLY',
  };
}
