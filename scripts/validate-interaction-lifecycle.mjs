#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileInteractionLifecycle } from '../src/cadence/interaction-lifecycle.mjs';

const CADENCE_POLICY = 'Vado42-chris/xi-io-cadence@6df685b27325b98ee0cb5aa189050b19e87275c2';

function base(overrides = {}) {
  return {
    interaction_id: 'interaction:known-answer:001',
    actor_ref: 'agent:ibal:test',
    root_ref: 'xiio:work:root-001',
    return_target_ref: 'xiio:return:root-001',
    cadence_policy_ref: CADENCE_POLICY,
    accepted_base_ref: 'repo:main@g1',
    opened_current_ref: 'repo:main@g1',
    latest_current_ref: 'repo:main@g1',
    standup_receipt_ref: 'receipt:standup:001',
    collision_ref: 'receipt:collision:one-writer',
    first_red_ref: 'red:first:001',
    effect_ceiling: 'SOURCE_ONLY',
    known_hostile_refs: ['hostile:last-night:stale-currentness'],
    expected_result: 'RESULT_SOURCE_CANDIDATE',
    sibling_policy: 'BLOCKED_CHILD_DOES_NOT_STOP_RUNNABLE_SIBLING',
    provider_projection_refs: ['github:issue:16'],
    disclosure: { source_visibility: 'INTERNAL', target_visibility: 'INTERNAL' },
    child_denominator: 0,
    children: [],
    siblings: [],
    owner_heartbeat_count: 0,
    machine_resolvable_next: true,
    ...overrides,
  };
}

function closeAccounting(overrides = {}) {
  return {
    result_ref: 'result:1',
    burndown_receipt_ref: 'receipt:burndown:1',
    denominator_delta_ref: 'receipt:denominator-delta:1',
    verification_refs: ['receipt:verification:1'],
    failure_refs: [],
    thrash_refs: [],
    learning_refs: ['lesson:overnight:1'],
    owner_load_ref: 'receipt:owner-load:1',
    remaining_red_refs: [],
    terminal_ref: 'terminal:interaction-only:1',
    ...overrides,
  };
}

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
};

test('current open interaction is machine-continuable', () => {
  const result = compileInteractionLifecycle(base());
  assert.equal(result.status, 'OPEN_CURRENT');
  assert.equal(result.next_action, 'CONTINUE_MACHINE_RESOLVABLE_NEXT');
  assert.equal(result.root_stop_allowed, false);
  assert.equal(result.provider_effect, false);
  assert.equal(result.authority_granted, false);
});

test('missing standup is a 10s failure', () => {
  const result = compileInteractionLifecycle(base({ standup_receipt_ref: null }));
  assert.equal(result.status, 'FAIL_CURRENT');
  assert(result.failures.includes('INTERACTION_WITHOUT_OPEN_STANDUP'));
  assert.equal(result.next_action, 'OPEN_STANDUP');
});

test('provider movement invalidates the open interaction', () => {
  const result = compileInteractionLifecycle(base({ latest_current_ref: 'repo:main@g2' }));
  assert.equal(result.rebase_required, true);
  assert(result.failures.includes('CURRENTNESS_MOVED_REBASE_REQUIRED'));
  assert.equal(result.next_action, 'REBASE_CURRENT_TRUTH');
});

test('provider projection cannot alias canonical root identity', () => {
  const result = compileInteractionLifecycle(base({ provider_projection_refs: ['xiio:work:root-001'] }));
  assert(result.failures.includes('PROVIDER_PROJECTION_ALIASES_CANONICAL_IDENTITY'));
  assert.equal(result.next_action, 'RESOLVE_CANONICAL_IDENTITY');
});

test('owner heartbeat is a failure when work is machine-resolvable', () => {
  const result = compileInteractionLifecycle(base({ owner_heartbeat_count: 1 }));
  assert(result.failures.includes('OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT'));
  assert.equal(result.next_action, 'CONTINUE_MACHINE_RESOLVABLE_NEXT');
});

test('team child open denominator may not silently omit one child', () => {
  const result = compileInteractionLifecycle(base({
    child_denominator: 3,
    children: [
      { child_ref: 'child:a', open_receipt_ref: 'ack:a', disposition: 'ACTIVE' },
      { child_ref: 'child:b', open_receipt_ref: 'ack:b', disposition: 'ACTIVE' },
      { child_ref: 'child:c', disposition: 'ACTIVE' },
    ],
  }));
  assert(result.failures.includes('CHILD_OPEN_DENOMINATOR_INCOMPLETE'));
  assert.equal(result.next_action, 'RESOLVE_CHILD_OPEN_DENOMINATOR');
});

test('private source cannot project public without disclosure qualification', () => {
  const result = compileInteractionLifecycle(base({ disclosure: { source_visibility: 'PRIVATE', target_visibility: 'PUBLIC' } }));
  assert(result.failures.includes('PRIVATE_TO_PUBLIC_WITHOUT_DISCLOSURE_QUALIFICATION'));
  assert.equal(result.next_action, 'QUALIFY_DISCLOSURE');
});

test('result must close burndown before return', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    close: { result_ref: 'result:1' },
  }));
  assert(result.failures.includes('INTERACTION_WITHOUT_CLOSE_BURNDOWN'));
  assert.equal(result.next_action, 'CLOSE_BURNDOWN');
});

test('burndown must account denominator verification owner load and next state', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    close: { result_ref: 'result:1', burndown_receipt_ref: 'receipt:burndown:1' },
  }));
  assert(result.failures.includes('CLOSE_WITHOUT_DENOMINATOR_DELTA'));
  assert(result.failures.includes('CLOSE_WITHOUT_VERIFICATION'));
  assert(result.failures.includes('CLOSE_WITHOUT_OWNER_LOAD_ACCOUNTING'));
  assert(result.failures.includes('CLOSE_WITHOUT_NEXT_WAIT_OR_TERMINAL'));
  assert.equal(result.next_action, 'COMPLETE_BURNDOWN_ACCOUNTING');
});

test('post-result lifecycle is ordered return apply reap rejoin readback', () => {
  const shared = { machine_resolvable_next: false };
  let result = compileInteractionLifecycle(base({ ...shared, close: closeAccounting() }));
  assert.equal(result.next_action, 'COMPILE_RETURN');

  result = compileInteractionLifecycle(base({ ...shared, close: closeAccounting({ return_ref: 'return:1' }) }));
  assert.equal(result.next_action, 'APPLY_RETURN');

  result = compileInteractionLifecycle(base({ ...shared, close: closeAccounting({ return_ref: 'return:1', apply_return_ref: 'apply:1' }) }));
  assert.equal(result.next_action, 'REAP');

  result = compileInteractionLifecycle(base({ ...shared, close: closeAccounting({ return_ref: 'return:1', apply_return_ref: 'apply:1', reap_ref: 'reap:1' }) }));
  assert.equal(result.next_action, 'REJOIN');

  result = compileInteractionLifecycle(base({ ...shared, close: closeAccounting({ return_ref: 'return:1', apply_return_ref: 'apply:1', reap_ref: 'reap:1', rejoin_ref: 'rejoin:1' }) }));
  assert.equal(result.next_action, 'VERIFY_CURRENT_READBACK');
});

test('fully closed terminal interaction can close without provider effect', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    close: closeAccounting({
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    }),
  }));
  assert.equal(result.status, 'CLOSED_CURRENT');
  assert.equal(result.root_stop_allowed, true);
  assert.equal(result.provider_effect, false);
});

test('blocked sibling never masks runnable sibling', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    siblings: [
      { work_ref: 'work:blocked', state: 'TRUE_WAIT', wake_ref: 'wake:external' },
      { work_ref: 'work:runnable', state: 'RUNNABLE', machine_resolvable: true },
    ],
    close: closeAccounting({
      terminal_ref: null,
      next_ref: 'work:runnable',
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    }),
  }));
  assert.equal(result.root_stop_allowed, false);
  assert.equal(result.next_action, 'CONTINUE_RUNNABLE_SIBLING');
});

test('owner-only sibling prevents root-stop after local close', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    siblings: [{ work_ref: 'work:owner', state: 'OWNER_ONLY', owner_required: true }],
    close: closeAccounting({
      terminal_ref: null,
      wait_ref: 'wait:owner-decision',
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    }),
  }));
  assert.equal(result.status, 'CLOSED_CURRENT');
  assert.equal(result.root_stop_allowed, false);
});

test('three child closes require all three child close dispositions', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    child_denominator: 3,
    children: [
      { child_ref: 'child:a', open_receipt_ref: 'ack:a', close_receipt_ref: 'close:a', disposition: 'ACTIVE' },
      { child_ref: 'child:b', open_receipt_ref: 'ack:b', close_receipt_ref: 'close:b', disposition: 'ACTIVE' },
      { child_ref: 'child:c', open_receipt_ref: 'ack:c', disposition: 'ACTIVE' },
    ],
    close: closeAccounting({
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    }),
  }));
  assert(result.failures.includes('CHILD_CLOSE_DENOMINATOR_INCOMPLETE'));
  assert.equal(result.next_action, 'RESOLVE_CHILD_CLOSE_DENOMINATOR');
  assert.equal(result.root_stop_allowed, false);
});

assert.equal(passed, 14);
console.log(JSON.stringify({
  status: 'PASS',
  denominator: passed,
  cadence_policy_ref: CADENCE_POLICY,
  provider_effects: 0,
  authority_granted: false,
  owner_heartbeat_required: 0,
}));
