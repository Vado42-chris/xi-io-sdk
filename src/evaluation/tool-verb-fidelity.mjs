const frozenGroups = (...groups) => Object.freeze(groups.map((group) => Object.freeze([...group])));

const REQUIREMENTS = Object.freeze({
  READ: frozenGroups(['read']),
  SEARCH: frozenGroups(['search', 'glob']),
  TEST: frozenGroups(['test', 'execute', 'run']),
  EXECUTE: frozenGroups(['execute', 'run']),
  GENERATE: frozenGroups(['create', 'write']),
  WRITE: frozenGroups(['write', 'replace']),
  APPEND: frozenGroups(['append']),
  PHYSICAL_AUDIT: frozenGroups(
    ['execute', 'run'],
    ['native_host_identity', 'physical_host_identity'],
    ['result_readback', 'native_readback'],
  ),
});

const RESPONSE_REALIZATION_HARD = Object.freeze([
  'PRINTED_TOOL_JSON != TOOL_EXECUTION',
  'INVENTED_TOOL_NAME != TOOL_CAPABILITY',
  'ABSOLUTE_PATH != WORKSPACE_RELATIVE_PATH',
  'ACTION_DESCRIPTION != ATTEMPT',
  'TOOL_CALL != RESULT_READBACK',
]);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function capabilitySet(value) {
  return new Set(Array.isArray(value) ? value.map(norm).filter(Boolean) : []);
}

function boundedStrings(value, limit = 64) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, limit);
}

function unsafeWorkspacePath(value) {
  const raw = String(value ?? '').trim();
  return raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw) || raw.split(/[\\/]+/).includes('..');
}

function extractPseudoToolCalls(responseText) {
  const text = String(responseText ?? '');
  const calls = [];
  const re = /["']?name["']?\s*:\s*["']([A-Za-z_][A-Za-z0-9_.:-]*)["'][\s\S]{0,1200}?["']?parameters["']?\s*:/gi;
  let match;
  while ((match = re.exec(text)) && calls.length < 32) {
    const window = text.slice(match.index, Math.min(text.length, match.index + 1800));
    const pathMatch = window.match(/["']?path["']?\s*:\s*["']([^"'\r\n]+)["']/i);
    calls.push(Object.freeze({
      name: match[1],
      path: pathMatch?.[1] || null,
    }));
  }
  return calls;
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

/**
 * Fail-closed realization gate for an agent's terminal assistant response.
 *
 * Native tool calls are supplied out-of-band by the host. JSON that merely looks
 * like a tool call inside assistant prose is never promoted to an attempt. This
 * projection also rejects invented tool interfaces and owner-specific/absolute
 * workspace paths before a host is tempted to treat them as executable work.
 */
export function evaluateAgentResponseRealization({
  responseText = '',
  observedToolCalls = [],
  availableToolNames = [],
  workspacePathMode = 'RELATIVE_ONLY',
} = {}) {
  const response = String(responseText ?? '');
  const nativeCalls = boundedStrings(observedToolCalls);
  const available = new Set(boundedStrings(availableToolNames));
  const pseudoCalls = extractPseudoToolCalls(response);
  const blockers = [];

  if (pseudoCalls.length) blockers.push('PSEUDO_TOOL_JSON_IN_ASSISTANT_TEXT');
  for (const call of pseudoCalls) {
    if (available.size && !available.has(call.name)) blockers.push(`INVENTED_TOOL_INTERFACE:${call.name}`);
    if (String(workspacePathMode).trim().toUpperCase() === 'RELATIVE_ONLY' && call.path && unsafeWorkspacePath(call.path)) {
      blockers.push(`WORKSPACE_PATH_NOT_RELATIVE:${call.path}`);
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  const blocked = uniqueBlockers.length > 0;
  return Object.freeze({
    schema: 'xiio.sdk.agent-response-realization/v1',
    pass: !blocked,
    state: blocked ? 'BLOCKED' : 'REALIZED',
    result: blocked ? 'BLOCKED_PSEUDO_TOOL_RESPONSE' : 'REALIZED_TERMINAL_RESPONSE',
    attempt: blocked ? 0 : null,
    response_nonempty: Boolean(response.trim()),
    native_tool_call_count: nativeCalls.length,
    native_tool_calls: Object.freeze(nativeCalls),
    pseudo_tool_call_count: pseudoCalls.length,
    pseudo_tool_calls: Object.freeze(pseudoCalls),
    blockers: Object.freeze(uniqueBlockers),
    workspace_path_mode: String(workspacePathMode || 'RELATIVE_ONLY').trim().toUpperCase(),
    authority_granted: false,
    provider_effect: false,
    hard: RESPONSE_REALIZATION_HARD,
  });
}

export const TOOL_VERB_REQUIREMENTS = REQUIREMENTS;
export const AGENT_RESPONSE_REALIZATION_HARD = RESPONSE_REALIZATION_HARD;
