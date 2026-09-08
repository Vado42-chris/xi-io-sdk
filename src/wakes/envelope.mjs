const NONBLANK = (value, max = 256) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const STATES = Object.freeze([
  'INTENDED',
  'DELIVERED',
  'ACKED',
  'STARTED',
  'RETURNED',
  'CONSUMED',
  'NOT_APPLICABLE',
  'BLOCKED',
]);

const clone = value => JSON.parse(JSON.stringify(value));

export function normalizeWakeEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('wake envelope must be an object');
  }
  const allowed = new Set([
    'schema', 'wake_id', 'generation', 'intent_ref', 'target',
    'state', 'effect_ceiling', 'authority', 'payload_ref', 'return_target',
  ]);
  const unsupported = Object.keys(input).filter(key => !allowed.has(key));
  if (unsupported.length) throw new TypeError(`unsupported keys: ${unsupported.join(', ')}`);

  if (input.schema !== 'xiio.sdk.wake-envelope/v1') throw new TypeError('schema unsupported');
  for (const key of ['wake_id', 'generation', 'intent_ref', 'payload_ref', 'return_target']) {
    if (!NONBLANK(input[key])) throw new TypeError(`${key} must be a bounded nonblank string`);
  }
  if (!input.target || typeof input.target !== 'object' || Array.isArray(input.target)) {
    throw new TypeError('target must be an object');
  }
  const targetKeys = Object.keys(input.target);
  if (targetKeys.some(key => !['product_id', 'repository'].includes(key))) {
    throw new TypeError('target contains unsupported keys');
  }
  if (!NONBLANK(input.target.product_id, 128) || !NONBLANK(input.target.repository, 256)) {
    throw new TypeError('target product_id and repository are required');
  }
  if (!STATES.includes(input.state)) throw new TypeError('state unsupported');
  if (input.effect_ceiling !== 'NO_EFFECT') throw new TypeError('public wake envelope effect ceiling must be NO_EFFECT');
  if (input.authority !== 'PROPOSAL_ONLY') throw new TypeError('public wake envelope authority must be PROPOSAL_ONLY');

  return Object.freeze(clone({
    schema: input.schema,
    wake_id: input.wake_id,
    generation: input.generation,
    intent_ref: input.intent_ref,
    target: input.target,
    state: input.state,
    effect_ceiling: input.effect_ceiling,
    authority: input.authority,
    payload_ref: input.payload_ref,
    return_target: input.return_target,
  }));
}

export function evaluateWakeProgress(envelope, observations = {}) {
  const wake = normalizeWakeEnvelope(envelope);
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) {
    throw new TypeError('wake observations must be an object');
  }
  const ordered = ['delivered', 'acked', 'started', 'returned', 'consumed', 'applied'];
  const fields = [...ordered, 'not_applicable'];
  const declared = Object.fromEntries(fields.map(key =>
    [key, Object.hasOwn(observations, key) && observations[key] === true]));
  const invalidFields = fields.filter(key => Object.hasOwn(observations, key) && typeof observations[key] !== 'boolean');
  let previous = true;
  const result = {};
  for (const key of ordered) {
    result[key] = previous && declared[key];
    previous = result[key];
  }
  const falseGreen = ordered.some((key, index) =>
    declared[key] && ordered.slice(0, index).some(parent => !declared[parent])
  ) || (declared.not_applicable && ordered.some(key => declared[key]));
  // Supplied booleans describe a claim and its ordering only. This pure reducer
  // has no delivery/ACK/consumer verifier and grants no completion or authority.
  return Object.freeze({
    schema: 'xiio.sdk.wake-progress/v1',
    wake_id: wake.wake_id,
    generation: wake.generation,
    target: wake.target,
    ...Object.fromEntries(ordered.map(key => [key, false])),
    not_applicable: false,
    false_green: falseGreen,
    terminal: 'OPEN',
    evidence_state: 'SUPPLIED_UNVERIFIED',
    verified: false,
    authority_granted: false,
    provider_effect: false,
    supplied_coverage: {
      declared,
      ordered_progress: result,
      declared_count: ordered.filter(key => declared[key]).length,
      ordered_count: ordered.filter(key => result[key]).length,
      denominator: ordered.length,
      coverage_complete: result.applied && !falseGreen && !invalidFields.length,
      terminal_claim: declared.not_applicable ? 'NOT_APPLICABLE' : result.applied ? 'APPLIED' : 'OPEN',
      invalid_fields: invalidFields,
    },
    next: 'AUTHENTICATED_WAKE_AND_CONSUMER_READBACK_REQUIRED',
    hard: ['SUPPLIED_PROGRESS != VERIFIED_DELIVERY', 'SUPPLIED_ACK != AUTHENTICATED_ACK',
      'SUPPLIED_APPLICATION != CONSUMER_READBACK', 'SUPPLIED_NOT_APPLICABLE != EXEMPTION_EVIDENCE'],
  });
}
