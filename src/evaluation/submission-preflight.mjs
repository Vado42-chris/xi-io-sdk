const BILLING_STATES = new Set(['HEALTHY', 'PAYMENT_FAILED', 'SPENDING_LIMIT', 'UNKNOWN']);
const PROVIDER_CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN']);

function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNonNegative(value, code) {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

function validateLocalAck(ack) {
  if (!ack || typeof ack !== 'object' || Array.isArray(ack)) throw new Error('LOCAL_ACK_REQUIRED');
  if (ack.schema_version !== 'xiio.resource-capability-ack/v1') throw new Error('LOCAL_ACK_SCHEMA_INVALID');
  for (const field of ['request_id', 'worker_ref', 'resource_ref', 'operation', 'lease_ref', 'source_generation', 'ack', 'reason']) {
    text(ack[field], `LOCAL_ACK_${field.toUpperCase()}_INVALID`);
  }
  if (!['YES', 'NO'].includes(ack.ack)) throw new Error('LOCAL_ACK_STATE_INVALID');
  if (ack.attempt_count !== 0) throw new Error('LOCAL_ACK_ATTEMPT_MUST_BE_ZERO');
  if (ack.attempt_authorized !== false || ack.effect_authority !== false || ack.provider_effect !== false) {
    throw new Error('LOCAL_ACK_MUST_NOT_MINT_EFFECT_AUTHORITY');
  }
  return ack;
}

function meter({ pricingRef, localSimUnits, providerAttemptUnits, preventedProviderAttemptUnits }) {
  return Object.freeze({
    schema: 'xiio.sdk.metered-execution/v1',
    pricing_ref: pricingRef,
    local_sim_units: localSimUnits,
    provider_attempt_units: providerAttemptUnits,
    prevented_provider_attempt_units: preventedProviderAttemptUnits,
    provider_effect_units: 0,
    hard: [
      'METERED_UNIT != EFFECT_AUTHORITY',
      'PREVENTED_PROVIDER_ATTEMPT != PROVIDER_FAILURE',
    ],
  });
}

function wake({ wakeRef, detonatorRef, missionRootRef, generation, targetRef, route, meterRef }) {
  return Object.freeze({
    schema: 'xiio.hotfolder.ready.v1',
    semantics: 'WAKE_ONLY',
    wake_ref: wakeRef,
    detonator: detonatorRef,
    mission_root_ref: missionRootRef,
    generation,
    target_ref: targetRef,
    route,
    meter_ref: meterRef,
    effects: 0,
    effect_authority: false,
    hard: [
      'HOTFOLDER_WAKE != ATTEMPT',
      'DETONATOR != EFFECT_AUTHORITY',
    ],
  });
}

export function compileSubmissionPreflight(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INPUT_REQUIRED');

  const missionRootRef = text(input.mission_root_ref, 'MISSION_ROOT_REQUIRED');
  const generation = text(input.generation, 'GENERATION_REQUIRED');
  const wakeRef = text(input.wake_ref, 'WAKE_REF_REQUIRED');
  const detonatorRef = text(input.detonator_ref, 'DETONATOR_REF_REQUIRED');
  const targetRef = text(input.target_ref, 'TARGET_REF_REQUIRED');
  const pricingRef = text(input.pricing_ref, 'PRICING_REF_REQUIRED');
  const meterRef = text(input.meter_ref, 'METER_REF_REQUIRED');
  const localAck = validateLocalAck(input.local_ack);

  const provider = input.provider_preflight && typeof input.provider_preflight === 'object'
    ? input.provider_preflight
    : {};
  const billingState = text(provider.billing_state, 'BILLING_STATE_REQUIRED');
  if (!BILLING_STATES.has(billingState)) throw new Error('BILLING_STATE_INVALID');
  const currentness = text(provider.currentness, 'PROVIDER_CURRENTNESS_REQUIRED');
  if (!PROVIDER_CURRENTNESS.has(currentness)) throw new Error('PROVIDER_CURRENTNESS_INVALID');
  const providerReadbackRef = optionalText(provider.readback_ref);
  const providerAdmissionRef = optionalText(provider.admission_ref);

  const localSimUnits = finiteNonNegative(input.local_sim_units ?? 1, 'LOCAL_SIM_UNITS_INVALID');
  const providerAttemptUnits = finiteNonNegative(input.provider_attempt_units ?? 1, 'PROVIDER_ATTEMPT_UNITS_INVALID');

  const ackYes = localAck.ack === 'YES';
  const billingHealthy = billingState === 'HEALTHY';
  const providerCurrent = currentness === 'CURRENT' && Boolean(providerReadbackRef);
  const providerAdmitted = Boolean(providerAdmissionRef);

  let state;
  let next;
  let route;
  let providerSubmissionEligible = false;
  let preventedProviderAttemptUnits = 0;

  if (!ackYes) {
    state = 'BLOCKED_LOCAL_ACK';
    next = 'REPAIR_OR_REBIND_LOCAL_ACK';
    route = 'LOCAL_ACK_REPAIR';
    preventedProviderAttemptUnits = providerAttemptUnits;
  } else if (!billingHealthy) {
    state = 'LOCAL_SIM_READY_PROVIDER_BILLING_BLOCKED';
    next = 'CONTINUE_LOCAL_ACK_SIM_WITHOUT_PROVIDER_SUBMISSION';
    route = 'LOCAL_ACK_SIM_ONLY';
    preventedProviderAttemptUnits = providerAttemptUnits;
  } else if (!providerCurrent) {
    state = 'LOCAL_SIM_READY_PROVIDER_CURRENTNESS_WAIT';
    next = 'READ_BACK_PROVIDER_CURRENTNESS';
    route = 'LOCAL_ACK_SIM_ONLY';
    preventedProviderAttemptUnits = providerAttemptUnits;
  } else if (!providerAdmitted) {
    state = 'LOCAL_SIM_READY_PROVIDER_ADMISSION_WAIT';
    next = 'RESOLVE_PROVIDER_ADMISSION';
    route = 'LOCAL_ACK_SIM_ONLY';
    preventedProviderAttemptUnits = providerAttemptUnits;
  } else {
    state = 'READY_FOR_PROVIDER_SUBMISSION';
    next = 'SUBMIT_THROUGH_ADMITTED_PROVIDER_PATH';
    route = 'PROVIDER_SUBMISSION_ELIGIBLE';
    providerSubmissionEligible = true;
  }

  const metering = meter({
    pricingRef,
    localSimUnits: ackYes ? localSimUnits : 0,
    providerAttemptUnits: providerSubmissionEligible ? providerAttemptUnits : 0,
    preventedProviderAttemptUnits,
  });

  const hotfolder = wake({
    wakeRef,
    detonatorRef,
    missionRootRef,
    generation,
    targetRef,
    route,
    meterRef,
  });

  return Object.freeze({
    schema: 'xiio.sdk.submission-preflight/v1',
    mission_root_ref: missionRootRef,
    generation,
    state,
    next,
    local_ack: Object.freeze({
      request_id: localAck.request_id,
      worker_ref: localAck.worker_ref,
      resource_ref: localAck.resource_ref,
      operation: localAck.operation,
      lease_ref: localAck.lease_ref,
      source_generation: localAck.source_generation,
      ack: localAck.ack,
      reason: localAck.reason,
    }),
    provider: Object.freeze({
      billing_state: billingState,
      currentness,
      readback_ref: providerReadbackRef,
      admission_ref: providerAdmissionRef,
      submission_eligible: providerSubmissionEligible,
    }),
    meter: metering,
    hotfolder,
    effects: 0,
    effect_authority: false,
    hard: [
      'LOCAL_ACK_FIRST',
      'ACK_YES != PROVIDER_SUBMIT_AUTHORITY',
      'BILLING_RED => PROVIDER_ATTEMPT_0',
      'BILLING_UNKNOWN => PROVIDER_ATTEMPT_0',
      'PRE_RUNNER_BILLING_FAILURE != SOURCE_FAILURE',
      'LOCAL_SIM_PASS != PROVIDER_PASS',
      'HOTFOLDER_WAKE != ATTEMPT',
      'METERED_BILLING != EFFECT_AUTHORITY',
    ],
  });
}
