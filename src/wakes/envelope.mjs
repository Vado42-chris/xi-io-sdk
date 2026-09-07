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
  const ordered = ['delivered', 'acked', 'started', 'returned', 'consumed'];
  let previous = true;
  const result = {};
  for (const key of ordered) {
    const evidenced = observations[key] === true;
    result[key] = previous && evidenced;
    previous = result[key];
  }
  const falseGreen = ordered.some((key, index) =>
    observations[key] === true && ordered.slice(0, index).some(parent => observations[parent] !== true)
  );
  return Object.freeze({
    schema: 'xiio.sdk.wake-progress/v1',
    wake_id: wake.wake_id,
    generation: wake.generation,
    target: wake.target,
    ...result,
    applied: result.consumed && observations.applied === true,
    false_green: falseGreen,
    terminal: observations.not_applicable === true ? 'NOT_APPLICABLE' : result.consumed && observations.applied === true ? 'APPLIED' : 'OPEN',
  });
}
