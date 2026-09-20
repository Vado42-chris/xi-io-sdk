export const CAPACITY_BOUNDARY_SCHEMA = 'xiio.sdk.capacity-boundary/v1';

const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const bool = (value) => value === true;

const VALID_CAPACITY = new Set(['AVAILABLE','FULL','UNAVAILABLE','UNKNOWN']);
const VALID_ACTIONS = new Set(['BACKGROUND_WATCH_CREATE','PROVIDER_REVIEW','WORKER_SEAT','OTHER_OPTIONAL_SUPPORT']);

export function compileCapacityBoundary(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CAPACITY_BOUNDARY_INVALID_INPUT');

  const requestedAction = clean(input.requested_action)?.toUpperCase() ?? 'OTHER_OPTIONAL_SUPPORT';
  if (!VALID_ACTIONS.has(requestedAction)) throw new Error('CAPACITY_BOUNDARY_ACTION_INVALID');

  const capacityState = clean(input.capacity_state)?.toUpperCase() ?? 'UNKNOWN';
  if (!VALID_CAPACITY.has(capacityState)) throw new Error('CAPACITY_BOUNDARY_STATE_INVALID');

  const optional = input.optional !== false;
  const foregroundRunnable = bool(input.foreground_runnable);
  const rootRequiresAction = bool(input.root_requires_action);
  const existingReuseRef = clean(input.existing_reuse_ref);
  const ownerRelayAllowed = bool(input.owner_relay_allowed);

  let disposition = 'ACTION_AVAILABLE';
  let nextAction = requestedAction;
  let rootStopAllowed = false;
  let nonSerializing = false;

  if (capacityState !== 'AVAILABLE') {
    if (existingReuseRef) {
      disposition = 'REUSE_EXISTING';
      nextAction = 'REUSE_EXISTING';
      nonSerializing = true;
    } else if (foregroundRunnable) {
      disposition = 'WAIT_CAPACITY_NON_SERIALIZING';
      nextAction = 'CONTINUE_FOREGROUND';
      nonSerializing = true;
    } else if (rootRequiresAction && !optional) {
      disposition = 'TRUE_WAIT_CAPACITY';
      nextAction = 'WAIT_EXACT_WAKE';
      rootStopAllowed = true;
    } else {
      disposition = 'WAIT_CAPACITY_NON_SERIALIZING';
      nextAction = 'CONTINUE_FOREGROUND';
      nonSerializing = true;
    }
  }

  return Object.freeze({
    schema: CAPACITY_BOUNDARY_SCHEMA,
    requested_action: requestedAction,
    capacity_state: capacityState,
    optional,
    foreground_runnable: foregroundRunnable,
    root_requires_action: rootRequiresAction,
    existing_reuse_ref: existingReuseRef,
    owner_relay_allowed: ownerRelayAllowed,
    disposition,
    next_action: nextAction,
    root_stop_allowed: rootStopAllowed,
    non_serializing: nonSerializing,
    owner_interrupt_required: false,
    raw_tool_error_terminal_allowed: false,
    authority_granted: false,
    provider_effect: false,
    hard: [
      'OPTIONAL_SCHEDULER_CAPACITY != ROOT_STOP',
      'PROVIDER_REVIEW_CAPACITY != ROOT_STOP_WHILE_SIBLING_RUNNABLE',
      'EXISTING_WATCH > NEW_TASK',
      'RAW_TOOL_ERROR != FINAL_USER_RESULT',
      'WAIT_CAPACITY != OWNER_RELAY',
      'ONE_BLOCKED_CHILD != TEAM_STOP',
      'OWNER_TIME != FREE',
    ],
  });
}
