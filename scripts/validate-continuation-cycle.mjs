#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileContinuationCycle } from '../src/cadence/continuation.mjs';

const base = () => ({
  root_ref: 'root:G193',
  worker_ref: 'worker:chatgpt',
  subject_generation: 'g2',
  current_generation: 'g2',
  phase_event: 'POST_RESULT',
  pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [],
  returns: [],
  residue: [],
  occurrences: [],
  worker_inbox: { ref: 'inbox:worker/chatgpt', current: true, actionable_count: 0 },
  async_continuation_required: true,
});

const test = (name, fn) => {
  fn();
  process.stdout.write(`PASS ${name}\n`);
};

test('PASS_WITH_RUNNABLE_BACKLOG_CONTINUES', () => {
  const input = base();
  input.backlog = [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
  assert.equal(result.terminal, false);
  assert(result.next_actions.includes('CONTINUE_NEXT_GOLDEN_WORK'));
});

test('PASS_WITH_STRANDED_RESULT_EATS_BEFORE_STOP', () => {
  const input = base();
  input.returns = [{ id: 'result:1', state: 'RESULT', returned: false }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.deepEqual(result.returns.stranded, ['result:1']);
});

test('PASS_WITH_REAPER_RESIDUE_REAPS', () => {
  const input = base();
  input.residue = [{ id: 'ghost:1', class: 'ORPHANED_NEXT' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'REAP_REQUIRED');
  assert.equal(result.reap_required, true);
});

test('STALE_GENERATION_REBASES_FIRST', () => {
  const input = base();
  input.subject_generation = 'g1';
  input.backlog = [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'REBASE_REQUIRED');
  assert.equal(result.rebase_required, true);
  assert.equal(result.next_actions[0], 'REBASE');
});

test('BLOCKED_CELL_DOES_NOT_STOP_RUNNABLE_SIBLING', () => {
  const input = base();
  input.backlog = [
    { id: 'work:blocked', state: 'BLOCKED', priority: 1 },
    { id: 'work:runnable', state: 'RUNNABLE', priority: 2 },
  ];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
  assert.equal(result.backlog.blocked.length, 1);
  assert.equal(result.backlog.runnable.length, 1);
});

test('TRUE_WAIT_DOES_NOT_STOP_RUNNABLE_SIBLING', () => {
  const input = base();
  input.backlog = [
    { id: 'work:wait', state: 'TRUE_WAIT', priority: 1 },
    { id: 'work:runnable', state: 'ACTIVE_ELIGIBLE', priority: 2 },
  ];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_WORK');
});

test('MISSING_ASYNC_WORKER_INBOX_BLOCKS_TERMINAL_ONLY_AFTER_QUEUE_EMPTY', () => {
  const input = base();
  input.worker_inbox = { ref: null, current: false, actionable_count: 0 };
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_WORKER_INBOX_BINDING');
  assert.equal(result.worker_inbox.gap, true);
});

test('FOUR_SCALE_CURRENT_ZERO_REMAINDER_IS_TERMINAL_FIXED_POINT', () => {
  const result = compileContinuationCycle(base());
  assert.equal(result.disposition, 'TERMINAL_FIXED_POINT');
  assert.equal(result.terminal, true);
  assert.equal(result.four_scale_current, true);
});

test('UNKNOWN_BACKLOG_FAILS_CLOSED', () => {
  const input = base();
  input.backlog = [{ id: 'work:unknown', state: 'UNKNOWN' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_CURRENTNESS');
  assert.equal(result.backlog.unknown.length, 1);
});

test('ACTIONABLE_INTERNAL_INBOX_IS_WORK_TO_EAT', () => {
  const input = base();
  input.worker_inbox.actionable_count = 2;
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.equal(result.worker_inbox.actionable_count, 2);
});

test('ALREADY_APPLIED_RETURN_IS_NOT_STRANDED', () => {
  const input = base();
  input.returns = [{ id: 'apply:1', state: 'APPLY_RETURN', applied: true }];
  const result = compileContinuationCycle(input);
  assert.equal(result.returns.stranded.length, 0);
  assert.equal(result.disposition, 'TERMINAL_FIXED_POINT');
});

test('PASS_ALONE_WITH_NONCURRENT_100S_DOES_NOT_STOP', () => {
  const input = base();
  input.four_scale.MACRO = 'NOT_100';
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'CONTINUE_QUALIFICATION');
  assert.equal(result.terminal, false);
});

test('UNCONSUMED_OCCURRENCE_IS_EAT_REQUIRED', () => {
  const input = base();
  input.occurrences = [{ id: 'occurrence:new', consumed: false }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'EAT_REQUIRED');
  assert.deepEqual(result.occurrences.unconsumed, ['occurrence:new']);
});

test('UNKNOWN_REAP_CLASS_CANNOT_BE_SILENTLY_REAPED', () => {
  const input = base();
  input.residue = [{ id: 'mystery:1', class: 'SOMETHING_NEW' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_CURRENTNESS');
  assert.equal(result.residue.findings.length, 0);
  assert.equal(result.residue.unknown.length, 1);
});

test('TRUE_WAIT_ONLY_IS_TYPED_WAIT_NOT_TERMINAL', () => {
  const input = base();
  input.backlog = [{ id: 'provider:wait', state: 'TRUE_WAIT' }];
  const result = compileContinuationCycle(input);
  assert.equal(result.disposition, 'WAIT_TRUE_GATE');
  assert.equal(result.terminal, false);
});

test('INVALID_PHASE_EVENT_REJECTS', () => {
  const input = base();
  input.phase_event = 'WHATEVER';
  assert.throws(() => compileContinuationCycle(input), /INVALID_INPUT/);
});

test('DIRECT_XI_CADENCE_CONTINUE_MATCHES_CALLABLE', () => {
  const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));
  const fixturePath = fileURLToPath(new URL('../fixtures/cadence/continuation.synthetic.json', import.meta.url));
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const run = spawnSync(process.execPath, [binary, 'cadence', 'continue', '--input', fixturePath], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), compileContinuationCycle(fixture));
  assert.equal(JSON.parse(run.stdout).disposition, 'CONTINUE_WORK');
});

console.log(JSON.stringify({
  status: 'PASS',
  cases: 17,
  effects: 0,
  terminal_requires_four_scale_current: true,
  pass_does_not_stop: true,
  reap_eat_backlog_refresh: true,
  worker_inbox_authority: false,
  direct_cli: true
}));
