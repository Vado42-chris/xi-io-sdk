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
  const requireTemporalRebase = input.require_temporal_rebase === true;
  const tenReducerRequired = input.ten_reducer_required !== false;
  if (requireTemporalRebase && typeof input.rebase !== 'function') throw new Error('BABYSIT_TEMPORAL_REBASE_ADAPTER_REQUIRED');

  let state = clone(input.initial_state);
  let stalled = 0;
  let adapterCalls = 0;
  let lastObservedAt = null;
  let currentTen = [];
  const directives = [];
  const bugs = new Set();
  const temporalRebases = [];
  const tenReceipts = [];
  const hotpatchReceipts = [];

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (typeof input.rebase === 'function') {
      let rebased;
      try {
        rebased = await input.rebase({ iteration, state: clone(state), previous_observed_at: lastObservedAt });
      } catch (error) {
        throw new Error('BABYSIT_TEMPORAL_REBASE_ERROR:' + (error?.message || String(error)));
      }
      if (!rebased || typeof rebased !== 'object' || Array.isArray(rebased)) throw new Error('BABYSIT_TEMPORAL_REBASE_INVALID');
      if (!rebased.state || typeof rebased.state !== 'object' || Array.isArray(rebased.state)) throw new Error('BABYSIT_TEMPORAL_REBASE_STATE_INVALID');
      const observedAt = String(rebased.observed_at || '').trim();
      const observedMs = Date.parse(observedAt);
      if (!observedAt || !Number.isFinite(observedMs)) throw new Error('BABYSIT_TEMPORAL_REBASE_TIME_INVALID');
      if (lastObservedAt && observedMs < Date.parse(lastObservedAt)) throw new Error('BABYSIT_TEMPORAL_REBASE_TIME_REGRESSION');
      if (rebased.meter_required === true && !rebased.meter_state) throw new Error('BABYSIT_METER_STATE_REQUIRED');
      lastObservedAt = observedAt;
      state = clone(rebased.state);
      temporalRebases.push({
        iteration,
        observed_at: observedAt,
        deadline_at: rebased.deadline_at || null,
        remaining_ms: Number.isFinite(Number(rebased.remaining_ms)) ? Number(rebased.remaining_ms) : null,
        meter_state: rebased.meter_state || null,
        billing_mode: rebased.billing_mode || null,
      });
    }

    if (adapterCalls > 0 && adapterCalls % 10 === 0 && currentTen.length === 10) {
      if (tenReducerRequired && typeof input.reduce_ten !== 'function') throw new Error('BABYSIT_TEN_REDUCER_REQUIRED');
      if (typeof input.reduce_ten === 'function') {
        let receipt;
        try {
          receipt = await input.reduce_ten({
            ten_index: adapterCalls / 10,
            state: clone(state),
            steps: clone(currentTen),
            observed_at: lastObservedAt,
          });
        } catch (error) {
          throw new Error('BABYSIT_TEN_REDUCER_ERROR:' + (error?.message || String(error)));
        }
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('BABYSIT_TEN_REDUCER_INVALID');
        tenReceipts.push(clone(receipt));
        if (receipt.hotpatch_required === true) {
          if (typeof input.hotpatch !== 'function') throw new Error('BABYSIT_PRESSURE_HOTPATCH_REQUIRED');
          let patched;
          try {
            patched = await input.hotpatch({ state: clone(state), ten_receipt: clone(receipt), observed_at: lastObservedAt });
          } catch (error) {
            throw new Error('BABYSIT_PRESSURE_HOTPATCH_ERROR:' + (error?.message || String(error)));
          }
          if (!patched || typeof patched !== 'object' || Array.isArray(patched)) throw new Error('BABYSIT_PRESSURE_HOTPATCH_INVALID');
          state = clone(patched.state || patched);
          hotpatchReceipts.push(clone(patched.receipt || { ten_index: adapterCalls / 10, state: 'APPLIED' }));
          let reread;
          try {
            reread = await input.reduce_ten({
              ten_index: adapterCalls / 10,
              state: clone(state),
              steps: clone(currentTen),
              observed_at: lastObservedAt,
              after_hotpatch: true,
            });
          } catch (error) {
            throw new Error('BABYSIT_TEN_REDUCER_REREAD_ERROR:' + (error?.message || String(error)));
          }
          if (!reread || reread.hotpatch_required === true || reread.collapse_to_1 !== true) throw new Error('BABYSIT_TEN_NOT_COLLAPSED_AFTER_HOTPATCH');
          tenReceipts.push(clone(reread));
        } else if (receipt.collapse_to_1 !== true) {
          throw new Error('BABYSIT_TEN_NOT_COLLAPSED');
        }
      }
      currentTen = [];
    }

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
        temporal_rebase_count: temporalRebases.length,
        temporal_rebases: temporalRebases,
        ten_receipts: tenReceipts,
        hotpatch_receipts: hotpatchReceipts,
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
          'TEMPORAL_REBASE_REQUIRED_WHEN_DEADLINE_OR_METER_BOUND',
          'EVERY_TEN_REDUCES_MICRO_MESO_MACRO_MEGA_META_BEFORE_CHILD_11',
          'STACK_LATENCY_OR_TEAM_PRESSURE -> HOTPATCH_BEFORE_NEXT_TEN',
          'HOTPATCH_REQUIRED != TEN_COLLAPSED',
          'METER_EVENT != MONEY',
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
    currentTen.push({
      iteration,
      action: directive.next_packet?.action || null,
      work_ref: directive.next_packet?.work_ref || null,
      before_digest: before,
      after_digest: stable(next),
    });

    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('BABYSIT_HOST_ADAPTER_STATE_INVALID');
    const after = stable(next);
    if (after === before) stalled += 1;
    else stalled = 0;
    if (stalled >= stallLimit) throw new Error('BABYSIT_STALLED_STATE');

    state = clone(next);
  }

  throw new Error('BABYSIT_MAX_ITERATIONS_WITHOUT_ALLOWED_STOP');
}
