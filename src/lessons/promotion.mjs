import crypto from 'node:crypto';

export const LESSON_SCHEMA = 'xiio.sdk.lesson-promotion/v1';
export const LESSON_STATES = Object.freeze([
  'UNVERIFIED',
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
  return { id, state: ok ? 'SUPPLIED_UNVERIFIED' : 'BLOCKED', supplied: ok, verified: false, blocker: ok ? 'AUTHENTICATED_EVIDENCE_REQUIRED' : blocker };
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

  const learning = compileLessonLearningCoverage({
    lesson_fractal: { root_lesson_ref: lessonId, skill_refs: Array.isArray(generalized.skill_refs) ? generalized.skill_refs.map(ref => text(ref, 'skill_ref')) : [], learning: input.learning },
    bridge: { bins_custody_ref: bins.ledger_target_ref || null },
    return_target_ref: returned.target_ref || null,
    exit_loop: { next_action_ref: input.cadence?.next_action_ref || null },
  });
  const blockers = [
    ...(origin.owner_relay_required === true ? ['OWNER_RELAY_REQUIRED'] : []),
    ...cells.filter(cell => !cell.supplied).map(cell => cell.blocker),
    ...learning.missing_stages.map(stage => `LEARNING_${stage}_UNKNOWN`),
    'LESSON_VERIFICATION_REQUIRED',
  ];

  const payload = {
    schema: LESSON_SCHEMA,
    lesson_id: lessonId,
    proof_tier: 'UNVERIFIED',
    declared_proof_tier: proofTier,
    evidence_state: 'SUPPLIED_UNVERIFIED',
    authority_granted: false,
    provider_effect: false,
    learning,
    blockers,
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
      supplied: cells.filter((cell) => cell.supplied).length,
      unverified: cells.filter((cell) => cell.state === 'SUPPLIED_UNVERIFIED').length,
      closure_100: false,
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
  // This public module has no authenticated evidence verifier. A caller cannot
  // turn its supplied projection into closure by editing booleans or digests.
  throw new Error('LESSON_FLATPLANED:AUTHENTICATED_EVIDENCE_REQUIRED');
}

const NONBLANK = (value, max = 256) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
function requiredRef(value, name) { if (!NONBLANK(value)) throw new TypeError(`${name} must be a bounded nonblank ref`); return value.trim(); }
export function compileLessonLearningCoverage(input) {
  const fractal = input.lesson_fractal;
  const supplied = fractal.learning;
  if (supplied != null && (typeof supplied !== 'object' || Array.isArray(supplied))) {
    throw new TypeError('lesson learning must be an object');
  }
  const learning = supplied || {};
  const optionalRef = value => value == null ? null : requiredRef(value, 'learning evidence');
  const generation = optionalRef(learning.generation);
  const author = optionalRef(learning.author_worker_ref);
  const stages = [];
  function stage(id, ref, fields = {}, prerequisites = true) {
    const knownRef = optionalRef(ref);
    const supplied = Boolean(generation && knownRef && prerequisites);
    stages.push({
      stage: id,
      state: supplied ? 'SUPPLIED_UNVERIFIED' : 'UNKNOWN',
      reason: supplied ? 'AUTHENTICATED_EVIDENCE_REQUIRED' : `${id}_BINDING_MISSING`,
      ref: knownRef,
      generation,
      ...fields,
      verified: false,
    });
  }
  function receipt(value) {
    if (value == null) return { ref: null, generation: null };
    if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('learning receipt must be an object');
    const ref = optionalRef(value.ref);
    const evidenceGeneration = optionalRef(value.generation);
    if (generation && evidenceGeneration && generation !== evidenceGeneration) throw new TypeError('learning receipt generation mismatch');
    return { ref, generation: evidenceGeneration };
  }
  stage('OBSERVATION', learning.observation_ref);
  stage('SHARED_PRIMITIVE', learning.shared_primitive_ref, { root_lesson_ref: fractal.root_lesson_ref, skill_refs: [...fractal.skill_refs] }, fractal.skill_refs.length > 0);
  const bins = receipt(learning.bins_receipt);
  stage('BINS_PERSISTENCE', bins.ref, { custody_ref: input.bridge.bins_custody_ref }, Boolean(bins.generation));
  const peer = receipt(learning.peer_replay);
  const peerWorker = optionalRef(learning.peer_replay?.worker_ref);
  if (author && peerWorker && author === peerWorker) throw new TypeError('peer replay requires a distinct worker');
  stage('INDEPENDENT_PEER_REPLAY', peer.ref, { author_worker_ref: author, peer_worker_ref: peerWorker }, Boolean(peer.generation && author && peerWorker));
  const returned = receipt(learning.affected_return);
  const target = optionalRef(learning.affected_return?.target_ref);
  if (target && target !== input.return_target_ref) throw new TypeError('learning return target mismatch');
  stage('AFFECTED_RETURN', returned.ref, { target_ref: input.return_target_ref }, Boolean(returned.generation && target));
  const wake = receipt(learning.cadence_wake);
  const next = optionalRef(learning.cadence_wake?.next_action_ref);
  if (next && next !== input.exit_loop.next_action_ref) throw new TypeError('learning cadence action mismatch');
  stage('NEXT_CADENCE_WAKE', wake.ref, { next_action_ref: input.exit_loop.next_action_ref }, Boolean(wake.generation && next));
  const missing = stages.filter(item => item.state === 'UNKNOWN').map(item => item.stage);
  return {
    schema: 'xiio.sdk.lesson-learning-coverage/v1',
    root_lesson_ref: fractal.root_lesson_ref,
    generation,
    stage_denominator: stages.length,
    supplied_stages: stages.length - missing.length,
    verified_stages: 0,
    missing_stages: missing,
    state: missing.length ? 'WAIT_EVIDENCE' : 'WAIT_VERIFICATION',
    closed: false,
    authority_granted: false,
    stages,
  };
}
