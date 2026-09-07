const NONBLANK = (value, max = 256) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const PROVIDERS = Object.freeze(['CHATGPT', 'CLAUDE', 'GROK', 'CURSOR', 'ANTIGRAVITY', 'OLLAMA']);
const LESSON_STATES = Object.freeze(['CURRENT', 'CANDIDATE', 'FUTURE', 'UNKNOWN']);
const ACCESS_STATES = Object.freeze(['QUALIFIED', 'REFERENCE_ONLY', 'BLOCKED', 'UNKNOWN']);
const clone = value => JSON.parse(JSON.stringify(value));

function requiredRef(value, name) {
  if (!NONBLANK(value)) throw new TypeError(`${name} must be a bounded nonblank ref`);
  return value;
}

export function compileIbalCanary(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('ibal canary must be an object');
  if (input.schema !== 'xiio.sdk.ibal-canary/v1') throw new TypeError('schema unsupported');

  const root = input.root || {};
  ['work_ref', 'generation', 'product_id'].forEach(key => requiredRef(root[key], `root.${key}`));

  const bridge = input.bridge || {};
  ['switchboard_ref', 'glass_box_ref', 'operation_ref', 'bins_custody_ref'].forEach(key => requiredRef(bridge[key], `bridge.${key}`));
  if (bridge.effect_ceiling !== 'NO_EFFECT') throw new TypeError('SDK canary effect ceiling must be NO_EFFECT');

  if (!Array.isArray(input.provider_lessons) || input.provider_lessons.length !== PROVIDERS.length) {
    throw new TypeError('provider_lessons must contain the complete six-provider denominator');
  }
  const seen = new Set();
  for (const item of input.provider_lessons) {
    if (!PROVIDERS.includes(item?.provider) || seen.has(item.provider)) throw new TypeError('provider lesson denominator invalid');
    seen.add(item.provider);
    requiredRef(item.lesson_ref, `provider_lessons.${item.provider}.lesson_ref`);
    requiredRef(item.adapter_ref, `provider_lessons.${item.provider}.adapter_ref`);
    if (!LESSON_STATES.includes(item.state)) throw new TypeError('provider lesson state unsupported');
  }
  if (PROVIDERS.some(provider => !seen.has(provider))) throw new TypeError('provider lesson denominator incomplete');

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

  const providerUnknown = input.provider_lessons.filter(item => item.state === 'UNKNOWN').map(item => item.provider);
  const recursionExhausted = fractal.recursion_depth === fractal.max_recursion_depth;
  const blastExhausted = exit.blast_counter === exit.max_blasts;
  const blockers = [];
  if (providerUnknown.length) blockers.push('PROVIDER_LESSON_UNKNOWN');
  if (email.access_state !== 'QUALIFIED') blockers.push('EMAIL_ACCESS_NOT_QUALIFIED');
  if (recursionExhausted) blockers.push('RECURSION_LIMIT_REACHED');
  if (blastExhausted) blockers.push('BLAST_COUNTER_EXHAUSTED');

  return Object.freeze(clone({
    schema: 'xiio.sdk.ibal-canary-projection/v1',
    root,
    bridge,
    provider_lessons: input.provider_lessons,
    lesson_fractal: fractal,
    exit_loop: exit,
    email,
    return_target_ref: input.return_target_ref,
    readiness: blockers.length ? 'WAIT' : 'READY_FOR_SWITCHBOARD_PREFLIGHT',
    blockers,
    provider_denominator: PROVIDERS.length,
    effects: 0,
    authority_granted: false,
  }));
}
