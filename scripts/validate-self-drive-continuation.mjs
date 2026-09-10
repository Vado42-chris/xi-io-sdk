#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileContinuationDirective, compileContinuationLoop } from '../src/cadence/self-drive.mjs';

const base = () => ({
  root_ref: 'root:cli-dogfood',
  worker_ref: 'agent:cli',
  subject_generation: 'g1',
  current_generation: 'g1',
  phase_event: 'POST_RESULT',
  pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [],
  returns: [],
  residue: [],
  occurrences: [],
  worker_inbox: { ref: 'inbox:agent:cli', current: true, actionable_count: 0 },
  async_continuation_required: true,
  owner_heartbeat_count: 0,
});

const test = (name, fn) => {
  fn();
  process.stdout.write(`PASS ${name}\n`);
};

test('RESULT_WITH_RUNNABLE_WORK_EMITS_NEXT_PACKET_NOT_YIELD', () => {
  const input = base();
  input.backlog = [{ id: 'C2', state: 'RUNNABLE', priority: 2 }];
  const result = compileContinuationDirective(input);
  assert.equal(result.cycle_disposition, 'CONTINUE_WORK');
  assert.equal(result.stop_class, 'CONTINUE');
  assert.equal(result.yield_allowed, false);
  assert.equal(result.continue_without_owner, true);
  assert.equal(result.next_packet.action, 'EXECUTE_WORK');
  assert.equal(result.next_packet.work_ref, 'C2');
  assert.equal(result.next_packet.owner_ingress_required, false);
});

test('HIGHEST_ELIGIBLE_PRIORITY_IS_SELECTED', () => {
  const input = base();
  input.backlog = [
    { id: 'C3', state: 'RUNNABLE', priority: 3 },
    { id: 'C2', state: 'RUNNABLE', priority: 2 },
  ];
  const result = compileContinuationDirective(input);
  assert.equal(result.next_packet.work_ref, 'C2');
});

test('BLOCKED_PROVIDER_LEAF_DOES_NOT_STOP_RUNNABLE_SIBLING', () => {
  const input = base();
  input.backlog = [
    { id: 'provider-leaf', state: 'BLOCKED', priority: 1, wake_when: 'provider://capacity/available' },
    { id: 'safe-sibling', state: 'RUNNABLE', priority: 2 },
  ];
  const result = compileContinuationDirective(input);
  assert.equal(result.stop_class, 'CONTINUE');
  assert.equal(result.next_packet.work_ref, 'safe-sibling');
});

test('BLOCKED_MACHINE_RESOLVABLE_LEAF_IS_NOT_ROOT_STOP', () => {
  const input = base();
  input.backlog = [{
    id: 'storage-classification', state: 'BLOCKED', machine_resolvable: true, wake_when: 'machine://storage/classify',
  }];
  const result = compileContinuationDirective(input);
  assert.equal(result.stop_class, 'CONTINUE');
  assert.equal(result.next_packet.action, 'RESOLVE_BLOCKER');
  assert.equal(result.yield_allowed, false);
});

test('TRUE_WAIT_REQUIRES_EXACT_WAKE', () => {
  const input = base();
  input.backlog = [{ id: 'provider-return', state: 'TRUE_WAIT', wake_when: 'provider://return/occurrence-7' }];
  const result = compileContinuationDirective(input);
  assert.equal(result.stop_class, 'TRUE_WAIT');
  assert.equal(result.yield_allowed, true);
  assert.equal(result.waits[0].wake_when, 'provider://return/occurrence-7');
});

test('WAIT_WITHOUT_WAKE_STAYS_MACHINE_CONTINUE', () => {
  const input = base();
  input.backlog = [{ id: 'mystery-wait', state: 'WAIT' }];
  const result = compileContinuationDirective(input);
  assert.equal(result.stop_class, 'CONTINUE');
  assert.equal(result.next_packet.action, 'RESOLVE_BLOCKER');
  assert.equal(result.yield_allowed, false);
});

test('OWNER_ONLY_CAN_STOP_ONLY_WITH_NO_MACHINE_SIBLING', () => {
  const input = base();
  input.backlog = [{ id: 'owner-choice', state: 'OWNER_ONLY', owner_required: true, wake_when: 'owner://decision/choice' }];
  const result = compileContinuationDirective(input);
  assert.equal(result.stop_class, 'OWNER_ONLY');
  assert.equal(result.yield_allowed, true);
});

test('OWNER_HEARTBEAT_FOR_RUNNABLE_NEXT_IS_FAIL_CURRENT', () => {
  const input = base();
  input.owner_heartbeat_count = 1;
  input.backlog = [{ id: 'C2', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationDirective(input);
  assert.equal(result.owner_heartbeat_bug, true);
  assert.equal(result.status, 'FAIL_CURRENT');
  assert.equal(result.bug, 'OWNER_HEARTBEAT_FOR_MACHINE_RESOLVABLE_NEXT');
  assert.equal(result.yield_allowed, false);
});

test('TERMINAL_FIXED_POINT_IS_ALLOWED_STOP', () => {
  const result = compileContinuationDirective(base());
  assert.equal(result.stop_class, 'TERMINAL');
  assert.equal(result.yield_allowed, true);
  assert.equal(result.next_packet, null);
});

test('LOOP_EATS_AGAIN_UNTIL_TRUE_WAIT', () => {
  const first = base();
  first.backlog = [{ id: 'C2', state: 'RUNNABLE', priority: 1 }];
  const second = base();
  second.backlog = [
    { id: 'provider-leaf', state: 'BLOCKED', wake_when: 'provider://capacity/available' },
    { id: 'C3', state: 'RUNNABLE', priority: 1 },
  ];
  const third = base();
  third.backlog = [{ id: 'external-return', state: 'TRUE_WAIT', wake_when: 'provider://return/C3' }];
  const result = compileContinuationLoop({ cycles: [first, second, third] });
  assert.equal(result.iterations, 3);
  assert.equal(result.loop_state, 'TRUE_WAIT');
  assert.equal(result.yield_allowed, true);
  assert.equal(result.owner_heartbeat_bug, false);
  assert.equal(result.directives[0].next_packet.work_ref, 'C2');
  assert.equal(result.directives[1].next_packet.work_ref, 'C3');
});

test('ONE_RUNNABLE_CYCLE_NEVER_PRETENDS_TO_BE_SAFE_YIELD', () => {
  const first = base();
  first.backlog = [{ id: 'C2', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationLoop({ cycles: [first] });
  assert.equal(result.loop_state, 'HOST_CONTINUE_REQUIRED');
  assert.equal(result.yield_allowed, false);
  assert.equal(result.awaiting_host_action, true);
  assert.equal(result.next_packet.work_ref, 'C2');
});

test('LOOP_REJECTS_EVENTS_AFTER_ALLOWED_STOP', () => {
  const wait = base();
  wait.backlog = [{ id: 'external-return', state: 'TRUE_WAIT', wake_when: 'provider://return/1' }];
  const extra = base();
  extra.backlog = [{ id: 'should-not-run', state: 'RUNNABLE' }];
  assert.throws(() => compileContinuationLoop({ cycles: [wait, extra] }), /CONTINUATION_LOOP_EVENT_AFTER_STOP:TRUE_WAIT/);
});

console.log(JSON.stringify({
  status: 'PASS',
  cases: 12,
  effects: 0,
  owner_heartbeat_for_machine_next: 'FAIL_CURRENT',
  allowed_stops: ['TRUE_WAIT', 'OWNER_ONLY', 'TERMINAL'],
  blocked_provider_root_stop: false,
  result_loop_exit: false,
}));
