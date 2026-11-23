export const AGENT_INTERACTION_MODE_SCHEMA = 'xiio.sdk.agent-interaction-mode/v1';
// Exact generation this module implements. Any other generation is refused.
export const AGENT_INTERACTION_CONTRACT_GENERATION = 'xiio.sdk.agent-interaction-mode-contract/v1';

export const AGENT_INTERACTION_MODE_IDS = Object.freeze([
  'ask',
  'plan',
  'debug',
  'agent',
  'multitask',
]);

const MODE_DEFINITIONS = Object.freeze({
  ask: Object.freeze({
    id: 'ask',
    label: 'Ask',
    intent: 'questions_research_explanation_inspection',
    required_capabilities: Object.freeze(['CONVERSATION']),
  }),
  plan: Object.freeze({
    id: 'plan',
    label: 'Plan',
    intent: 'requirements_dependencies_proposed_changes',
    required_capabilities: Object.freeze(['CONVERSATION', 'PLAN_PERSISTENCE']),
  }),
  debug: Object.freeze({
    id: 'debug',
    label: 'Debug',
    intent: 'diagnostics_logs_tests_failure_inspection',
    required_capabilities: Object.freeze(['CONVERSATION', 'DIAGNOSTICS']),
  }),
  agent: Object.freeze({
    id: 'agent',
    label: 'Agent',
    intent: 'bounded_implementation_work',
    required_capabilities: Object.freeze([
      'CONVERSATION',
      'QUALIFIED_TOOLS',
      'WORK_ASSIGNMENT',
      'EFFECT_AUTHORIZATION',
      'RESULT_READBACK',
    ]),
  }),
  multitask: Object.freeze({
    id: 'multitask',
    label: 'Multitask',
    intent: 'coordinate_concurrent_admitted_work',
    required_capabilities: Object.freeze([
      'CONVERSATION',
      'WORKER_ADMISSION',
      'WORKER_DISPATCH',
      'WORK_ASSIGNMENT',
      'RESULT_COLLECTION',
    ]),
  }),
});

const DELIVERY_GATES = new Set(['PLAN', 'BUILD', 'DEV', 'TEST', 'LIVE']);
// Modes whose selection may lead to side effects once authority is verified.
const EFFECT_MODES = new Set(['debug', 'agent', 'multitask']);
// Capability classes that need a Ward grant on top of a qualified provider.
const AUTHORIZATION_CLASSES = new Set(['EFFECT_AUTHORIZATION', 'WORKER_ADMISSION', 'WORKER_DISPATCH', 'WORK_ASSIGNMENT']);
const PERMISSION_MODES = new Set(['read_only', 'ask_each']);

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

function ownValue(source, key, code, { optional = false } = {}) {
  object(source, code);
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor) {
    if (optional) return undefined;
    throw new Error(code);
  }
  if (!Object.hasOwn(descriptor, 'value')) throw new Error(code);
  return descriptor.value;
}

function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function ownDenseArray(value, code) {
  if (!Array.isArray(value)) throw new Error(code);
  const rows = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(code);
    rows.push(descriptor.value);
  }
  return rows;
}

function uniqueTextArray(value, code, normalize = (entry) => entry) {
  const rows = ownDenseArray(value, code).map((entry) => normalize(text(entry, code)));
  if (new Set(rows).size !== rows.length) throw new Error(code);
  return rows;
}

function maybeText(value, code) {
  if (value == null) return null;
  return text(value, code);
}

function modeDefinition(id) {
  if (!Object.hasOwn(MODE_DEFINITIONS, id)) throw new Error('AGENT_INTERACTION_MODE_UNKNOWN');
  return MODE_DEFINITIONS[id];
}

// Provenance must name the responsible authority and this exact contract generation.
// The pure resolver cannot prove authenticity; the issuing owner's verifier must.
// What it can refuse is provenance that is absent, from the wrong issuer, or from another generation.
function provenanceValid(provenance, issuer) {
  if (provenance == null) return false;
  const PROV = 'AGENT_INTERACTION_PROVENANCE_INVALID';
  object(provenance, PROV);
  const found = ownValue(provenance, 'issuer', PROV, { optional: true });
  const ref = ownValue(provenance, 'ref', PROV, { optional: true });
  const generation = ownValue(provenance, 'contract_generation', PROV, { optional: true });
  return found === issuer
    && typeof ref === 'string'
    && ref.trim() !== ''
    && generation === AGENT_INTERACTION_CONTRACT_GENERATION;
}

function providerEvidence(providers, capability) {
  if (providers == null) return null;
  const CODE = 'AGENT_INTERACTION_PROVIDERS_INVALID';
  object(providers, CODE);
  const record = ownValue(providers, capability, CODE, { optional: true });
  if (record == null) return null;
  object(record, CODE);
  return {
    installed: ownValue(record, 'installed', CODE, { optional: true }) === true,
    qualified: ownValue(record, 'qualified', CODE, { optional: true }) === true,
    provenance: ownValue(record, 'provenance', CODE, { optional: true }),
  };
}

function grantFrom(grant) {
  if (grant == null) return { present: false, valid: false, classes: new Set() };
  const CODE = 'AGENT_INTERACTION_AUTHORIZATION_GRANT_INVALID';
  object(grant, CODE);
  const valid = provenanceValid(ownValue(grant, 'provenance', CODE, { optional: true }), 'ward');
  const rows = ownValue(grant, 'grants', CODE, { optional: true }) ?? [];
  const classes = ownDenseArray(rows, CODE).map((entry) => text(entry, CODE).toUpperCase());
  return { present: true, valid, classes: new Set(valid ? classes : []) };
}

function countValidWorkerAdmissions(admissions) {
  if (admissions == null) return 0;
  const CODE = 'AGENT_INTERACTION_WORKER_ADMISSIONS_INVALID';
  return ownDenseArray(admissions, CODE).filter((row) => {
    object(row, CODE);
    const workerRef = ownValue(row, 'worker_ref', CODE, { optional: true });
    return provenanceValid(ownValue(row, 'provenance', CODE, { optional: true }), 'switchboard')
      && typeof workerRef === 'string' && workerRef.trim() !== '';
  }).length;
}

function executionReturnVerified(action, returns) {
  if (returns == null) return false;
  const CODE = 'AGENT_INTERACTION_RETURNS_INVALID';
  return ownDenseArray(returns, CODE).some((row) => {
    object(row, CODE);
    return ownValue(row, 'action_ref', CODE, { optional: true }) === action.ref
      && provenanceValid(ownValue(row, 'provenance', CODE, { optional: true }), 'switchboard');
  });
}

export function agentInteractionModeDefinition(id) {
  const mode = modeDefinition(text(id, 'AGENT_INTERACTION_MODE_REQUIRED').toLowerCase());
  return Object.freeze({
    ...mode,
    required_capabilities: Object.freeze([...mode.required_capabilities]),
    authority_granted: false,
    provider_effect: false,
  });
}

/**
 * Compile the current interaction profile. Pure: performs no action and changes no permission.
 *
 * Availability and authority are derived only from current verified evidence:
 *   providers[CLASS]          { installed, qualified, provenance: { issuer: 'switchboard', ref, contract_generation } }
 *   authorization_grant       { provenance: { issuer: 'ward', ref, contract_generation }, grants: [CLASS...] }
 *   worker_admissions         [{ worker_ref, provenance: { issuer: 'switchboard', ... } }]
 *   action / returns          execution counts as complete only with a matching switchboard return
 * Caller-supplied booleans never qualify a capability. A restored selection contributes only its mode.
 */
export function compileAgentInteractionProfile(input = {}) {
  object(input, 'AGENT_INTERACTION_PROFILE_INVALID');

  const productRef = text(
    ownValue(input, 'product_ref', 'AGENT_INTERACTION_PRODUCT_REF_REQUIRED'),
    'AGENT_INTERACTION_PRODUCT_REF_REQUIRED',
  );
  const contractGeneration = text(
    ownValue(input, 'contract_generation', 'AGENT_INTERACTION_CONTRACT_GENERATION_REQUIRED'),
    'AGENT_INTERACTION_CONTRACT_GENERATION_REQUIRED',
  );
  if (contractGeneration !== AGENT_INTERACTION_CONTRACT_GENERATION) {
    throw new Error('AGENT_INTERACTION_CONTRACT_GENERATION_UNKNOWN');
  }

  const supportedModes = uniqueTextArray(
    ownValue(input, 'supported_modes', 'AGENT_INTERACTION_SUPPORTED_MODES_REQUIRED'),
    'AGENT_INTERACTION_SUPPORTED_MODES_INVALID',
    (id) => id.toLowerCase(),
  );
  for (const id of supportedModes) modeDefinition(id);

  const capabilityClasses = uniqueTextArray(
    ownValue(input, 'capability_classes', 'AGENT_INTERACTION_CAPABILITY_CLASSES_REQUIRED'),
    'AGENT_INTERACTION_CAPABILITY_CLASSES_INVALID',
    (entry) => entry.toUpperCase(),
  );
  const capabilitySet = new Set(capabilityClasses);

  const selectedRaw = ownValue(input, 'selected_mode', 'AGENT_INTERACTION_SELECTED_MODE_INVALID', { optional: true });
  const selectedMode = selectedRaw == null ? null : text(selectedRaw, 'AGENT_INTERACTION_SELECTED_MODE_INVALID').toLowerCase();
  if (selectedMode != null) modeDefinition(selectedMode);

  // A restored selection contributes its mode only. Saved authority is recorded and ignored.
  const restored = ownValue(input, 'restored_selection', 'AGENT_INTERACTION_RESTORE_INVALID', { optional: true });
  let restoredMode = null;
  let restoredAuthorityIgnored = false;
  if (restored != null) {
    object(restored, 'AGENT_INTERACTION_RESTORE_INVALID');
    restoredMode = text(ownValue(restored, 'mode', 'AGENT_INTERACTION_RESTORE_INVALID'), 'AGENT_INTERACTION_RESTORE_INVALID').toLowerCase();
    modeDefinition(restoredMode);
    restoredAuthorityIgnored = ownValue(restored, 'authority', 'AGENT_INTERACTION_RESTORE_INVALID', { optional: true }) != null;
    if (selectedMode != null && selectedMode !== restoredMode) throw new Error('AGENT_INTERACTION_RESTORE_MISMATCH');
  }
  const effectiveSelected = selectedMode ?? restoredMode;

  const permissionMode = maybeText(
    ownValue(input, 'permission_mode', 'AGENT_INTERACTION_PERMISSION_MODE_INVALID', { optional: true }),
    'AGENT_INTERACTION_PERMISSION_MODE_INVALID',
  );
  const authorizationRef = maybeText(
    ownValue(input, 'authorization_ref', 'AGENT_INTERACTION_AUTHORIZATION_REF_INVALID', { optional: true }),
    'AGENT_INTERACTION_AUTHORIZATION_REF_INVALID',
  );
  const deliveryRaw = maybeText(
    ownValue(input, 'delivery_gate', 'AGENT_INTERACTION_DELIVERY_GATE_INVALID', { optional: true }),
    'AGENT_INTERACTION_DELIVERY_GATE_INVALID',
  );
  const deliveryGate = deliveryRaw == null ? null : deliveryRaw.toUpperCase();
  if (deliveryGate != null && !DELIVERY_GATES.has(deliveryGate)) {
    throw new Error('AGENT_INTERACTION_DELIVERY_GATE_INVALID');
  }

  const providers = ownValue(input, 'providers', 'AGENT_INTERACTION_PROVIDERS_INVALID', { optional: true });
  const grant = grantFrom(ownValue(input, 'authorization_grant', 'AGENT_INTERACTION_AUTHORIZATION_GRANT_INVALID', { optional: true }));
  const workerCount = countValidWorkerAdmissions(ownValue(input, 'worker_admissions', 'AGENT_INTERACTION_WORKER_ADMISSIONS_INVALID', { optional: true }));

  const classStatus = (capability) => {
    if (!capabilitySet.has(capability)) return { state: 'UNAVAILABLE', reason: 'PROVIDER_MISSING' };
    const evidence = providerEvidence(providers, capability);
    if (!evidence || !evidence.installed) return { state: 'UNAVAILABLE', reason: 'PROVIDER_MISSING' };
    if (!evidence.qualified || !provenanceValid(evidence.provenance, 'switchboard')) {
      return { state: 'UNAVAILABLE', reason: 'PROVIDER_UNQUALIFIED' };
    }
    if (AUTHORIZATION_CLASSES.has(capability) && !grant.classes.has(capability)) {
      return { state: 'BLOCKED', reason: 'AUTHORIZATION_REQUIRED' };
    }
    return { state: 'AVAILABLE', reason: 'OK' };
  };

  const modes = AGENT_INTERACTION_MODE_IDS.map((id) => {
    const definition = MODE_DEFINITIONS[id];
    const supported = supportedModes.includes(id);
    const missing = supported
      ? definition.required_capabilities.filter((capability) => !capabilitySet.has(capability))
      : [...definition.required_capabilities];

    let state;
    let reason;
    if (!supported) {
      state = 'UNSUPPORTED';
      reason = 'MODE_NOT_SUPPORTED';
    } else if (missing.length) {
      state = 'UNAVAILABLE';
      reason = 'PROVIDER_MISSING';
    } else {
      const statuses = definition.required_capabilities.map(classStatus);
      const unavailable = statuses.find((status) => status.state === 'UNAVAILABLE');
      const blocked = statuses.find((status) => status.state === 'BLOCKED');
      if (unavailable) {
        state = 'UNAVAILABLE';
        reason = unavailable.reason;
      } else if (blocked) {
        state = 'BLOCKED';
        reason = blocked.reason;
      } else if (id === 'multitask' && workerCount === 0) {
        state = 'BLOCKED';
        reason = 'WORKER_NOT_ADMITTED';
      } else {
        state = 'AVAILABLE';
        reason = 'OK';
      }
    }

    return Object.freeze({
      id,
      label: definition.label,
      intent: definition.intent,
      state,
      reason,
      required_capabilities: Object.freeze([...definition.required_capabilities]),
      missing_capabilities: Object.freeze(missing),
      effect_authority: false,
      provider_effect: false,
    });
  });

  const selected = effectiveSelected == null ? null : modes.find((mode) => mode.id === effectiveSelected);
  const selectedState = selected?.state ?? null;

  // Execution authority is a separate decision from selection.
  let effects;
  if (effectiveSelected == null) {
    effects = { allowed: false, reason: 'NO_SELECTION' };
  } else if (!EFFECT_MODES.has(effectiveSelected)) {
    effects = { allowed: false, reason: 'MODE_HAS_NO_EFFECTS' };
  } else if (selectedState !== 'AVAILABLE') {
    effects = { allowed: false, reason: selected.reason };
  } else if (permissionMode === 'read_only') {
    effects = { allowed: false, reason: 'PERMISSION_READ_ONLY' };
  } else if (!PERMISSION_MODES.has(permissionMode)) {
    effects = { allowed: false, reason: 'PERMISSION_UNBOUND' };
  } else {
    effects = { allowed: true, reason: 'OK' };
  }

  const dispatch = effectiveSelected !== 'multitask'
    ? { allowed: false, reason: effectiveSelected == null ? 'NO_SELECTION' : 'MODE_HAS_NO_WORKER_DISPATCH', admission_required: true }
    : { allowed: effects.allowed && workerCount > 0, reason: effects.allowed ? (workerCount > 0 ? 'OK' : 'WORKER_NOT_ADMITTED') : effects.reason, admission_required: true };

  const actionRaw = ownValue(input, 'action', 'AGENT_INTERACTION_ACTION_INVALID', { optional: true });
  let execution;
  if (actionRaw == null) {
    execution = { state: 'NOT_REQUESTED', complete: false };
  } else {
    object(actionRaw, 'AGENT_INTERACTION_ACTION_INVALID');
    const actionRef = text(ownValue(actionRaw, 'ref', 'AGENT_INTERACTION_ACTION_INVALID'), 'AGENT_INTERACTION_ACTION_INVALID');
    if (!effects.allowed) {
      execution = { state: 'REFUSED', complete: false, reason: effects.reason };
    } else {
      const returns = ownValue(input, 'returns', 'AGENT_INTERACTION_RETURNS_INVALID', { optional: true });
      const verified = executionReturnVerified({ ref: actionRef }, returns);
      execution = verified
        ? { state: 'RETURN_VERIFIED', complete: true, reason: 'OK' }
        : { state: 'AUTHORIZED_AWAITING_RETURN', complete: false, reason: 'RETURN_NOT_VERIFIED' };
    }
  }

  return Object.freeze({
    schema: AGENT_INTERACTION_MODE_SCHEMA,
    product_ref: productRef,
    contract_generation: contractGeneration,
    selected_mode: effectiveSelected,
    selected_mode_state: selectedState,
    selected_mode_reason: selected?.reason ?? null,
    restored: restoredMode == null
      ? null
      : Object.freeze({ mode: restoredMode, saved_authority_ignored: restoredAuthorityIgnored }),
    supported_modes: Object.freeze([...supportedModes]),
    capability_classes: Object.freeze([...capabilityClasses]),
    modes: Object.freeze(modes),
    effects: Object.freeze({ ...effects }),
    dispatch: Object.freeze({ ...dispatch }),
    execution: Object.freeze({ ...execution }),
    axes: Object.freeze({
      interaction: Object.freeze({
        selected_mode: effectiveSelected,
        state: selectedState,
      }),
      authorization: Object.freeze({
        permission_mode: permissionMode,
        authorization_ref: authorizationRef,
        state: authorizationRef ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
        grant: !grant.present ? 'UNBOUND' : grant.valid ? 'VERIFIED' : 'UNVERIFIED',
      }),
      delivery: Object.freeze({
        gate: deliveryGate,
        state: deliveryGate ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
        verified: false,
      }),
    }),
    // Derived from current verified evidence. The compile itself performs no effect and mints no worker.
    effect_authority: effects.allowed,
    authority_granted: effects.allowed || dispatch.allowed,
    provider_effect: false,
    worker_identity_granted: false,
    worker_assignment_granted: false,
    hard: Object.freeze([
      'INTERACTION_MODE != PERMISSION',
      'INTERACTION_MODE != DELIVERY_GATE',
      'ASK != AUTHORITY',
      'PLAN != EFFECT_AUTHORITY',
      'DEBUG != SHELL_EFFECT_AUTHORITY',
      'AGENT_SELECTED != WRITE_AUTHORIZED',
      'MULTITASK_SELECTED != WORKER_IDENTITY',
      'MULTITASK_SELECTED != WORK_ASSIGNMENT',
      'VISIBLE_MODE != CAPABILITY_AVAILABLE',
      'CAPABILITY_AVAILABLE != PROVIDER_AUTHORIZED',
      'CALLER_BOOLEAN != PROVENANCE',
      'RESTORED_MODE != RESTORED_AUTHORITY',
      'ACTION_AUTHORIZED != EXECUTION_COMPLETE',
      'RESULT != RETURN != APPLY_RETURN',
    ]),
  });
}
