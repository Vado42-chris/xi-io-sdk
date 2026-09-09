import { compileLessonLearningCoverage } from '../lessons/promotion.mjs';
const NONBLANK = (value, max = 256) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const LESSON_STATES = Object.freeze(['CURRENT', 'CANDIDATE', 'FUTURE', 'UNKNOWN']);
const ACCESS_STATES = Object.freeze(['QUALIFIED', 'REFERENCE_ONLY', 'BLOCKED', 'UNKNOWN']);
const clone = value => JSON.parse(JSON.stringify(value));
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function providerCoverage(input) {
  const supplied = input.provider_registry;
  let registry = null;
  if (supplied != null) {
    if (typeof supplied !== 'object' || Array.isArray(supplied)) throw new TypeError('provider registry must be an object');
    requiredRef(supplied.ref, 'provider_registry.ref');
    requiredRef(supplied.generation, 'provider_registry.generation');
    const ids = supplied.required_provider_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 256 ||
        ids.some(id => typeof id !== 'string' || !PROVIDER_ID.test(id)) || new Set(ids).size !== ids.length) {
      throw new TypeError('provider registry denominator invalid');
    }
    registry = { ref: supplied.ref, generation: supplied.generation, required_provider_ids: [...ids] };
  }
  if (input.schema === 'xiio.sdk.ibal-canary/v2' && !registry) throw new TypeError('v2 requires supplied provider registry');
  if (!Array.isArray(input.provider_lessons) || input.provider_lessons.length > 256) throw new TypeError('provider lessons must be a bounded array');
  const seen = new Set();
  for (const item of input.provider_lessons) {
    if (typeof item?.provider !== 'string' || !PROVIDER_ID.test(item.provider) || seen.has(item.provider)) throw new TypeError('provider lesson identity invalid');
    if (registry && !registry.required_provider_ids.includes(item.provider)) throw new TypeError('provider lesson outside supplied denominator');
    seen.add(item.provider);
    requiredRef(item.lesson_ref, 'provider lesson ref');
    requiredRef(item.adapter_ref, 'provider adapter ref');
    if (!LESSON_STATES.includes(item.state)) throw new TypeError('provider lesson state unsupported');
  }
  return {
    registry,
    binding_state: registry ? 'SUPPLIED_UNVERIFIED' : 'UNBOUND',
    required_count: registry?.required_provider_ids.length ?? null,
    observed_count: seen.size,
    missing_provider_ids: registry ? registry.required_provider_ids.filter(id => !seen.has(id)) : null,
    unknown_provider_ids: input.provider_lessons.filter(item => item.state === 'UNKNOWN').map(item => item.provider),
    authenticated_registry_proof: false,
  };
}

function requiredRef(value, name) {
  if (!NONBLANK(value)) throw new TypeError(`${name} must be a bounded nonblank ref`);
  return value;
}


export function compileIbalCanary(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('ibal canary must be an object');
  if (!['xiio.sdk.ibal-canary/v1', 'xiio.sdk.ibal-canary/v2'].includes(input.schema)) throw new TypeError('schema unsupported');

  const root = input.root || {};
  ['work_ref', 'generation', 'product_id'].forEach(key => requiredRef(root[key], `root.${key}`));

  const bridge = input.bridge || {};
  ['switchboard_ref', 'glass_box_ref', 'operation_ref', 'bins_custody_ref'].forEach(key => requiredRef(bridge[key], `bridge.${key}`));
  if (bridge.effect_ceiling !== 'NO_EFFECT') throw new TypeError('SDK canary effect ceiling must be NO_EFFECT');

  const coverage = providerCoverage(input);

  const fractal = input.lesson_fractal || {};
  requiredRef(fractal.root_lesson_ref, 'lesson_fractal.root_lesson_ref');
  if (!Array.isArray(fractal.skill_refs) || fractal.skill_refs.length === 0 || fractal.skill_refs.some(ref => !NONBLANK(ref))) {
    throw new TypeError('lesson_fractal.skill_refs must be a non-empty ref set');
  }
  if (!Number.isInteger(fractal.recursion_depth) || !Number.isInteger(fractal.max_recursion_depth) ||
      fractal.recursion_depth < 0 || fractal.max_recursion_depth < 0 ||
      fractal.recursion_depth > fractal.max_recursion_depth || fractal.max_recursion_depth > 32) {
    throw new TypeError('lesson fractal recursion bounds invalid');
  }

  const exit = input.exit_loop || {};
  requiredRef(exit.exit_condition_ref, 'exit_loop.exit_condition_ref');
  requiredRef(exit.next_action_ref, 'exit_loop.next_action_ref');
  if (!Number.isInteger(exit.blast_counter) || !Number.isInteger(exit.max_blasts) ||
      exit.blast_counter < 0 || exit.max_blasts < 1 || exit.blast_counter > exit.max_blasts) {
    throw new TypeError('exit loop blast counter invalid');
  }
  if (!Number.isInteger(exit.timeout_ms) || exit.timeout_ms < 1 || exit.timeout_ms > 86_400_000) {
    throw new TypeError('exit loop timeout invalid');
  }
  if (!['RETURN', 'WAIT', 'BLOCKED'].includes(exit.on_exhaustion)) throw new TypeError('exit loop exhaustion state unsupported');

  const email = input.email || {};
  ['inbox_primitive_ref', 'ingress_capability_ref', 'egress_capability_ref', 'receipt_ref'].forEach(key => requiredRef(email[key], `email.${key}`));
  if (!ACCESS_STATES.includes(email.access_state)) throw new TypeError('email access state unsupported');
  if (email.provider_write_authorized !== false) throw new TypeError('SDK canary cannot grant email provider write authority');

  requiredRef(input.return_target_ref, 'return_target_ref');
  const learning = compileLessonLearningCoverage(input);

  const recursionExhausted = fractal.recursion_depth === fractal.max_recursion_depth;
  const blastExhausted = exit.blast_counter === exit.max_blasts;
  const blockers = [];
  if (!coverage.registry) blockers.push('PROVIDER_REGISTRY_UNBOUND');
  if (coverage.missing_provider_ids?.length) blockers.push('PROVIDER_LESSON_MISSING');
  if (coverage.unknown_provider_ids.length) blockers.push('PROVIDER_LESSON_UNKNOWN');
  if (learning.missing_stages.length) blockers.push(...learning.missing_stages.map(stage => `LEARNING_${stage}_UNKNOWN`));
  if (email.access_state !== 'QUALIFIED') blockers.push('EMAIL_ACCESS_NOT_QUALIFIED');
  if (recursionExhausted) blockers.push('RECURSION_LIMIT_REACHED');
  if (blastExhausted) blockers.push('BLAST_COUNTER_EXHAUSTED');

  return Object.freeze(clone({
    schema: 'xiio.sdk.ibal-canary-projection/v2',
    root,
    bridge,
    provider_lessons: input.provider_lessons,
    provider_coverage: coverage,
    lesson_fractal: {
      root_lesson_ref: fractal.root_lesson_ref,
      skill_refs: [...fractal.skill_refs],
      recursion_depth: fractal.recursion_depth,
      max_recursion_depth: fractal.max_recursion_depth,
      learning,
    },
    exit_loop: exit,
    email,
    return_target_ref: input.return_target_ref,
    readiness: blockers.length ? 'WAIT' : 'READY_FOR_SWITCHBOARD_PREFLIGHT',
    blockers,
    provider_denominator: coverage.required_count,
    effects: 0,
    authority_granted: false,
  }));
}
