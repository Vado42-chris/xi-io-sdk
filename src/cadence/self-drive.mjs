import crypto from 'node:crypto';
import { compileContinuationCycle } from './continuation.mjs';

export const SELF_DRIVE_DIRECTIVE_SCHEMA = 'xiio.sdk.continuation-directive/v1';
export const SELF_DRIVE_LOOP_SCHEMA = 'xiio.sdk.continuation-loop/v1';
export const SELF_DRIVE_PACKET_SCHEMA = 'xiio.sdk.continuation-next-packet/v1';

const CONTINUE_DISPOSITIONS = new Map([
  ['REBASE_REQUIRED', 'REBASE_CURRENT'],
  ['EAT_REQUIRED', 'EAT'],
  ['REAP_REQUIRED', 'REAP'],
  ['CONTINUE_WORK', 'EXECUTE_WORK'],
  ['WAIT_CURRENTNESS', 'RESOLVE_CURRENTNESS'],
  ['WAIT_WORKER_INBOX_BINDING', 'RESOLVE_WORKER_INBOX_BINDING'],
  ['CONTINUE_QUALIFICATION', 'CONTINUE_QUALIFICATION'],
]);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function machineAction(cycle) {
  return CONTINUE_DISPOSITIONS.get(cycle.disposition) ?? null;
}

function allOwnerOnly(backlog) {
  return backlog.length > 0 && backlog.every((item) => item.owner_required);
}

function waitDisposition(cycle, backlog, action) {
  if (cycle.terminal) return { stop_class: 'TERMINAL', yield_allowed: true, action: null, waits: [] };
  if (allOwnerOnly(backlog) && cycle.backlog.runnable.length === 0) {
    return {
      stop_class: 'OWNER_ONLY',
      yield_allowed: true,
      action: null,
      waits: backlog.map(({ id, state: itemState, wake_when }) => ({ id, state: itemState, wake_when })),
    };
  }
  if (action) return { stop_class: 'CONTINUE', yield_allowed: false, action, waits: [] };

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

function nextPacket(cycle, action) {
  const selected = selectedWork(cycle);
  const packet = {
    schema: SELF_DRIVE_PACKET_SCHEMA,
    root_ref: cycle.root_ref,
    agent_ref: cycle.worker_ref,
    subject_generation: cycle.subject_generation,
    current_generation: cycle.current_generation,
    action,
    work_ref: action === 'EXECUTE_WORK' ? selected?.id ?? null : null,
    work_priority: action === 'EXECUTE_WORK' ? selected?.priority ?? null : null,
    phase_event: cycle.phase_event,
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
  const cycle = compileContinuationCycle(input);
  const backlog = sourceBacklog(input);
  const heartbeatCount = ownerHeartbeatCount(input);
  const initialAction = allOwnerOnly(backlog) ? null : machineAction(cycle);
  const stop = waitDisposition(cycle, backlog, initialAction);
  const continueWithoutOwner = stop.stop_class === 'CONTINUE';
  const ownerHeartbeatBug = continueWithoutOwner && heartbeatCount > 0;
  const packet = continueWithoutOwner ? nextPacket(cycle, stop.action) : null;

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
    status: ownerHeartbeatBug ? 'FAIL_CURRENT' : 'CURRENT',
    bug: ownerHeartbeatBug ? 'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT' : null,
    waits: stop.waits,
    next_packet: packet,
    cycle,
    hard: [
      'REPORT != LOOP_EXIT',
      'RESULT != LOOP_EXIT',
      'WAIT_ONE_CELL != ROOT_STOP',
      'BLOCKED_PROVIDER != ROOT_STOP',
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG',
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

    if (directive.owner_heartbeat_bug) {
      stop = directive;
      break;
    }
    if (directive.yield_allowed) stop = directive;
  }

  const last = directives.at(-1);
  const awaitingHostAction = !stop && last?.continue_without_owner === true;
  const loopState = last?.owner_heartbeat_bug
    ? 'FAIL_CURRENT'
    : stop
      ? stop.stop_class
      : 'HOST_CONTINUE_REQUIRED';

  return {
    schema: SELF_DRIVE_LOOP_SCHEMA,
    root_ref: rootRef,
    agent_ref: agentRef,
    iterations: directives.length,
    loop_state: loopState,
    terminal: loopState === 'TERMINAL',
    yield_allowed: Boolean(stop?.yield_allowed) && !last?.owner_heartbeat_bug,
    awaiting_host_action: awaitingHostAction,
    owner_heartbeat_bug: directives.some((directive) => directive.owner_heartbeat_bug),
    next_packet: awaitingHostAction ? last.next_packet : null,
    directives,
    stop_contract: ['TRUE_WAIT', 'OWNER_ONLY', 'TERMINAL'],
    effects: 0,
    effect_ceiling: 'PROJECTION_ONLY',
  };
}
