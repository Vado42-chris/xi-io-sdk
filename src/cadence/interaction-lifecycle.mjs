export const INTERACTION_LIFECYCLE_SCHEMA = 'xiio.sdk.interaction-lifecycle/v1';

const EFFECT_CEILINGS = new Set(['NONE', 'READ_ONLY', 'SOURCE_ONLY', 'PROVIDER_EFFECT', 'RUNTIME_EFFECT', 'LIVE_EFFECT']);
const VISIBILITY = new Set(['PUBLIC', 'INTERNAL', 'PRIVATE', 'UNKNOWN']);
const SIBLING_STATES = new Set(['RUNNABLE', 'WAIT', 'TRUE_WAIT', 'OWNER_ONLY', 'BLOCKED', 'TERMINAL', 'UNKNOWN']);

function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}_REQUIRED`);
  return value;
}

function maybeText(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function count(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name}_INVALID`);
  return value;
}

function list(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name}_INVALID`);
  return value;
}

function refs(value, name) {
  return list(value ?? [], name).map((entry, index) => text(entry, `${name}_${index}`));
}

function unique(values) {
  return [...new Set(values)];
}

function fail(codes, code) {
  if (!codes.includes(code)) codes.push(code);
}

function normalizeSibling(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`SIBLING_${index}_INVALID`);
  const state = text(entry.state, `SIBLING_${index}_STATE`).toUpperCase();
  if (!SIBLING_STATES.has(state)) throw new Error(`SIBLING_${index}_STATE_INVALID`);
  return {
    work_ref: text(entry.work_ref, `SIBLING_${index}_WORK_REF`),
    state,
    machine_resolvable: entry.machine_resolvable === true,
    owner_required: entry.owner_required === true,
    wake_ref: maybeText(entry.wake_ref),
  };
}

function normalizeChildren(input) {
  const declared = count(input.child_denominator ?? 0, 'CHILD_DENOMINATOR');
  const children = list(input.children ?? [], 'CHILDREN').map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`CHILD_${index}_INVALID`);
    const disposition = text(entry.disposition ?? 'ACTIVE', `CHILD_${index}_DISPOSITION`).toUpperCase();
    return {
      child_ref: text(entry.child_ref, `CHILD_${index}_REF`),
      disposition,
      open_receipt_ref: maybeText(entry.open_receipt_ref),
      close_receipt_ref: maybeText(entry.close_receipt_ref),
      wait_ref: maybeText(entry.wait_ref),
    };
  });
  if (children.length > declared) throw new Error('CHILDREN_EXCEED_DENOMINATOR');
  const accountedOpen = children.filter((entry) => entry.open_receipt_ref || entry.wait_ref || entry.disposition === 'N_A').length;
  const accountedClose = children.filter((entry) => entry.close_receipt_ref || entry.wait_ref || entry.disposition === 'N_A').length;
  return { declared, children, accountedOpen, accountedClose };
}

function normalizeDisclosure(input) {
  const disclosure = input.disclosure ?? {};
  const source = text(disclosure.source_visibility ?? 'UNKNOWN', 'SOURCE_VISIBILITY').toUpperCase();
  const target = text(disclosure.target_visibility ?? 'UNKNOWN', 'TARGET_VISIBILITY').toUpperCase();
  if (!VISIBILITY.has(source) || !VISIBILITY.has(target)) throw new Error('VISIBILITY_INVALID');
  return {
    source_visibility: source,
    target_visibility: target,
    qualification_ref: maybeText(disclosure.qualification_ref),
  };
}

function normalizeClose(close) {
  if (!close) return null;
  return {
    result_ref: maybeText(close.result_ref),
    burndown_receipt_ref: maybeText(close.burndown_receipt_ref),
    denominator_delta_ref: maybeText(close.denominator_delta_ref),
    verification_refs: refs(close.verification_refs ?? [], 'CLOSE_VERIFICATION_REFS'),
    failure_refs: refs(close.failure_refs ?? [], 'CLOSE_FAILURE_REFS'),
    thrash_refs: refs(close.thrash_refs ?? [], 'CLOSE_THRASH_REFS'),
    learning_refs: refs(close.learning_refs ?? [], 'CLOSE_LEARNING_REFS'),
    owner_load_ref: maybeText(close.owner_load_ref),
    remaining_red_refs: refs(close.remaining_red_refs ?? [], 'CLOSE_REMAINING_RED_REFS'),
    next_ref: maybeText(close.next_ref),
    wait_ref: maybeText(close.wait_ref),
    terminal_ref: maybeText(close.terminal_ref),
    return_ref: maybeText(close.return_ref),
    apply_return_ref: maybeText(close.apply_return_ref),
    reap_ref: maybeText(close.reap_ref),
    rejoin_ref: maybeText(close.rejoin_ref),
    current_readback_ref: maybeText(close.current_readback_ref),
  };
}

export function compileInteractionLifecycle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');

  const interactionId = text(input.interaction_id, 'INTERACTION_ID');
  const actorRef = text(input.actor_ref, 'ACTOR_REF');
  const rootRef = text(input.root_ref, 'ROOT_REF');
  const returnTargetRef = text(input.return_target_ref, 'RETURN_TARGET_REF');
  const cadencePolicyRef = text(input.cadence_policy_ref, 'CADENCE_POLICY_REF');
  const acceptedBaseRef = text(input.accepted_base_ref, 'ACCEPTED_BASE_REF');
  const openedCurrentRef = text(input.opened_current_ref, 'OPENED_CURRENT_REF');
  const latestCurrentRef = text(input.latest_current_ref, 'LATEST_CURRENT_REF');
  const firstRedRef = text(input.first_red_ref, 'FIRST_RED_REF');
  const collisionRef = text(input.collision_ref, 'COLLISION_REF');
  const expectedResult = text(input.expected_result, 'EXPECTED_RESULT');
  const siblingPolicy = text(input.sibling_policy, 'SIBLING_POLICY');
  const effectCeiling = text(input.effect_ceiling, 'EFFECT_CEILING').toUpperCase();
  if (!EFFECT_CEILINGS.has(effectCeiling)) throw new Error('EFFECT_CEILING_INVALID');

  const standupReceiptRef = maybeText(input.standup_receipt_ref);
  const providerProjectionRefs = refs(input.provider_projection_refs ?? [], 'PROVIDER_PROJECTION_REFS');
  const knownHostileRefs = refs(input.known_hostile_refs ?? [], 'KNOWN_HOSTILE_REFS');
  const ownerHeartbeatCount = count(input.owner_heartbeat_count ?? 0, 'OWNER_HEARTBEAT_COUNT');
  const machineResolvableNext = input.machine_resolvable_next === true;
  const disclosure = normalizeDisclosure(input);
  const child = normalizeChildren(input);
  const siblings = list(input.siblings ?? [], 'SIBLINGS').map(normalizeSibling);
  const closeInput = input.close && typeof input.close === 'object' && !Array.isArray(input.close) ? input.close : null;
  const close = normalizeClose(closeInput);

  const failures = [];
  const currentnessMoved = openedCurrentRef !== latestCurrentRef;
  const providerAliasesCanonical = providerProjectionRefs.includes(rootRef)
    || providerProjectionRefs.includes(returnTargetRef)
    || providerProjectionRefs.includes(actorRef);
  const runnableSiblings = siblings.filter((entry) => entry.state === 'RUNNABLE' || entry.machine_resolvable);
  const unresolvedSiblings = siblings.filter((entry) => entry.state !== 'TERMINAL');

  if (!standupReceiptRef) fail(failures, 'INTERACTION_WITHOUT_OPEN_STANDUP');
  if (currentnessMoved) fail(failures, 'CURRENTNESS_MOVED_REBASE_REQUIRED');
  if (providerAliasesCanonical) fail(failures, 'PROVIDER_PROJECTION_ALIASES_CANONICAL_IDENTITY');
  if (ownerHeartbeatCount > 0 && machineResolvableNext) fail(failures, 'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT');
  if (child.accountedOpen !== child.declared) fail(failures, 'CHILD_OPEN_DENOMINATOR_INCOMPLETE');
  if (disclosure.source_visibility === 'PRIVATE' && disclosure.target_visibility === 'PUBLIC' && !disclosure.qualification_ref) {
    fail(failures, 'PRIVATE_TO_PUBLIC_WITHOUT_DISCLOSURE_QUALIFICATION');
  }
  if (disclosure.source_visibility === 'UNKNOWN' || disclosure.target_visibility === 'UNKNOWN') {
    fail(failures, 'DISCLOSURE_VISIBILITY_UNKNOWN');
  }

  let closeState = 'OPEN';
  let closeNextAction = null;

  if (close) {
    closeState = 'CLOSE_REQUESTED';

    if (!close.result_ref) fail(failures, 'CLOSE_WITHOUT_RESULT');
    if (!close.burndown_receipt_ref) fail(failures, 'INTERACTION_WITHOUT_CLOSE_BURNDOWN');
    if (!close.denominator_delta_ref) fail(failures, 'CLOSE_WITHOUT_DENOMINATOR_DELTA');
    if (close.verification_refs.length === 0) fail(failures, 'CLOSE_WITHOUT_VERIFICATION');
    if (!close.owner_load_ref) fail(failures, 'CLOSE_WITHOUT_OWNER_LOAD_ACCOUNTING');
    if (!close.next_ref && !close.wait_ref && !close.terminal_ref) fail(failures, 'CLOSE_WITHOUT_NEXT_WAIT_OR_TERMINAL');
    if (child.accountedClose !== child.declared) fail(failures, 'CHILD_CLOSE_DENOMINATOR_INCOMPLETE');

    if (!close.result_ref) closeNextAction = 'PRODUCE_RESULT';
    else if (!close.burndown_receipt_ref) closeNextAction = 'CLOSE_BURNDOWN';
    else if (!close.denominator_delta_ref || close.verification_refs.length === 0 || !close.owner_load_ref || (!close.next_ref && !close.wait_ref && !close.terminal_ref)) {
      closeNextAction = 'COMPLETE_BURNDOWN_ACCOUNTING';
    } else if (child.accountedClose !== child.declared) closeNextAction = 'RESOLVE_CHILD_CLOSE_DENOMINATOR';
    else if (!close.return_ref) closeNextAction = 'COMPILE_RETURN';
    else if (!close.apply_return_ref) closeNextAction = 'APPLY_RETURN';
    else if (!close.reap_ref) closeNextAction = 'REAP';
    else if (!close.rejoin_ref) closeNextAction = 'REJOIN';
    else if (!close.current_readback_ref) closeNextAction = 'VERIFY_CURRENT_READBACK';

    if (closeNextAction && !['PRODUCE_RESULT', 'CLOSE_BURNDOWN', 'COMPLETE_BURNDOWN_ACCOUNTING', 'RESOLVE_CHILD_CLOSE_DENOMINATOR'].includes(closeNextAction)) {
      fail(failures, 'POST_RESULT_LIFECYCLE_INCOMPLETE');
    }
    if (!closeNextAction) closeState = 'CLOSED';
  }

  const rebaseRequired = currentnessMoved;
  const openQualified = Boolean(standupReceiptRef && collisionRef && firstRedRef && !rebaseRequired);
  const rootStopAllowed = Boolean(
    closeState === 'CLOSED'
      && failures.length === 0
      && unresolvedSiblings.length === 0
      && !machineResolvableNext
      && close?.terminal_ref,
  );

  let nextAction = null;
  if (rebaseRequired) nextAction = 'REBASE_CURRENT_TRUTH';
  else if (!standupReceiptRef) nextAction = 'OPEN_STANDUP';
  else if (providerAliasesCanonical) nextAction = 'RESOLVE_CANONICAL_IDENTITY';
  else if (disclosure.source_visibility === 'UNKNOWN' || disclosure.target_visibility === 'UNKNOWN') nextAction = 'QUALIFY_DISCLOSURE';
  else if (disclosure.source_visibility === 'PRIVATE' && disclosure.target_visibility === 'PUBLIC' && !disclosure.qualification_ref) nextAction = 'QUALIFY_DISCLOSURE';
  else if (child.accountedOpen !== child.declared) nextAction = 'RESOLVE_CHILD_OPEN_DENOMINATOR';
  else if (closeNextAction) nextAction = closeNextAction;
  else if (runnableSiblings.length > 0) nextAction = 'CONTINUE_RUNNABLE_SIBLING';
  else if (machineResolvableNext) nextAction = 'CONTINUE_MACHINE_RESOLVABLE_NEXT';
  else if (!close) nextAction = 'EXECUTE_BOUNDED_WORK';

  const status = failures.length > 0 ? 'FAIL_CURRENT' : closeState === 'CLOSED' ? 'CLOSED_CURRENT' : 'OPEN_CURRENT';

  return Object.freeze({
    schema: INTERACTION_LIFECYCLE_SCHEMA,
    interaction_id: interactionId,
    actor_ref: actorRef,
    root_ref: rootRef,
    return_target_ref: returnTargetRef,
    cadence_policy_ref: cadencePolicyRef,
    accepted_base_ref: acceptedBaseRef,
    opened_current_ref: openedCurrentRef,
    latest_current_ref: latestCurrentRef,
    first_red_ref: firstRedRef,
    collision_ref: collisionRef,
    effect_ceiling: effectCeiling,
    expected_result: expectedResult,
    sibling_policy: siblingPolicy,
    known_hostile_refs: knownHostileRefs,
    provider_projection_refs: providerProjectionRefs,
    disclosure,
    child_denominator: child.declared,
    child_open_accounted: child.accountedOpen,
    child_close_accounted: child.accountedClose,
    siblings,
    currentness_moved: currentnessMoved,
    rebase_required: rebaseRequired,
    open_qualified: openQualified,
    close_state: closeState,
    close,
    machine_resolvable_next: machineResolvableNext,
    owner_heartbeat_count: ownerHeartbeatCount,
    root_stop_allowed: rootStopAllowed,
    status,
    failures: unique(failures),
    next_action: nextAction,
    provider_effect: false,
    authority_granted: false,
    hard: [
      'INTERACTION_WITHOUT_OPEN_STANDUP = 10s_FAIL',
      'INTERACTION_WITHOUT_CLOSE_BURNDOWN = 10s_FAIL',
      'DEADLINE_PRESSURE != PERMISSION_TO_SKIP_REBASE',
      'CURRENTNESS_MOVED -> REBASE_REQUIRED',
      'PROVIDER_ID != CANONICAL_ID',
      'ASSIGNED != ACK != ATTEMPT',
      'RESULT -> BURN_DOWN_RETRO -> RETURN -> APPLY_RETURN -> REAP -> REJOIN -> CURRENT_READBACK',
      'PRIVATE_SOURCE != PUBLIC_PROJECTION_WITHOUT_QUALIFICATION',
      'ONE_BLOCKED_CHILD != ROOT_STOP',
      'RUNNABLE_SIBLING -> ROOT_CONTINUE',
      'MACHINE_RESOLVABLE_NEXT -> ROOT_STOP_FALSE',
      'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT = BUG',
      'SDK_INTERACTION_ENVELOPE != CADENCE_SCHEDULER',
      'SDK_INTERACTION_ENVELOPE != EFFECT_AUTHORITY',
    ],
  });
}
