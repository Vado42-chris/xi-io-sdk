import crypto from 'node:crypto';

export const LESSON_SCHEMA = 'xiio.sdk.lesson-promotion/v1';
export const LESSON_STATES = Object.freeze([
  'DISCOVERED',
  'SIMULATED',
  'PROVEN',
  'REBASED',
  'TRANSFERABLE',
  'PORTABLE',
  'ADOPTED',
]);

export const LESSON_CELLS = Object.freeze([
  'DISCOVERY_CAPTURED',
  'INVARIANT_GENERALIZED',
  'SDK_MATERIALIZED',
  'BINS_RECORDED',
  'ACK_DISTRIBUTED',
  'ADOPTER_PROVEN',
  'RETURN_REJOINED',
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function bool(value) {
  return value === true;
}

function pass(id, ok, blocker) {
  return { id, state: ok ? 'PASS' : 'BLOCKED', blocker: ok ? null : blocker };
}

export function compileLessonPromotion(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('lesson input must be an object');
  const origin = input.origin || {};
  const generalized = input.generalized || {};
  const sdk = input.sdk || {};
  const bins = input.bins || {};
  const ack = input.distributed_ack || {};
  const adopter = input.adopter || {};
  const returned = input.return || {};

  const lessonId = text(input.lesson_id, 'lesson_id');
  const proofTier = LESSON_STATES.includes(input.proof_tier) ? input.proof_tier : 'DISCOVERED';

  const cells = [
    pass('DISCOVERY_CAPTURED', !!origin.canary_ref && !!origin.repo_ref && !!origin.subject_generation && !!origin.failure_signature, 'ORIGIN_CANARY_INCOMPLETE'),
    pass('INVARIANT_GENERALIZED', !!generalized.invariant && Array.isArray(generalized.applies_to) && generalized.applies_to.length > 0, 'GENERALIZED_INVARIANT_MISSING'),
    pass('SDK_MATERIALIZED', !!sdk.change_ref && ['PRIMITIVE','CLI_COMMAND','HEURISTIC','SCHEMA','VALIDATOR','NO_CHANGE_WITH_EVIDENCE'].includes(sdk.change_type), 'SDK_DELTA_NOT_MATERIALIZED'),
    pass('BINS_RECORDED', !!bins.ledger_target_ref && !!bins.record_ref && !!bins.record_generation, 'BINS_LEDGER_RECORD_MISSING'),
    pass('ACK_DISTRIBUTED', bool(ack.required) && !!ack.ack_set_ref && Number(ack.target_denominator) > 0, 'DISTRIBUTED_ACK_NOT_PROVEN'),
    pass('ADOPTER_PROVEN', !!adopter.adopter_ref && !!adopter.proof_ref && ['PROVEN','REBASED','TRANSFERABLE','PORTABLE','ADOPTED'].includes(adopter.state), 'ADOPTER_PROOF_MISSING'),
    pass('RETURN_REJOINED', !!returned.return_ref && !!returned.apply_return_ref && bool(returned.current_readback), 'RETURN_REJOIN_INCOMPLETE'),
  ];

  const payload = {
    schema: LESSON_SCHEMA,
    lesson_id: lessonId,
    proof_tier: proofTier,
    origin: {
      canary_ref: origin.canary_ref || null,
      repo_ref: origin.repo_ref || null,
      subject_generation: origin.subject_generation || null,
      failure_signature: origin.failure_signature || null,
      owner_relay_required: origin.owner_relay_required === true,
    },
    generalized: {
      invariant: generalized.invariant || null,
      applies_to: Array.isArray(generalized.applies_to) ? [...new Set(generalized.applies_to)].sort() : [],
      anti_pattern: generalized.anti_pattern || null,
    },
    sdk: {
      change_type: sdk.change_type || null,
      change_ref: sdk.change_ref || null,
      command_ref: sdk.command_ref || null,
    },
    bins: {
      ledger_target_ref: bins.ledger_target_ref || null,
      record_ref: bins.record_ref || null,
      record_generation: bins.record_generation || null,
    },
    distributed_ack: {
      required: ack.required === true,
      ack_set_ref: ack.ack_set_ref || null,
      target_denominator: Number(ack.target_denominator || 0),
    },
    adopter: {
      adopter_ref: adopter.adopter_ref || null,
      state: adopter.state || null,
      proof_ref: adopter.proof_ref || null,
    },
    return: {
      return_ref: returned.return_ref || null,
      apply_return_ref: returned.apply_return_ref || null,
      current_readback: returned.current_readback === true,
    },
    punchcard: {
      denominator: LESSON_CELLS.length,
      pass: cells.filter((cell) => cell.state === 'PASS').length,
      blocked: cells.filter((cell) => cell.state === 'BLOCKED').length,
      cells,
      accounting_100: cells.length === LESSON_CELLS.length,
      closure_100: cells.every((cell) => cell.state === 'PASS'),
    },
    hard: [
      'DISCOVERY != LESSON',
      'LESSON != SDK_MATERIALIZATION',
      'SDK_MATERIALIZED != BINS_RECORDED',
      'BINS_RECORDED != ACK_DISTRIBUTED',
      'ACK_DISTRIBUTED != ADOPTION',
      'ADOPTION != RETURN_REJOIN',
      'CHAT_CAPTURED != DURABLE_LEARNING',
      'OWNER_RELAY_REQUIRED = META_PATTERN_NOT_CLOSED',
      'FLATPLANED_DISCOVERY != FORCE_MULTIPLIER',
    ],
  };

  return { ...payload, lesson_generation: sha(payload) };
}

export function assertLessonNotFlatplaned(lesson) {
  if (!lesson || lesson.schema !== LESSON_SCHEMA) throw new TypeError('lesson schema invalid');
  if (!lesson.punchcard?.closure_100) {
    const blockers = lesson.punchcard?.cells?.filter((cell) => cell.state !== 'PASS').map((cell) => cell.id) || [];
    throw new Error(`LESSON_FLATPLANED:${blockers.join(',')}`);
  }
  return true;
}
