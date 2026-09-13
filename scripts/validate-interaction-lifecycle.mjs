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
  const result = compileInteractionLifecycle(base({
    disclosure: { source_visibility: 'PRIVATE', target_visibility: 'PUBLIC' },
  }));
  assert(result.failures.includes('PRIVATE_TO_PUBLIC_WITHOUT_DISCLOSURE_QUALIFICATION'));
  assert.equal(result.next_action, 'QUALIFY_DISCLOSURE');
});

test('result cannot close without burndown', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    close: { result_ref: 'result:1' },
  }));
  assert(result.failures.includes('INTERACTION_WITHOUT_CLOSE_BURNDOWN'));
  assert.equal(result.next_action, 'COMPILE_RETURN');
});

test('post-result lifecycle is ordered through return apply reap rejoin readback', () => {
  const shared = {
    machine_resolvable_next: false,
    close: { result_ref: 'result:1', burndown_receipt_ref: 'receipt:burndown:1' },
  };
  let result = compileInteractionLifecycle(base(shared));
  assert.equal(result.next_action, 'COMPILE_RETURN');

  result = compileInteractionLifecycle(base({
    ...shared,
    close: { ...shared.close, return_ref: 'return:1' },
  }));
  assert.equal(result.next_action, 'APPLY_RETURN');

  result = compileInteractionLifecycle(base({
    ...shared,
    close: { ...shared.close, return_ref: 'return:1', apply_return_ref: 'apply:1' },
  }));
  assert.equal(result.next_action, 'REAP');

  result = compileInteractionLifecycle(base({
    ...shared,
    close: { ...shared.close, return_ref: 'return:1', apply_return_ref: 'apply:1', reap_ref: 'reap:1' },
  }));
  assert.equal(result.next_action, 'REJOIN');

  result = compileInteractionLifecycle(base({
    ...shared,
    close: { ...shared.close, return_ref: 'return:1', apply_return_ref: 'apply:1', reap_ref: 'reap:1', rejoin_ref: 'rejoin:1' },
  }));
  assert.equal(result.next_action, 'VERIFY_CURRENT_READBACK');
});

test('fully closed interaction can be current without claiming provider effect', () => {
  const result = compileInteractionLifecycle(base({
    machine_resolvable_next: false,
    close: {
      result_ref: 'result:1',
      burndown_receipt_ref: 'receipt:burndown:1',
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    },
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
    close: {
      result_ref: 'result:1',
      burndown_receipt_ref: 'receipt:burndown:1',
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    },
  }));
  assert.equal(result.root_stop_allowed, false);
  assert.equal(result.next_action, 'CONTINUE_RUNNABLE_SIBLING');
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
    close: {
      result_ref: 'result:1',
      burndown_receipt_ref: 'receipt:burndown:1',
      return_ref: 'return:1',
      apply_return_ref: 'apply:1',
      reap_ref: 'reap:1',
      rejoin_ref: 'rejoin:1',
      current_readback_ref: 'readback:current:1',
    },
  }));
  assert(result.failures.includes('CHILD_CLOSE_DENOMINATOR_INCOMPLETE'));
  assert.equal(result.next_action, 'RESOLVE_CHILD_CLOSE_DENOMINATOR');
  assert.equal(result.root_stop_allowed, false);
});

assert.equal(passed, 12);
console.log(JSON.stringify({
  status: 'PASS',
  denominator: passed,
  cadence_policy_ref: CADENCE_POLICY,
  provider_effects: 0,
  authority_granted: false,
  owner_heartbeat_required: 0,
}));
