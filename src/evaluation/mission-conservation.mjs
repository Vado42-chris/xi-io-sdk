function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function bool(value) {
  return value === true;
}

function step(number, name, state, reason, evidence = []) {
  return Object.freeze({ number, name, state, reason, evidence: list(evidence) });
}

const HARD = Object.freeze([
  'LOCAL_RESULT_CONSISTENCY != MISSION_CORRECTNESS',
  'MULTIPLE_AGENTS_AGREE != TRUTH',
  'ROOT_PASS != DOWNSTREAM_PASS',
  'ASSERTED_EVIDENCE != VERIFIED_EVIDENCE',
  'FILE_CLAIM != DISK_PROOF',
  'ENDPOINT_CLAIM != NATIVE_READBACK',
  'CLIENT_CODE != SERVER_PROOF',
  'INTERFACE_CLAIM != IMPLEMENTED_INTERFACE',
  'IMPLEMENTED_INTERFACE != EFFECT_AUTHORITY',
  'TOOL_LIMIT_RETRY != LICENSE_TO_INVENT_INTERFACE',
  'RECEIPT_ID != LEDGER_READBACK',
  'ATTESTATION_CLAIM != ARTIFACT_SEMANTICS',
  'TEST_FIXTURE_TEXT != TEST_FIXTURE_SEMANTICS',
  'RUNNING != LIVE',
  'RESULT != RETURN != APPLY_RETURN',
  'ROOT_OPEN + NEXT_NONE = INVALID_TERMINAL',
]);

function haltedResult({ ingressRoot, payloadRoot, steps, code, next }) {
  return Object.freeze({
    schema: 'xiio.sdk.mission-evaluation/v1',
    mission_root_ref: ingressRoot,
    payload_root_ref: payloadRoot,
    state: 'HALT',
    result: code,
    pass: false,
    terminal: false,
    steps,
    next,
    hard: [...HARD],
  });
}

function semanticContradictions(payload, observations) {
  const out = [];
  const attestation = payload.attestation && typeof payload.attestation === 'object' ? payload.attestation : {};
  const output = typeof payload.output === 'string' ? payload.output : '';
  const fixture = payload.test_fixture && typeof payload.test_fixture === 'object' ? payload.test_fixture : {};
  const fixtureSource = typeof fixture.source === 'string' ? fixture.source : '';

  if (text(attestation.Y_AXIS_WHAT) === 'AST_VALIDATED_ZERO_STUBS' && /(^|\n)\s*pass\s*(#.*)?($|\n)/m.test(output)) {
    out.push('Y_AXIS_ZERO_STUBS_CONTRADICTED_BY_PASS_STATEMENT');
  }
  if (text(payload.receipt_id) && !text(observations.ledger_readback_ref)) {
    out.push('RECEIPT_ID_WITHOUT_LEDGER_READBACK');
  }
  if (text(payload.ledger_ref) && !text(observations.ledger_readback_ref)) {
    out.push('LEDGER_CLAIM_WITHOUT_NATIVE_READBACK');
  }
  if (text(fixture.expected_ast_rule) === 'PASS_STATEMENT_PLACEHOLDER') {
    const hasRealPassStatement = /(^|\n)\s*pass\s*(#.*)?($|\n)/m.test(fixtureSource);
    if (!hasRealPassStatement) out.push('TEST_FIXTURE_DOES_NOT_EXERCISE_PASS_STATEMENT_RULE');
  }
  if (text(fixture.remediation_expected) === 'NO_STUBS' && /(^|\n)\s*pass\s*(#.*)?($|\n)/m.test(String(fixture.remediation_source || ''))) {
    out.push('REMEDIATION_STILL_CONTAINS_PASS_STATEMENT_STUB');
  }
  return out;
}

export function evaluateMissionResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');

  const ingress = input.ingress && typeof input.ingress === 'object' ? input.ingress : {};
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  const observations = input.observations && typeof input.observations === 'object' ? input.observations : {};

  const ingressRoot = text(ingress.mission_root_ref);
  const payloadRoot = text(payload.mission_root_ref);
  if (!ingressRoot || !payloadRoot) throw new Error('MISSION_ROOT_REQUIRED');

  const steps = [];

  if (ingressRoot !== payloadRoot) {
    steps.push(step(1, 'ROOT_CONSERVATION', 'FAIL', 'MISSION_ROOT_MISMATCH', [ingressRoot, payloadRoot]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_ROOT_DIVERGENCE', next: 'REAP_WRONG_ROOT_RESULT_AND_REJOIN_INGRESS_ROOT' });
  }
  steps.push(step(1, 'ROOT_CONSERVATION', 'PASS', 'MISSION_ROOT_CONSERVED', [ingressRoot]));

  const ingressGeneration = text(ingress.generation);
  const payloadGeneration = text(payload.generation);
  const currentnessRef = text(observations.current_generation_ref);
  if (!ingressGeneration || !payloadGeneration || ingressGeneration !== payloadGeneration || !currentnessRef) {
    steps.push(step(2, 'GENERATION_CURRENTNESS', 'FAIL', !currentnessRef ? 'CURRENTNESS_UNVERIFIED' : 'GENERATION_MISMATCH', [currentnessRef]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_GENERATION_CURRENTNESS', next: 'OBSERVE_CURRENT_GENERATION' });
  }
  steps.push(step(2, 'GENERATION_CURRENTNESS', 'PASS', 'CURRENT_GENERATION_VERIFIED', [currentnessRef]));

  const allowed = new Set(list(ingress.allowed_scope));
  const mutated = list(payload.mutated_scope);
  const scopeRef = text(observations.scope_readback_ref);
  const escaped = mutated.filter((item) => !allowed.has(item));
  if (!scopeRef || escaped.length > 0) {
    steps.push(step(3, 'AFFECTED_SCOPE', 'FAIL', escaped.length ? 'SCOPE_ESCAPE' : 'SCOPE_UNVERIFIED', [scopeRef, ...escaped]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_AFFECTED_SCOPE', next: 'READ_BACK_AFFECTED_SCOPE' });
  }
  steps.push(step(3, 'AFFECTED_SCOPE', 'PASS', 'AFFECTED_SCOPE_VERIFIED', [scopeRef]));

  const requiredEvidence = list(ingress.required_evidence);
  const verifiedEvidence = new Set(list(observations.verified_evidence_refs));
  const missingEvidence = requiredEvidence.filter((item) => !verifiedEvidence.has(item));
  const claimedArtifacts = list(payload.claimed_artifacts);
  const verifiedArtifacts = new Set(list(observations.verified_artifact_refs));
  const unverifiedArtifacts = claimedArtifacts.filter((item) => !verifiedArtifacts.has(item));
  const claimedEndpoints = list(payload.claimed_endpoints);
  const verifiedEndpoints = new Set(list(observations.verified_endpoint_refs));
  const unverifiedEndpoints = claimedEndpoints.filter((item) => !verifiedEndpoints.has(item));
  const claimedInterfaces = list(payload.claimed_interfaces);
  const verifiedInterfaces = new Set(list(observations.verified_interface_refs));
  const unverifiedInterfaces = claimedInterfaces.filter((item) => !verifiedInterfaces.has(item));
  const contradictions = semanticContradictions(payload, observations);

  if (contradictions.length) {
    steps.push(step(4, 'REQUIRED_EVIDENCE', 'FAIL', 'SEMANTIC_EVIDENCE_CONTRADICTION', contradictions));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_SEMANTIC_EVIDENCE_CONTRADICTION', next: 'REVERIFY_ARTIFACT_LEDGER_AND_FIXTURE_SEMANTICS' });
  }

  if (missingEvidence.length || unverifiedArtifacts.length || unverifiedEndpoints.length || unverifiedInterfaces.length) {
    const reason = unverifiedArtifacts.length ? 'UNVERIFIED_ARTIFACT'
      : unverifiedEndpoints.length ? 'UNVERIFIED_ENDPOINT'
        : unverifiedInterfaces.length ? 'UNVERIFIED_INTERFACE'
          : 'REQUIRED_EVIDENCE_MISSING';
    steps.push(step(4, 'REQUIRED_EVIDENCE', 'FAIL', reason, [
      ...missingEvidence,
      ...unverifiedArtifacts.map((item) => `artifact:${item}`),
      ...unverifiedEndpoints.map((item) => `endpoint:${item}`),
      ...unverifiedInterfaces.map((item) => `interface:${item}`),
    ]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: `FAIL_${reason}`, next: 'INDEPENDENTLY_READ_BACK_CLAIMED_STATE' });
  }

  const requestedEffects = list(payload.requested_effects);
  if (requestedEffects.length) {
    const allowedEffects = new Set(list(ingress.allowed_effects));
    const deniedEffects = requestedEffects.filter((item) => !allowedEffects.has(item));
    const authorityRef = text(observations.effect_authority_ref);
    if (deniedEffects.length || !authorityRef) {
      steps.push(step(4, 'EFFECT_AUTHORITY', 'FAIL', deniedEffects.length ? 'EFFECT_NOT_ALLOWED' : 'EFFECT_AUTHORITY_UNVERIFIED', [authorityRef, ...deniedEffects]));
      return haltedResult({ ingressRoot, payloadRoot, steps, code: deniedEffects.length ? 'FAIL_EFFECT_NOT_ALLOWED' : 'FAIL_EFFECT_AUTHORITY', next: 'RESOLVE_EFFECT_AUTHORITY_BEFORE_MUTATION' });
    }
    steps.push(step(4, 'EFFECT_AUTHORITY', 'PASS', 'EFFECT_AUTHORITY_VERIFIED', [authorityRef]));
  }

  steps.push(step(4, 'REQUIRED_EVIDENCE', 'PASS', 'REQUIRED_EVIDENCE_VERIFIED', [...verifiedEvidence]));

  const executionRef = text(observations.execution_receipt_ref);
  if (!executionRef || observations.execution_result !== 'PASS') {
    steps.push(step(5, 'RESULT_CORRECTNESS', 'FAIL', 'EXECUTION_RESULT_UNVERIFIED', [executionRef]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_RESULT_CORRECTNESS', next: 'VERIFY_EXECUTION_RESULT' });
  }
  steps.push(step(5, 'RESULT_CORRECTNESS', 'PASS', 'EXECUTION_RESULT_VERIFIED', [executionRef]));

  if (bool(payload.live) && !text(observations.live_readback_ref)) {
    steps.push(step(5, 'LIVE_READBACK', 'FAIL', 'LIVE_CLAIM_WITHOUT_NATIVE_READBACK'));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_FALSE_LIVE', next: 'OBTAIN_NATIVE_LIVE_READBACK' });
  }

  const returnRef = text(observations.return_ref);
  if (!returnRef) {
    steps.push(step(6, 'RETURN', 'FAIL', 'RETURN_MISSING'));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_RETURN_MISSING', next: 'RETURN_RESULT_TO_INGRESS_TARGET' });
  }
  steps.push(step(6, 'RETURN', 'PASS', 'RETURN_VERIFIED', [returnRef]));

  const applyReturnRef = text(observations.apply_return_ref);
  const applyReadbackRef = text(observations.apply_return_readback_ref);
  if (!applyReturnRef || !applyReadbackRef) {
    steps.push(step(7, 'APPLY_RETURN', 'FAIL', 'APPLY_RETURN_UNVERIFIED', [applyReturnRef, applyReadbackRef]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_APPLY_RETURN', next: 'APPLY_RETURN_AND_READ_BACK' });
  }
  steps.push(step(7, 'APPLY_RETURN', 'PASS', 'APPLY_RETURN_VERIFIED', [applyReturnRef, applyReadbackRef]));

  const reapRef = text(observations.reap_ref);
  const nextRef = text(observations.next_ref);
  const rootClosed = observations.root_closed === true;
  if (!reapRef || (!rootClosed && !nextRef)) {
    steps.push(step(8, 'REAP_NEXT', 'FAIL', !reapRef ? 'REAP_UNVERIFIED' : 'ROOT_OPEN_NEXT_MISSING', [reapRef, nextRef]));
    return haltedResult({ ingressRoot, payloadRoot, steps, code: 'FAIL_REAP_NEXT', next: !reapRef ? 'REAP_AND_RECOMPUTE_FRONTIER' : 'SELECT_NEXT_FIRST_RED' });
  }
  steps.push(step(8, 'REAP_NEXT', 'PASS', rootClosed ? 'ROOT_CLOSED_VERIFIED' : 'NEXT_FRONTIER_VERIFIED', [reapRef, nextRef]));

  return Object.freeze({
    schema: 'xiio.sdk.mission-evaluation/v1',
    mission_root_ref: ingressRoot,
    payload_root_ref: payloadRoot,
    state: 'PASS',
    result: rootClosed ? 'MISSION_CLOSED' : 'MISSION_CONTINUES',
    pass: true,
    terminal: rootClosed,
    steps,
    next: rootClosed ? null : nextRef,
    hard: [...HARD],
  });
}
