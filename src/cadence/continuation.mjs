const PASS_STATES = new Set(['100', 'PASS', 'CURRENT', 'N_A_WITH_EVIDENCE']);
const REQUIRED_SCALES = ['MICRO', 'MESO', 'MACRO', 'META'];
const REAP_CLASSES = new Set([
  'STALE_CURRENT',
  'COMPLETED_BLOCKER_ATTACHED',
  'PROSE_ONLY_DEPENDENCY',
  'STALE_CUSTODY',
  'ORPHANED_NEXT',
  'DUPLICATE_OWNER_CANDIDATE',
  'RETIRED_LINEAGE_STILL_CURRENT',
  'UNKNOWN_DEPENDENCY_TARGET',
  'SECURITY_SMOKE',
]);
const PHASE_EVENTS = new Set([
  'PRE_ENTRY',
  'POST_RESULT',
  'POST_EFFECT_READBACK',
  'BOUNDARY_PROMOTION',
  'DEADMAN',
  'FIXED_POINT',
]);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rows(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function state(value) {
  return clean(value)?.toUpperCase() ?? 'UNKNOWN';
}

function allScalesCurrent(fourScale) {
  if (!fourScale || typeof fourScale !== 'object') return false;
  return REQUIRED_SCALES.every((key) => PASS_STATES.has(state(fourScale[key])));
}

function classifyBacklog(backlog) {
  const out = { runnable: [], blocked: [], wait: [], unknown: [], done: [] };
  for (const item of rows(backlog)) {
    const id = clean(item.id) ?? clean(item.work_ref) ?? 'UNKNOWN_WORK';
    const entry = { id, priority: Number.isFinite(item.priority) ? item.priority : null };
    switch (state(item.state)) {
      case 'RUNNABLE':
      case 'ACTIVE_ELIGIBLE':
        out.runnable.push(entry);
        break;
      case 'BLOCKED':
        out.blocked.push(entry);
        break;
      case 'WAIT':
      case 'TRUE_WAIT':
        out.wait.push(entry);
        break;
      case 'DONE':
      case 'RETIRED':
        out.done.push(entry);
        break;
      default:
        out.unknown.push(entry);
    }
  }
  out.runnable.sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id, 'en'));
  return out;
}

function classifyReturns(returnRows) {
  const out = { results: [], returned: [], applied: [], stranded: [], unknown: [] };
  for (const item of rows(returnRows)) {
    const id = clean(item.id) ?? clean(item.result_ref) ?? clean(item.return_ref) ?? 'UNKNOWN_RETURN';
    const s = state(item.state);
    if (s === 'RESULT') {
      out.results.push(id);
      if (item.returned !== true) out.stranded.push(id);
    } else if (s === 'RETURN') {
      out.returned.push(id);
      if (item.applied !== true) out.stranded.push(id);
    } else if (s === 'APPLY_RETURN') {
      out.applied.push(id);
    } else {
      out.unknown.push(id);
    }
  }
  return out;
}

function classifyResidue(residue) {
  const findings = [];
  const unknown = [];
  for (const item of rows(residue)) {
    const id = clean(item.id) ?? 'UNKNOWN_RESIDUE';
    const klass = state(item.class);
    if (REAP_CLASSES.has(klass)) findings.push({ id, class: klass });
    else unknown.push({ id, class: klass });
  }
  return { findings, unknown };
}

function classifyOccurrences(occurrences) {
  const unconsumed = [];
  const consumed = [];
  for (const item of rows(occurrences)) {
    const id = clean(item.id) ?? clean(item.occurrence_ref) ?? 'UNKNOWN_OCCURRENCE';
    if (item.consumed === true) consumed.push(id);
    else unconsumed.push(id);
  }
  return { unconsumed, consumed };
}

export function compileContinuationCycle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const rootRef = clean(input.root_ref);
  const workerRef = clean(input.worker_ref);
  const subjectGeneration = clean(input.subject_generation);
  const currentGeneration = clean(input.current_generation);
  const phaseEvent = state(input.phase_event);
  if (!rootRef || !workerRef || !subjectGeneration || !currentGeneration || !PHASE_EVENTS.has(phaseEvent)) {
    throw new Error('INVALID_INPUT');
  }

  const backlog = classifyBacklog(input.backlog);
  const returns = classifyReturns(input.returns);
  const residue = classifyResidue(input.residue);
  const occurrences = classifyOccurrences(input.occurrences);
  const inbox = input.worker_inbox && typeof input.worker_inbox === 'object' ? input.worker_inbox : {};
  const workerInboxRef = clean(inbox.ref);
  const workerInboxCurrent = inbox.current === true;
  const workerInboxActionable = Number.isInteger(inbox.actionable_count) && inbox.actionable_count > 0;
  const asyncContinuationRequired = input.async_continuation_required !== false;

  const rebaseRequired = subjectGeneration !== currentGeneration || input.currentness_invalidated === true;
  const reapRequired = residue.findings.length > 0;
  const eatRequired = occurrences.unconsumed.length > 0 || returns.stranded.length > 0 || workerInboxActionable;
  const backlogRefreshRequired = true;
  const inboxGap = asyncContinuationRequired && (!workerInboxRef || !workerInboxCurrent);
  const requiredUnknown = backlog.unknown.length > 0 || returns.unknown.length > 0 || residue.unknown.length > 0;
  const scaleCurrent = allScalesCurrent(input.four_scale);

  const nextActions = [];
  if (rebaseRequired) nextActions.push('REBASE');
  if (reapRequired) nextActions.push('REAP');
  if (eatRequired) nextActions.push('EAT');
  nextActions.push('BACKLOG_REFRESH');

  let disposition;
  let reason;
  if (rebaseRequired) {
    disposition = 'REBASE_REQUIRED';
    reason = 'SUBJECT_GENERATION_STALE_OR_INVALIDATED';
  } else if (eatRequired) {
    disposition = 'EAT_REQUIRED';
    reason = returns.stranded.length ? 'RESULT_OR_RETURN_NOT_REJOINED' : workerInboxActionable ? 'WORKER_INBOX_ACTIONABLE' : 'UNCONSUMED_OCCURRENCE';
  } else if (reapRequired) {
    disposition = 'REAP_REQUIRED';
    reason = 'CURRENT_RESIDUE_PRESENT';
  } else if (backlog.runnable.length > 0) {
    disposition = 'CONTINUE_WORK';
    reason = 'RUNNABLE_BACKLOG_PRESENT';
    nextActions.push('CONTINUE_NEXT_GOLDEN_WORK');
  } else if (requiredUnknown) {
    disposition = 'WAIT_CURRENTNESS';
    reason = 'REQUIRED_BACKLOG_OR_RETURN_STATE_UNKNOWN';
  } else if (inboxGap) {
    disposition = 'WAIT_WORKER_INBOX_BINDING';
    reason = 'ASYNC_CONTINUATION_ENDPOINT_NOT_CURRENT';
  } else if (backlog.wait.length > 0 || backlog.blocked.length > 0) {
    disposition = 'WAIT_TRUE_GATE';
    reason = backlog.wait.length ? 'ONLY_TRUE_WAITS_REMAIN' : 'ONLY_BLOCKED_WORK_REMAINS';
  } else if (scaleCurrent && returns.stranded.length === 0 && residue.findings.length === 0 && occurrences.unconsumed.length === 0) {
    disposition = 'TERMINAL_FIXED_POINT';
    reason = 'FOUR_SCALE_CURRENT_AND_ZERO_ACTIONABLE_REMAINDER';
  } else {
    disposition = 'CONTINUE_QUALIFICATION';
    reason = 'PASS_DOES_NOT_SATISFY_TERMINAL_DENOMINATOR';
  }

  const terminal = disposition === 'TERMINAL_FIXED_POINT';
  if (!terminal && !nextActions.includes('CONTINUE_NEXT_GOLDEN_WORK') && disposition === 'CONTINUE_QUALIFICATION') {
    nextActions.push('CONTINUE_QUALIFICATION');
  }

  return {
    schema: 'xiio.sdk.continuation-cycle/v1',
    root_ref: rootRef,
    worker_ref: workerRef,
    phase_event: phaseEvent,
    subject_generation: subjectGeneration,
    current_generation: currentGeneration,
    pass_state: state(input.pass_state),
    disposition,
    reason,
    terminal,
    rebase_required: rebaseRequired,
    reap_required: reapRequired,
    eat_required: eatRequired,
    backlog_refresh_required: backlogRefreshRequired,
    worker_inbox: {
      ref: workerInboxRef,
      current: workerInboxCurrent,
      actionable_count: Number.isInteger(inbox.actionable_count) ? inbox.actionable_count : null,
      async_continuation_required: asyncContinuationRequired,
      gap: inboxGap,
    },
    backlog,
    returns,
    residue,
    occurrences,
    four_scale_current: scaleCurrent,
    next_actions: nextActions,
    eat_pipeline: [
      'OBSERVE',
      'CLASSIFY',
      'HARVEST',
      'PRESERVE',
      'DISPOSITION',
      'SIMULATE_RECOMPILE',
      'RETURN',
    ],
    hard: [
      'PASS != STOP',
      'PASS != TERMINAL',
      'REAP != DELETE',
      'EAT != EFFECT_AUTHORITY',
      'BLOCKED_CELL != TEAM_STOP',
      'UNKNOWN != NO_EFFECT',
      'RESULT != RETURN != APPLY_RETURN',
      'WORKER_INBOX_ADDRESS != AUTHORITY',
      'MESSAGE_RECEIVED != WORK_SELECTED',
      'SAME_INPUT_AND_NO_DELTA != NEW_PROGRESS',
    ],
  };
}
