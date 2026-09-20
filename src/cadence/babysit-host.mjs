import { compileContinuationDirective } from './self-drive.mjs';

export const BABYSIT_HOST_RUN_SCHEMA = 'xiio.sdk.babysit-host-run/v1';

function clone(value) {
  return structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function integer(value, fallback, min, max, label) {
  const next = value ?? fallback;
  if (!Number.isInteger(next) || next < min || next > max) throw new Error(label + '_INVALID');
  return next;
}

export async function runBabysitHost(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BABYSIT_INPUT_INVALID');
  if (!input.initial_state || typeof input.initial_state !== 'object' || Array.isArray(input.initial_state)) {
    throw new Error('BABYSIT_INITIAL_STATE_REQUIRED');
  }
  if (typeof input.step !== 'function') throw new Error('BABYSIT_HOST_ADAPTER_REQUIRED');

  const maxIterations = integer(input.max_iterations, 100, 1, 10_000, 'BABYSIT_MAX_ITERATIONS');
  const stallLimit = integer(input.stall_limit, 2, 1, 100, 'BABYSIT_STALL_LIMIT');

  let state = clone(input.initial_state);
  let stalled = 0;
  let adapterCalls = 0;
  const directives = [];
  const bugs = new Set();

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const directive = compileContinuationDirective(state);
    directives.push({ iteration, directive: clone(directive) });
    for (const bug of directive.bugs ?? []) bugs.add(bug);

    if (directive.yield_allowed) {
      return Object.freeze({
        schema: BABYSIT_HOST_RUN_SCHEMA,
        status: bugs.size ? 'FAIL_CURRENT' : 'CURRENT',
        loop_state: directive.stop_class,
        terminal: directive.stop_class === 'TERMINAL',
        yield_allowed: true,
        iterations: directives.length,
        directive_count: directives.length,
        adapter_calls: adapterCalls,
        bugs: [...bugs],
        final_state: clone(state),
        final_directive: clone(directive),
        directives,
        effects: 0,
        effect_authority: false,
        effect_ceiling: 'SDK_PROJECTION_ONLY__HOST_MUST_ENFORCE_EFFECT_AUTHORITY',
        hard: [
          'REPORT != LOOP_EXIT',
          'RESULT != LOOP_EXIT',
          'HOST_CONTINUE_REQUIRED -> HOST_ADAPTER_STEP',
          'RUNNABLE_SIBLING -> CONTINUE_WITHOUT_OWNER',
          'TRUE_WAIT | OWNER_ONLY | TERMINAL -> YIELD_ALLOWED',
          'UNCHANGED_STATE_REPEAT -> STALL_FAIL_CLOSED',
          'MAX_ITERATIONS != TERMINAL',
          'SDK_BABYSIT_HOST != EFFECT_AUTHORITY',
        ],
      });
    }

    if (!directive.continue_without_owner || !directive.next_packet) {
      throw new Error('BABYSIT_CONTINUE_PACKET_MISSING');
    }

    const before = stable(state);
    let next;
    try {
      next = await input.step({
        iteration,
        state: clone(state),
        directive: clone(directive),
        packet: clone(directive.next_packet),
      });
    } catch (error) {
      throw new Error('BABYSIT_HOST_ADAPTER_ERROR:' + (error?.message || String(error)));
    }
    adapterCalls += 1;

    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('BABYSIT_HOST_ADAPTER_STATE_INVALID');
    const after = stable(next);
    if (after === before) stalled += 1;
    else stalled = 0;
    if (stalled >= stallLimit) throw new Error('BABYSIT_STALLED_STATE');

    state = clone(next);
  }

  throw new Error('BABYSIT_MAX_ITERATIONS_WITHOUT_ALLOWED_STOP');
}
