export const REJOIN_SEAM_SCHEMA = 'xiio.sdk.rejoin-seam-state/v1';
export const REJOIN_SEAMS_SCHEMA = 'xiio.sdk.rejoin-seams/v1';
export const STANDARD_REJOIN_FAMILIES = Object.freeze([
  'ACK', 'A2A', 'MCP', 'CLI', 'SDK', 'ARTICLES', 'PUBLISHER', 'BINS', 'CADENCE',
  'IBAL', 'SWITCHBOARD', 'WARD', 'CRM_MAIL', 'CLOUDFLARE', 'STUDIO', 'RETURN_CHAIN', 'DETONATOR',
]);
const FAMILIES = new Set(STANDARD_REJOIN_FAMILIES);
const TRANSPORT_FAMILIES = new Set(['A2A', 'MCP', 'CRM_MAIL', 'CLOUDFLARE']);
const PEER_CURRENT_FAMILIES = new Set(['A2A', 'MCP']);
const CALL_BOUND_FAMILIES = new Set(['A2A', 'MCP']);
const STATES = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'N_A_WITH_EVIDENCE']);
const CURRENT_STATES = new Set(['CURRENT', 'N_A_WITH_EVIDENCE']);
const RESOLUTION_CLASSES = new Set(['MACHINE_RESOLVABLE', 'TRUE_WAIT', 'OWNER_ONLY', 'NONE']);
const OPERATION_CLASSES = new Set(['READ', 'WRITE', 'EXECUTE', 'NO_EFFECT']);
const EFFECT_CLASSES = new Set(['READ_ONLY', 'LOCAL_WRITE', 'PROVIDER_WRITE', 'EXECUTE', 'NO_EFFECT']);
function clean(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function upper(value) { return clean(value)?.toUpperCase() ?? null; }
function requireString(value, field) { const out = clean(value); if (!out) throw new Error(`MISSING_${field.toUpperCase()}`); return out; }
function normalizeSeam(raw, root) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('SEAM_INVALID');
  const seamId = requireString(raw.seam_id, 'seam_id');
  const family = upper(raw.family);
  if (!FAMILIES.has(family)) throw new Error(`SEAM_FAMILY_INVALID:${seamId}`);
  const required = raw.required !== false;
  const applicability = upper(raw.applicability ?? (required ? 'REQUIRED' : 'OPTIONAL'));
  const observedState = upper(raw.state ?? 'UNKNOWN');
  if (!STATES.has(observedState)) throw new Error(`SEAM_STATE_INVALID:${seamId}`);
  const subjectGeneration = clean(raw.subject_generation) ?? root.subject_generation;
  const currentGeneration = clean(raw.current_generation) ?? root.current_generation;
  const generationBound = Boolean(subjectGeneration && currentGeneration && subjectGeneration === currentGeneration);
  const targetRef = clean(raw.target_ref);
  const providerFamily = clean(raw.provider_family);
  const endpointRef = clean(raw.endpoint_ref);
  const capabilityProfileRef = clean(raw.capability_profile_ref);
  const principalRef = clean(raw.principal_ref);
  const assignmentRef = clean(raw.assignment_ref);
  const assignmentReceiptRef = clean(raw.assignment_receipt_ref);
  const authorityReceiptRef = clean(raw.authority_receipt_ref);
  const mailboxAddress = clean(raw.mailbox_address);
  const evidenceRef = clean(raw.evidence_ref);
  const readbackRef = clean(raw.readback_ref);
  const observedAt = clean(raw.observed_at);
  const effectCeiling = clean(raw.effect_ceiling) ?? 'NO_EFFECT';
  const wakeWhen = clean(raw.wake_when);
  const resultRef = clean(raw.result_ref);
  const returnRef = clean(raw.return_ref);
  const applyReturnRef = clean(raw.apply_return_ref);
  const detonatorRef = clean(raw.detonator_ref);
  const tripDebtRef = clean(raw.trip_debt_ref);
  const toolBindingRef = clean(raw.tool_binding_ref);
  const operationProfileRef = clean(raw.operation_profile_ref);
  const resourceRef = clean(raw.resource_ref);
  const pathBindingRef = clean(raw.path_binding_ref);
  const storageBindingRef = clean(raw.storage_binding_ref);
  const bindingRootRef = clean(raw.binding_root_ref);
  const sourceDigestRef = clean(raw.source_digest_ref);
  const bindingGenerationRef = clean(raw.binding_generation_ref);
  const bindingReadbackRef = clean(raw.binding_readback_ref);
  const providerOccurrenceGenerationRef = clean(raw.provider_occurrence_generation_ref);
  const effectReceiptGenerationRef = clean(raw.effect_receipt_generation_ref);
  const requestedOperationClass = upper(raw.requested_operation_class);
  const boundOperationClass = upper(raw.bound_operation_class);
  const expectedEffectClass = upper(raw.expected_effect_class);
  const observedEffectClass = upper(raw.observed_effect_class);
  const effectReceiptRef = clean(raw.effect_receipt_ref);
  const providerOccurrenceRef = clean(raw.provider_occurrence_ref);
  const missingBindings = [];
  const invalidators = [];
  if (required) {
    if (!targetRef) missingBindings.push('target_ref');
    if (!providerFamily) missingBindings.push('provider_family');
    if (!capabilityProfileRef) missingBindings.push('capability_profile_ref');
    if (!subjectGeneration) missingBindings.push('subject_generation');
    if (!currentGeneration) missingBindings.push('current_generation');
    if (observedState === 'CURRENT' && TRANSPORT_FAMILIES.has(family) && !endpointRef) missingBindings.push('endpoint_ref');
    if (observedState === 'CURRENT' && PEER_CURRENT_FAMILIES.has(family)) {
      if (!principalRef) missingBindings.push('principal_ref');
      if (!assignmentRef) missingBindings.push('assignment_ref');
      if (!assignmentReceiptRef) missingBindings.push('assignment_receipt_ref');
      if (!authorityReceiptRef) missingBindings.push('authority_receipt_ref');
    }
    if (observedState === 'CURRENT' && CALL_BOUND_FAMILIES.has(family)) {
      if (!toolBindingRef) missingBindings.push('tool_binding_ref');
      if (!operationProfileRef) missingBindings.push('operation_profile_ref');
      if (!resourceRef) missingBindings.push('resource_ref');
      if (!pathBindingRef && !storageBindingRef) missingBindings.push('path_or_storage_binding_ref');
      if (!bindingRootRef) missingBindings.push('binding_root_ref');
      if (!sourceDigestRef) missingBindings.push('source_digest_ref');
      if (!bindingGenerationRef) missingBindings.push('binding_generation_ref');
      if (!bindingReadbackRef) missingBindings.push('binding_readback_ref');
      if (!requestedOperationClass) missingBindings.push('requested_operation_class');
      if (!boundOperationClass) missingBindings.push('bound_operation_class');
      if (!expectedEffectClass) missingBindings.push('expected_effect_class');
      if (!observedEffectClass) missingBindings.push('observed_effect_class');
      if (requestedOperationClass && !OPERATION_CLASSES.has(requestedOperationClass)) invalidators.push('REQUESTED_OPERATION_CLASS_INVALID');
      if (boundOperationClass && !OPERATION_CLASSES.has(boundOperationClass)) invalidators.push('BOUND_OPERATION_CLASS_INVALID');
      if (requestedOperationClass && boundOperationClass && requestedOperationClass !== boundOperationClass) invalidators.push('OPERATION_CLASS_MISMATCH');
      if (expectedEffectClass && !EFFECT_CLASSES.has(expectedEffectClass)) invalidators.push('EXPECTED_EFFECT_CLASS_INVALID');
      if (observedEffectClass && !EFFECT_CLASSES.has(observedEffectClass)) invalidators.push('OBSERVED_EFFECT_CLASS_INVALID');
      if (expectedEffectClass && observedEffectClass && expectedEffectClass !== observedEffectClass) invalidators.push('EFFECT_CLASS_MISMATCH');
      if (bindingRootRef && bindingRootRef !== root.root_ref) invalidators.push('BINDING_ROOT_MISMATCH');
      if (sourceDigestRef && !/^sha256:[0-9a-f]{64}$/i.test(sourceDigestRef)) invalidators.push('SOURCE_DIGEST_INVALID');
      if (bindingGenerationRef && bindingGenerationRef !== currentGeneration) invalidators.push('BINDING_GENERATION_MISMATCH');
      if (expectedEffectClass === 'PROVIDER_WRITE' || observedEffectClass === 'PROVIDER_WRITE') {
        if (!effectReceiptRef) missingBindings.push('effect_receipt_ref');
        if (!providerOccurrenceRef) missingBindings.push('provider_occurrence_ref');
        if (!providerOccurrenceGenerationRef) missingBindings.push('provider_occurrence_generation_ref');
        if (!effectReceiptGenerationRef) missingBindings.push('effect_receipt_generation_ref');
        if (providerOccurrenceGenerationRef && providerOccurrenceGenerationRef !== currentGeneration) invalidators.push('PROVIDER_OCCURRENCE_GENERATION_MISMATCH');
        if (effectReceiptGenerationRef && effectReceiptGenerationRef !== currentGeneration) invalidators.push('EFFECT_RECEIPT_GENERATION_MISMATCH');
      }
    }
    if (observedState === 'CURRENT' && family === 'CRM_MAIL') {
      if (!principalRef) missingBindings.push('principal_ref');
      if (!mailboxAddress) missingBindings.push('mailbox_address');
      if (!authorityReceiptRef) missingBindings.push('authority_receipt_ref');
      if (!providerOccurrenceRef) missingBindings.push('provider_occurrence_ref');
      if (!providerOccurrenceGenerationRef) missingBindings.push('provider_occurrence_generation_ref');
      if (providerOccurrenceGenerationRef && providerOccurrenceGenerationRef !== currentGeneration) invalidators.push('PROVIDER_OCCURRENCE_GENERATION_MISMATCH');
    }
    if (observedState === 'CURRENT' && family === 'CLOUDFLARE') {
      if (!providerOccurrenceRef) missingBindings.push('provider_occurrence_ref');
      if (!providerOccurrenceGenerationRef) missingBindings.push('provider_occurrence_generation_ref');
      if (providerOccurrenceGenerationRef && providerOccurrenceGenerationRef !== currentGeneration) invalidators.push('PROVIDER_OCCURRENCE_GENERATION_MISMATCH');
    }
    if (observedState === 'CURRENT' && !evidenceRef) missingBindings.push('evidence_ref');
    if (observedState === 'CURRENT' && !readbackRef) missingBindings.push('readback_ref');
    if (observedState === 'CURRENT' && !observedAt) missingBindings.push('observed_at');
    if (observedState === 'CURRENT' && family === 'RETURN_CHAIN') {
      if (!resultRef) missingBindings.push('result_ref');
      if (!returnRef) missingBindings.push('return_ref');
      if (!applyReturnRef) missingBindings.push('apply_return_ref');
    }
    if (observedState === 'CURRENT' && family === 'DETONATOR') {
      if (!detonatorRef) missingBindings.push('detonator_ref');
      if (!tripDebtRef) missingBindings.push('trip_debt_ref');
    }
  }
  let state = observedState;
  if (required && missingBindings.length) { state = 'UNKNOWN'; invalidators.push('REQUIRED_BINDING_MISSING'); }
  if (required && invalidators.some((code) => ['REQUESTED_OPERATION_CLASS_INVALID','BOUND_OPERATION_CLASS_INVALID','OPERATION_CLASS_MISMATCH','EXPECTED_EFFECT_CLASS_INVALID','OBSERVED_EFFECT_CLASS_INVALID','EFFECT_CLASS_MISMATCH','BINDING_ROOT_MISMATCH','SOURCE_DIGEST_INVALID','BINDING_GENERATION_MISMATCH','PROVIDER_OCCURRENCE_GENERATION_MISMATCH','EFFECT_RECEIPT_GENERATION_MISMATCH'].includes(code))) state = 'UNKNOWN';
  if (required && subjectGeneration && currentGeneration && subjectGeneration !== currentGeneration) { state = 'STALE'; invalidators.push('GENERATION_MISMATCH'); }
  if (raw.currentness_invalidated === true) { state = 'STALE'; invalidators.push('CURRENTNESS_INVALIDATED'); }
  if (state === 'N_A_WITH_EVIDENCE' && !evidenceRef) { state = 'UNKNOWN'; invalidators.push('N_A_WITHOUT_EVIDENCE'); }
  const current = CURRENT_STATES.has(state) && (state === 'N_A_WITH_EVIDENCE' || generationBound);
  const refreshRequired = required && !current;
  let resolutionClass = upper(raw.resolution_class ?? (refreshRequired ? 'MACHINE_RESOLVABLE' : 'NONE'));
  if (!RESOLUTION_CLASSES.has(resolutionClass)) throw new Error(`SEAM_RESOLUTION_CLASS_INVALID:${seamId}`);
  if (!refreshRequired) resolutionClass = 'NONE';
  if (refreshRequired && resolutionClass === 'TRUE_WAIT' && !wakeWhen) { resolutionClass = 'MACHINE_RESOLVABLE'; invalidators.push('TRUE_WAIT_WITHOUT_WAKE'); }
  return {
    schema: REJOIN_SEAM_SCHEMA, root_ref: root.root_ref, agent_ref: root.agent_ref, seam_id: seamId, family, required, applicability, state, current,
    refresh_required: refreshRequired, resolution_class: resolutionClass, wake_when: wakeWhen, subject_generation: subjectGeneration, current_generation: currentGeneration,
    generation_bound: generationBound, target_ref: targetRef, provider_family: providerFamily, endpoint_ref: endpointRef, capability_profile_ref: capabilityProfileRef,
    principal_ref: principalRef, assignment_ref: assignmentRef, assignment_receipt_ref: assignmentReceiptRef, authority_receipt_ref: authorityReceiptRef,
    mailbox_address: mailboxAddress, evidence_ref: evidenceRef, readback_ref: readbackRef, observed_at: observedAt, effect_ceiling: effectCeiling,
    result_ref: resultRef, return_ref: returnRef, apply_return_ref: applyReturnRef, detonator_ref: detonatorRef, trip_debt_ref: tripDebtRef,
    tool_binding_ref: toolBindingRef, operation_profile_ref: operationProfileRef, resource_ref: resourceRef, path_binding_ref: pathBindingRef,
    storage_binding_ref: storageBindingRef, binding_root_ref: bindingRootRef, source_digest_ref: sourceDigestRef, binding_generation_ref: bindingGenerationRef,
    binding_readback_ref: bindingReadbackRef, provider_occurrence_generation_ref: providerOccurrenceGenerationRef, effect_receipt_generation_ref: effectReceiptGenerationRef,
    requested_operation_class: requestedOperationClass, bound_operation_class: boundOperationClass, expected_effect_class: expectedEffectClass,
    observed_effect_class: observedEffectClass, effect_receipt_ref: effectReceiptRef, provider_occurrence_ref: providerOccurrenceRef,
    authority: 'NONE', missing_bindings: missingBindings, invalidators,
    next: refreshRequired ? `RESOLVE_${family}_CURRENT_BINDING_AND_READBACK` : 'NO_EFFECT_CURRENT',
  };
}
export function compileRejoinSeams(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT');
  const root = { root_ref: requireString(input.root_ref, 'root_ref'), agent_ref: requireString(input.agent_ref, 'agent_ref'), subject_generation: requireString(input.subject_generation, 'subject_generation'), current_generation: requireString(input.current_generation, 'current_generation') };
  if (!Array.isArray(input.seams) || input.seams.length === 0) throw new Error('SEAM_DENOMINATOR_REQUIRED');
  const seenIds = new Set();
  const seams = input.seams.map((row) => { const seam = normalizeSeam(row, root); if (seenIds.has(seam.seam_id)) throw new Error(`DUPLICATE_SEAM_ID:${seam.seam_id}`); seenIds.add(seam.seam_id); return seam; });
  const coveredFamilies = new Set(seams.map((row) => row.family));
  const missingFamilies = STANDARD_REJOIN_FAMILIES.filter((family) => !coveredFamilies.has(family));
  const stale = seams.filter((row) => row.required && row.state === 'STALE');
  const unknown = seams.filter((row) => row.required && row.state === 'UNKNOWN');
  const invalidNa = seams.filter((row) => !row.required && row.state === 'UNKNOWN' && row.invalidators.includes('N_A_WITHOUT_EVIDENCE'));
  const current = seams.filter((row) => row.required && row.current);
  const refresh = seams.filter((row) => row.refresh_required);
  const rootGenerationCurrent = root.subject_generation === root.current_generation;
  const status = !rootGenerationCurrent ? 'REBASE_REQUIRED' : missingFamilies.length > 0 || unknown.length > 0 || invalidNa.length > 0 ? 'UNKNOWN' : stale.length > 0 ? 'STALE' : 'CURRENT_BOUNDED';
  const obligations = refresh.map((row) => ({ seam_id: row.seam_id, family: row.family, next: row.next, target_ref: row.target_ref, provider_family: row.provider_family, endpoint_ref: row.endpoint_ref, principal_ref: row.principal_ref, assignment_ref: row.assignment_ref, authority_receipt_ref: row.authority_receipt_ref, current_generation: row.current_generation, resolution_class: row.resolution_class, wake_when: row.wake_when, invalidators: row.invalidators, missing_bindings: row.missing_bindings, tool_binding_ref: row.tool_binding_ref, operation_profile_ref: row.operation_profile_ref, resource_ref: row.resource_ref, path_binding_ref: row.path_binding_ref, storage_binding_ref: row.storage_binding_ref, binding_root_ref: row.binding_root_ref, binding_generation_ref: row.binding_generation_ref, binding_readback_ref: row.binding_readback_ref, provider_occurrence_generation_ref: row.provider_occurrence_generation_ref, effect_receipt_generation_ref: row.effect_receipt_generation_ref, expected_effect_class: row.expected_effect_class, observed_effect_class: row.observed_effect_class, provider_occurrence_ref: row.provider_occurrence_ref }));
  return {
    schema: REJOIN_SEAMS_SCHEMA, ...root, status, root_generation_current: rootGenerationCurrent, denominator: seams.length,
    required_denominator: seams.filter((row) => row.required).length, standard_family_denominator: STANDARD_REJOIN_FAMILIES.length,
    current_required: current.length, stale_required: stale.length, unknown_required: unknown.length, missing_families: missingFamilies,
    refresh_required_count: refresh.length, machine_resolvable_refresh_count: obligations.filter((row) => row.resolution_class === 'MACHINE_RESOLVABLE').length,
    true_wait_refresh_count: obligations.filter((row) => row.resolution_class === 'TRUE_WAIT').length, owner_only_refresh_count: obligations.filter((row) => row.resolution_class === 'OWNER_ONLY').length,
    refresh_obligations: obligations, seams, effect_ceiling: 'PROJECTION_ONLY', provider_effects: 0, authority_granted: false,
    current: status === 'CURRENT_BOUNDED', next: status === 'CURRENT_BOUNDED' ? 'CONTINUE_CURRENT_FRONTIER' : 'REFRESH_ONLY_AFFECTED_SEAMS_THEN_RECOMPILE',
    hard: ['ACK != A2A != MCP != CRM_MAIL != CLOUDFLARE','REJOIN != REUSE_STALE_ACK','SEAM_PRESENT != SEAM_CURRENT','ENDPOINT_PRESENT != PRINCIPAL_CURRENT','PEER_ENDPOINT != PEER_PRINCIPAL_ASSIGNMENT_ACCESS','PROVIDER_CONNECTED != ACCESS_BOUND','MAILBOX_ADDRESS != MAILBOX_ACCESS','AUTHORITY_RECEIPT_REF != EFFECT_AUTHORITY','TOOL_NAME_KNOWN != TOOL_BOUND','PATH_PLAUSIBLE != PATH_RESOLVED','FILE_DESCRIBED != FILE_EXISTS','WRITE_SUCCEEDED != SEMANTIC_EFFECT','LOCAL_EFFECT != PROVIDER_EFFECT','STATUS_VALUE != EVIDENCE_FOR_STATUS','OPAQUE_REF_PRESENT != BINDING_CURRENT','SOURCE_DIGEST_STRING != SOURCE_DIGEST_VALID','PROVIDER_OCCURRENCE_REF != PROVIDER_OCCURRENCE_CURRENT','CONTACT_CARD != MAIL_ACCOUNT_RUNTIME','SMTP_CONFIG_PRESENT != SMTP_SUBMISSION_OR_READBACK','CLOUDFLARE_HOSTNAME_PRESENT != EDGE_READBACK_CURRENT','RESULT != RETURN != APPLY_RETURN','DETONATOR_DECLARED != DETONATOR_TRIP_READBACK','PROVIDER_CONNECTED != CAPABILITY_CURRENT','ALTERNATE_SURFACE_PASS != REQUIRED_SURFACE_PASS','N_A != N_A_WITH_EVIDENCE','TRUE_WAIT_REQUIRES_EXACT_WAKE','SDK_SEAM_COMPILER != PROVIDER_EXECUTION','SDK_SEAM_COMPILER != EFFECT_AUTHORITY','ONE_STALE_SEAM != ROOT_STOP_WHEN_INDEPENDENT_WORK_EXISTS','CURRENT_REQUIRES_GENERATION_PLUS_EVIDENCE_PLUS_READBACK'],
  };
}
