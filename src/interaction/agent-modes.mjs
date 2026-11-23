export const AGENT_INTERACTION_MODE_SCHEMA = 'xiio.sdk.agent-interaction-mode/v1';

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

function uniqueTextArray(value, code) {
  const rows = ownDenseArray(value, code).map((entry) => text(entry, code));
  if (new Set(rows).size !== rows.length) throw new Error(code);
  return rows;
}

function maybeText(value, code) {
  if (value == null) return null;
  return text(value, code);
}

function modeDefinition(id) {
  const mode = MODE_DEFINITIONS[id];
  if (!mode) throw new Error('AGENT_INTERACTION_MODE_UNKNOWN');
  return mode;
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

  const supportedModes = uniqueTextArray(
    ownValue(input, 'supported_modes', 'AGENT_INTERACTION_SUPPORTED_MODES_REQUIRED'),
    'AGENT_INTERACTION_SUPPORTED_MODES_INVALID',
  ).map((id) => id.toLowerCase());

  for (const id of supportedModes) modeDefinition(id);

  const capabilityClasses = uniqueTextArray(
    ownValue(input, 'capability_classes', 'AGENT_INTERACTION_CAPABILITY_CLASSES_REQUIRED'),
    'AGENT_INTERACTION_CAPABILITY_CLASSES_INVALID',
  ).map((entry) => entry.toUpperCase());
  const capabilitySet = new Set(capabilityClasses);

  const selectedRaw = ownValue(input, 'selected_mode', 'AGENT_INTERACTION_SELECTED_MODE_INVALID', { optional: true });
  const selectedMode = selectedRaw == null ? null : text(selectedRaw, 'AGENT_INTERACTION_SELECTED_MODE_INVALID').toLowerCase();
  if (selectedMode != null) modeDefinition(selectedMode);

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

  const modes = AGENT_INTERACTION_MODE_IDS.map((id) => {
    const definition = MODE_DEFINITIONS[id];
    const supported = supportedModes.includes(id);
    const missing = supported
      ? definition.required_capabilities.filter((capability) => !capabilitySet.has(capability))
      : [...definition.required_capabilities];
    const state = !supported ? 'UNSUPPORTED' : missing.length ? 'BLOCKED' : 'AVAILABLE';
    return Object.freeze({
      id,
      label: definition.label,
      intent: definition.intent,
      state,
      required_capabilities: Object.freeze([...definition.required_capabilities]),
      missing_capabilities: Object.freeze(missing),
      effect_authority: false,
      provider_effect: false,
    });
  });

  const selected = selectedMode == null
    ? null
    : modes.find((mode) => mode.id === selectedMode);

  return Object.freeze({
    schema: AGENT_INTERACTION_MODE_SCHEMA,
    product_ref: productRef,
    contract_generation: contractGeneration,
    selected_mode: selectedMode,
    selected_mode_state: selected?.state ?? null,
    supported_modes: Object.freeze([...supportedModes]),
    capability_classes: Object.freeze([...capabilityClasses]),
    modes: Object.freeze(modes),
    axes: Object.freeze({
      interaction: Object.freeze({
        selected_mode: selectedMode,
        state: selected?.state ?? null,
      }),
      authorization: Object.freeze({
        permission_mode: permissionMode,
        authorization_ref: authorizationRef,
        state: authorizationRef ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
        authority_granted: false,
      }),
      delivery: Object.freeze({
        gate: deliveryGate,
        state: deliveryGate ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
        verified: false,
      }),
    }),
    effect_authority: false,
    authority_granted: false,
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
      'RESULT != RETURN != APPLY_RETURN',
    ]),
  });
}
