const REQUIREMENTS = Object.freeze({
  READ: Object.freeze([['read']]),
  SEARCH: Object.freeze([['search', 'glob']]),
  TEST: Object.freeze([['test', 'execute', 'run']]),
  EXECUTE: Object.freeze([['execute', 'run']]),
  GENERATE: Object.freeze([['create', 'write']]),
  WRITE: Object.freeze([['write', 'replace']]),
  APPEND: Object.freeze([['append']]),
  PHYSICAL_AUDIT: Object.freeze([
    ['execute', 'run'],
    ['native_host_identity', 'physical_host_identity'],
    ['result_readback', 'native_readback'],
  ]),
});

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function capabilitySet(value) {
  return new Set(Array.isArray(value) ? value.map(norm).filter(Boolean) : []);
}

export function normalizeRequestedVerb(value) {
  const v = norm(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    run: 'EXECUTE',
    execute: 'EXECUTE',
    exec: 'EXECUTE',
    read: 'READ',
    inspect: 'READ',
    search: 'SEARCH',
    glob: 'SEARCH',
    test: 'TEST',
    check: 'TEST',
    generate: 'GENERATE',
    create: 'GENERATE',
    write: 'WRITE',
    replace: 'WRITE',
    append: 'APPEND',
    log_append: 'APPEND',
    physical_audit: 'PHYSICAL_AUDIT',
    audit_physical: 'PHYSICAL_AUDIT',
    host_audit: 'PHYSICAL_AUDIT',
  };
  return aliases[v] || String(value || '').trim().toUpperCase();
}

export function evaluateToolVerbFidelity({
  requestedVerb,
  toolName = null,
  toolCapabilities = [],
  targetSurface = 'UNKNOWN',
} = {}) {
  const verb = normalizeRequestedVerb(requestedVerb);
  const requirements = REQUIREMENTS[verb];
  const caps = capabilitySet(toolCapabilities);

  if (!requirements) {
    return Object.freeze({
      schema: 'xiio.sdk.tool-verb-fidelity/v1',
      pass: false,
      state: 'BLOCKED',
      result: 'BLOCKED_UNKNOWN_VERB',
      requestedVerb: verb,
      toolName,
      missingCapabilityGroups: [],
      attempt: 0,
    });
  }

  const missingCapabilityGroups = requirements
    .filter((group) => !group.some((cap) => caps.has(cap)))
    .map((group) => [...group]);

  const surface = norm(targetSurface);
  const physicalSurfaceMismatch = verb === 'PHYSICAL_AUDIT'
    && !['physical', 'native_host', 'physical_host'].includes(surface);

  if (missingCapabilityGroups.length || physicalSurfaceMismatch) {
    return Object.freeze({
      schema: 'xiio.sdk.tool-verb-fidelity/v1',
      pass: false,
      state: 'BLOCKED',
      result: physicalSurfaceMismatch
        ? 'BLOCKED_PHYSICAL_SURFACE_MISMATCH'
        : 'BLOCKED_TOOL_VERB_MISMATCH',
      requestedVerb: verb,
      toolName,
      missingCapabilityGroups,
      targetSurface,
      attempt: 0,
      hard: [
        'READ != EXECUTE',
        'READ != GENERATE',
        'WRITE != APPEND',
        'SOURCE_INSPECTION != PHYSICAL_AUDIT',
        'UNSUPPORTED_ACTION => ATTEMPT_0',
      ],
    });
  }

  return Object.freeze({
    schema: 'xiio.sdk.tool-verb-fidelity/v1',
    pass: true,
    state: 'ADMISSIBLE_TOOL_SELECTION',
    result: 'TOOL_VERB_MATCH',
    requestedVerb: verb,
    toolName,
    targetSurface,
    attempt: null,
    authority: 'NONE',
  });
}

export const TOOL_VERB_REQUIREMENTS = REQUIREMENTS;
