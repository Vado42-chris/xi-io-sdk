#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileWorkEgressProjection } from '../src/work/egress.mjs';

const fixture = () => ({
  root_ref: 'root:timed-followup-canary',
  project_ref: 'project:fixture',
  work_ref: 'work:timed-followup-001',
  work_revision: 3,
  work_state: 'CURRENT',
  crm_card_ref: 'crm:card:timed-followup-001',
  punchcard_ref: 'punchcard:timed-followup',
  punchcard_generation: 'g7',
  cadence_wake_ref: 'wake:timed-followup',
  hot_folder_ref: 'bins:hotfolder:timed-followup',
  return_target_ref: 'return:timed-followup',
  projections: [],
});

const test = (name, fn) => {
  fn();
  process.stdout.write(`PASS ${name}\n`);
};

test('MISSING_CANONICAL_WORK_REJECTS_BEFORE_PROVIDER_PROJECTION', () => {
  const input = fixture();
  input.work_ref = '';
  input.projections = [{ projection_ref: 'timer:1', provider_family: 'REMINDER_PROVIDER_FIXTURE', kind: 'TIMER', status: 'REQUESTED' }];
  assert.throws(() => compileWorkEgressProjection(input), /CANONICAL_WORK_REF_REQUIRED/);
});

test('MISSING_CRM_CARD_REJECTS_BEFORE_EGRESS', () => {
  const input = fixture();
  input.crm_card_ref = '';
  assert.throws(() => compileWorkEgressProjection(input), /CRM_CARD_REF_REQUIRED/);
});

test('MISSING_HOT_FOLDER_REJECTS_BEFORE_EGRESS', () => {
  const input = fixture();
  input.hot_folder_ref = '';
  assert.throws(() => compileWorkEgressProjection(input), /HOT_FOLDER_REF_REQUIRED/);
});

test('MISSING_RETURN_TARGET_REJECTS_BEFORE_EGRESS', () => {
  const input = fixture();
  input.return_target_ref = '';
  assert.throws(() => compileWorkEgressProjection(input), /RETURN_TARGET_REF_REQUIRED/);
});

test('PROVIDER_CAPACITY_FAILURE_PRESERVES_WORK_AND_CONTINUES', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'task-provider:1', provider_family: 'TASK_PROVIDER_FIXTURE', kind: 'TASK', status: 'BLOCKED_TOOL_OR_PROVIDER', wake: 'TASK_PROVIDER_ADAPTER_AVAILABLE' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'DEGRADED_EGRESS_CONTINUE_INTERNAL');
  assert.equal(result.canonical_work_preserved, true);
  assert.equal(result.root_stop, false);
  assert.deepEqual(result.blocked_projection_refs, ['task-provider:1']);
});

test('BLOCKED_PROVIDER_REQUIRES_EXACT_WAKE', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'task-provider:1', provider_family: 'TASK_PROVIDER_FIXTURE', kind: 'TASK', status: 'BLOCKED_TOOL_OR_PROVIDER' }];
  assert.throws(() => compileWorkEgressProjection(input), /PROJECTION_WAKE_REQUIRED:task-provider:1/);
});

test('NO_PROVIDER_PROJECTION_STILL_PRESERVES_INTERNAL_WORK', () => {
  const result = compileWorkEgressProjection(fixture());
  assert.equal(result.disposition, 'CONTINUE_INTERNAL_FRONTIER');
  assert.equal(result.projection_eligible, true);
  assert.equal(result.root_stop, false);
});

test('PENDING_TIMER_IS_NOT_WORK_CAPTURE_PROOF', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'timer:1', provider_family: 'REMINDER_PROVIDER_FIXTURE', kind: 'TIMER', status: 'POSTED' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'WAIT_PROVIDER_READBACK_CONTINUE_INTERNAL');
  assert.equal(result.canonical_work_bound, true);
  assert.equal(result.provider_effect_authority, false);
});

test('READBACK_REQUIRES_PROVIDER_RECEIPT', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'calendar:1', provider_family: 'CALENDAR_PROVIDER_FIXTURE', kind: 'CALENDAR', status: 'READ_BACK' }];
  assert.throws(() => compileWorkEgressProjection(input), /PROVIDER_READBACK_REF_REQUIRED/);
});

test('READBACK_CURRENT_DOES_NOT_GRANT_WORK_OR_EFFECT_AUTHORITY', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'task-provider:readback', provider_family: 'TASK_PROVIDER_FIXTURE', kind: 'TASK', status: 'READ_BACK', provider_readback_ref: 'provider:task:receipt:r3' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'EGRESS_READBACK_CURRENT');
  assert.equal(result.provider_effect_authority, false);
  assert.equal(result.work_authority, false);
});

test('TERMINAL_WORK_CANNOT_PROJECT_NEW_TIMER_OR_STOP_ROOT', () => {
  const input = fixture();
  input.work_state = 'COMPLETED';
  input.projections = [{ projection_ref: 'timer:late', provider_family: 'REMINDER_PROVIDER_FIXTURE', kind: 'TIMER', status: 'REQUESTED' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'NO_OP_TERMINAL_WORK');
  assert.equal(result.projection_eligible, false);
  assert.equal(result.work_terminal, true);
  assert.equal(result.root_stop, false);
});

test('TERMINAL_WORK_WITH_NO_PROJECTIONS_STILL_DOES_NOT_ASSERT_ROOT_TERMINAL', () => {
  const input = fixture();
  input.work_state = 'SUPERSEDED';
  const result = compileWorkEgressProjection(input);
  assert.equal(result.work_terminal, true);
  assert.equal(result.root_stop, false);
  assert.equal(result.next, 'REBASE_CURRENT_WORK_FRONTIER');
});

test('UNKNOWN_PROVIDER_PROJECTION_REQUIRES_WAKE_AND_NEVER_STOPS_ROOT', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'task-provider:unknown', provider_family: 'TASK_PROVIDER_FIXTURE', kind: 'TASK', status: 'UNKNOWN', wake: 'TASK_PROVIDER_CURRENTNESS_RESOLVED' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'WAIT_PROVIDER_CURRENTNESS');
  assert.equal(result.root_stop, false);
});

test('CLI_WORK_EGRESS_MATCHES_CALLABLE', () => {
  const binary = fileURLToPath(new URL('../bin/xi.mjs', import.meta.url));
  const tmp = fileURLToPath(new URL('../fixtures/cadence/work-egress.synthetic.json', import.meta.url));
  const expected = compileWorkEgressProjection(JSON.parse(fs.readFileSync(tmp, 'utf8')));
  const run = spawnSync(process.execPath, [binary, 'work', 'egress', '--input', tmp], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), expected);
});

console.log(JSON.stringify({ status: 'PASS', cases: 14, provider_effects: 0, canonical_work_first: true, crm_hotfolder_return_bound: true, work_terminal_is_not_root_terminal: true, owner_heartbeat_required: false }));
