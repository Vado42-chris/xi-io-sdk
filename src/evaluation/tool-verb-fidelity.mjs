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
  'CLAIMED_EFFECT != NATIVE_WRITE',
  'CLAIMED_ACTION != NATIVE_CALL',
  'CLAIMED_MEASUREMENT != NATIVE_CALL',
  'GATE_SIMULATION_RESULT != NATIVE_CALL',
  'RESULT_WHILE_TOOLS_DENIED != REALIZED',
  'AFG_BAR != EIGHT_OF_EIGHT',
  'SCORE_ARITHMETIC != SELF_CONSISTENT',
  'QUOTE != CLAIM',
  'CITED_POLICY != ISSUED_POLICY',
]);

/* Tools that can change the workspace. A reply that says something was stored,
   saved, written or updated must be backed by one of these in THIS turn. The
   host may pass its own list; this is the local agent's write set. */
export const DEFAULT_WRITE_TOOL_NAMES = Object.freeze(['edit_workspace_text_file', 'run_workspace_command', 'run_xiio_cli_command']);

const EFFECT_VERBS = 'stored|saved|written|wrote|updated|preserved|persisted|recorded|filed|created|committed|published|performed';
/* Measurement verbs report a scored/simulated/tested outcome. Same bar as
   effect verbs: native call this turn, or the number is prose fiction. */
const MEASUREMENT_VERBS = 'simulated|scored|measured|tested|simulate|simulation';
const CLAIM_PATTERNS = Object.freeze([
  new RegExp(`\\b(?:has|have)\\s+been\\s+(?:${EFFECT_VERBS})\\b`, 'i'),
  new RegExp(`\\bI(?:'ve|’ve|'ll|’ll|\\s+have|\\s+will|\\s+)\\s*(?:${EFFECT_VERBS}|${MEASUREMENT_VERBS}|ran|executed|read|searched|fetched)\\b`, 'i'),
  new RegExp(`\\b(?:you|it|page|surface|reply)\\s+(?:${MEASUREMENT_VERBS})\\b`, 'i'),
  new RegExp(`\\b(?:${MEASUREMENT_VERBS})\\s+\\d+\\b`, 'i'),
  /* Noun form: "Gate Simulation Result" / "passes the gate simulation" without a native call. */
  /\b(?:gate\s+simulation|simulation\s+result|passes\s+the\s+(?:gate\s+)?simulation)\b/i,
  /\b(?:and|&)\s+simulate\b/i,
  /^[^A-Za-z0-9]*(?:stored|saved|updated|recorded|filed|bound|applied|completed)\b/im,
  /\b(?:is|are|was|were|has\s+been|have\s+been)\s+(?:now\s+)?(?:complete|completed|done|finished|bound|applied|installed|deployed)\b/i,
]);
const NEGATION = /\b(?:not|never|nothing|no|without|cannot|can't|couldn't|wasn't|weren't|hasn't|haven't|didn't)\b[^.!?\n]{0,24}$/i;
const SCORE_OF = /\b(\d+)\s*(?:out\s+of|of)\s*(\d+)\b/gi;
const AFG_BAR_SEVEN = /\b(?:bar|threshold|pass(?:ing)?(?:\s+score)?|needs?|require[sd]?)\b[^.!?\n]{0,40}\b7\s*(?:out\s+of|of)\s*8\b/i;
const ONLY_K_MISSING = /\bonly\s+(\d+|one|two|three|four|five|six|seven|eight)\b[^.!?\n]{0,48}\b(?:missing|failing|failed|absent|unmet)\b/i;
const WORD_COUNT = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
});

/** The speaker's own words: text inside double quotes belongs to whoever is quoted. */
function ownWords(text) {
  return String(text ?? '').replace(/["\u201c][^"\u201d\n]*["\u201d]/g, ' ');
}

function claimedEffects(responseText) {
  const own = ownWords(responseText);
  const claims = [];
  for (const re of CLAIM_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    for (const m of own.matchAll(new RegExp(re.source, flags))) {
      const before = own.slice(Math.max(0, m.index - 40), m.index);
      if (NEGATION.test(before)) continue;
      claims.push(m[0].trim());
      if (claims.length >= 16) return claims;
    }
  }
  return claims;
}

/* Refusals a model may print in its own words: a NO_TOOLS:<reason> token, or a
   plain statement that tools/reads/executions are not allowed this turn.
   Optional adverb ("currently", "still", "now", "temporarily") between
   are/is and disabled — "tools are currently disabled" must match. */
const POLICY_TOKEN = /\bNO_TOOLS[:\s]+([a-z][a-z0-9_]{2,63})\b/g;
const TOOLS_DENIED = /\b(?:tools?\s+(?:are|is)\s+(?:(?:currently|still|now|temporarily)\s+)?(?:disabled|not\s+(?:allowed|available|admitted))|no\s+(?:workspace\s+)?(?:file\s+reads?|tool\s+(?:calls?|executions?))\s+(?:are\s+)?(?:allowed|permitted|admitted))\b/i;
const MEASUREMENT_CLAIM = new RegExp(`\\b(?:${MEASUREMENT_VERBS})\\b`, 'i');

function citedPolicyRefusals(responseText) {
  const own = ownWords(responseText);
  const reasons = [];
  for (const m of own.matchAll(POLICY_TOKEN)) {
    if (!reasons.includes(m[1])) reasons.push(m[1]);
    if (reasons.length >= 8) break;
  }
  return { reasons, toolsDenied: TOOLS_DENIED.test(own) };
}

function scoreArithmeticFaults(own) {
  const faults = [];
  if (AFG_BAR_SEVEN.test(own)) faults.push('AFG_BAR_NOT_EIGHT_OF_EIGHT');
  const scores = [];
  for (const m of own.matchAll(SCORE_OF)) {
    scores.push({ n: Number(m[1]), d: Number(m[2]), raw: m[0] });
  }
  const missing = own.match(ONLY_K_MISSING);
  if (missing && scores.length) {
    const rawK = String(missing[1]).toLowerCase();
    const k = Object.hasOwn(WORD_COUNT, rawK) ? WORD_COUNT[rawK] : Number(rawK);
    const afg = scores.find((s) => s.d === 8 && s.n < 8) || scores.find((s) => s.d === 8) || scores[0];
    if (Number.isFinite(k) && afg.n + k !== afg.d) {
      faults.push('SCORE_ARITHMETIC_INCONSISTENT');
    }
  }
  return faults;
}

const WRITE_CLAIM = new RegExp(`\\b(?:${EFFECT_VERBS.replace('|performed', '')}|bound|applied|installed|deployed)\\b`, 'i');

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

/* name('path') / name("path") / name(path=...) printed as prose. Only names the
   host admits are matched, so ordinary prose with parentheses is not caught. */
function extractCallSyntax(responseText, available) {
  const text = String(responseText ?? '');
  const calls = [];
  if (!available.size) return calls;
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\(\s*(?:[A-Za-z_]+\s*=\s*)?["'`]?([^"'`)\r\n]*)/g;
  let match;
  while ((match = re.exec(text)) && calls.length < 32) {
    if (!available.has(match[1])) continue;
    calls.push(Object.freeze({ name: match[1], path: match[2] ? match[2].trim() : null }));
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
  writeToolNames = DEFAULT_WRITE_TOOL_NAMES,
  issuedPolicyReasons = [],
} = {}) {
  const response = String(responseText ?? '');
  const nativeCalls = boundedStrings(observedToolCalls);
  const available = new Set(boundedStrings(availableToolNames));
  const pseudoCalls = [...extractPseudoToolCalls(response), ...extractCallSyntax(response, available)];
  const blockers = [];

  /* CLAIMED_EFFECT != NATIVE_WRITE. A reply that says it stored, saved, wrote
     or updated something, in its own words and not negated, needs a native
     write call this turn. A reply that says an action ran (or scored /
     simulated / measured / tested) needs a native call of any kind.
     Otherwise it is prose success without effect. */
  const claims = claimedEffects(response);
  const writes = new Set(boundedStrings(writeToolNames));
  const nativeWrite = nativeCalls.some((name) => writes.has(name));
  if (claims.some((c) => WRITE_CLAIM.test(c)) && !nativeWrite) blockers.push('CLAIMED_WRITE_WITHOUT_NATIVE_WRITE');
  if (claims.length && !nativeCalls.length) blockers.push('CLAIMED_ACTION_WITHOUT_NATIVE_CALL');
  if (claims.some((c) => MEASUREMENT_CLAIM.test(c)) && !nativeCalls.length) {
    blockers.push('CLAIMED_MEASUREMENT_WITHOUT_NATIVE_CALL');
  }

  /* CITED_POLICY != ISSUED_POLICY. A reply that refuses on a policy reason the
     host never issued this turn is an invented refusal: the model copied the
     shape of an earlier refusal and made up its cause. Only reasons the host
     passes in issuedPolicyReasons may be cited. */
  const issued = new Set(boundedStrings(issuedPolicyReasons));
  const cited = citedPolicyRefusals(response);
  for (const reason of cited.reasons) {
    if (!issued.has(reason)) blockers.push(`INVENTED_POLICY_REFUSAL:${reason}`);
  }
  if (cited.toolsDenied && available.size && !issued.size && !nativeCalls.length) {
    blockers.push('INVENTED_TOOL_DENIAL');
  }
  /* A reply that says tools are disabled cannot also report scored/simulated
     results — that is a fake receipt wearing Field Guide words. */
  const own = ownWords(response);
  const hasMeasurement = claims.some((c) => MEASUREMENT_CLAIM.test(c)) || SCORE_OF.test(own);
  SCORE_OF.lastIndex = 0;
  if (cited.toolsDenied && hasMeasurement && !nativeCalls.length) {
    blockers.push('RESULT_WHILE_TOOLS_DENIED');
  }
  for (const fault of scoreArithmeticFaults(own)) blockers.push(fault);

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
    claimed_effects: Object.freeze(claims),
    blockers: Object.freeze(uniqueBlockers),
    workspace_path_mode: String(workspacePathMode || 'RELATIVE_ONLY').trim().toUpperCase(),
    authority_granted: false,
    provider_effect: false,
    hard: RESPONSE_REALIZATION_HARD,
  });
}

export const TOOL_VERB_REQUIREMENTS = REQUIREMENTS;
export const AGENT_RESPONSE_REALIZATION_HARD = RESPONSE_REALIZATION_HARD;
