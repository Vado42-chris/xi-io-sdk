#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileWorkEgressProjection } from '../src/work/egress.mjs';

const fixture = () => ({
  root_ref: 'root:court-burn',
  project_ref: 'project:xiio',
  work_ref: 'work:XIB-138',
  work_revision: 3,
  work_state: 'CURRENT',
  punchcard_ref: 'punchcard:court-p0',
  punchcard_generation: 'g7',
  cadence_wake_ref: 'wake:leave-0900',
  projections: [],
});

const test = (name, fn) => {
  fn();
  process.stdout.write(`PASS ${name}\n`);
};

test('MISSING_CANONICAL_WORK_REJECTS_BEFORE_PROVIDER_PROJECTION', () => {
  const input = fixture();
  input.work_ref = '';
  input.projections = [{ projection_ref: 'timer:1', provider_family: 'REMINDER_APP', kind: 'TIMER', status: 'REQUESTED' }];
  assert.throws(() => compileWorkEgressProjection(input), /CANONICAL_WORK_REF_REQUIRED/);
});

test('PROVIDER_CAPACITY_FAILURE_PRESERVES_WORK_AND_CONTINUES', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'bugzilla:1', provider_family: 'BUGZILLA', kind: 'TASK', status: 'BLOCKED_TOOL_OR_PROVIDER', wake: 'BUGZILLA_ADAPTER_AVAILABLE' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'DEGRADED_EGRESS_CONTINUE_INTERNAL');
  assert.equal(result.canonical_work_preserved, true);
  assert.equal(result.root_stop, false);
  assert.deepEqual(result.blocked_projection_refs, ['bugzilla:1']);
});

test('NO_PROVIDER_PROJECTION_STILL_PRESERVES_INTERNAL_WORK', () => {
  const result = compileWorkEgressProjection(fixture());
  assert.equal(result.disposition, 'CONTINUE_INTERNAL_FRONTIER');
  assert.equal(result.projection_eligible, true);
  assert.equal(result.root_stop, false);
});

test('PENDING_TIMER_IS_NOT_WORK_CAPTURE_PROOF', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'timer:1', provider_family: 'REMINDER_APP', kind: 'TIMER', status: 'POSTED' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'WAIT_PROVIDER_READBACK_CONTINUE_INTERNAL');
  assert.equal(result.canonical_work_bound, true);
  assert.equal(result.provider_effect_authority, false);
});

test('READBACK_REQUIRES_PROVIDER_RECEIPT', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'calendar:1', provider_family: 'CALENDAR', kind: 'CALENDAR', status: 'READ_BACK' }];
  assert.throws(() => compileWorkEgressProjection(input), /PROVIDER_READBACK_REF_REQUIRED/);
});

test('READBACK_CURRENT_DOES_NOT_GRANT_WORK_OR_EFFECT_AUTHORITY', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'linear:1', provider_family: 'LINEAR', kind: 'TASK', status: 'READ_BACK', provider_readback_ref: 'linear:XIB-138@r3' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'EGRESS_READBACK_CURRENT');
  assert.equal(result.provider_effect_authority, false);
  assert.equal(result.work_authority, false);
});

test('TERMINAL_WORK_CANNOT_PROJECT_NEW_TIMER', () => {
  const input = fixture();
  input.work_state = 'COMPLETED';
  input.projections = [{ projection_ref: 'timer:late', provider_family: 'REMINDER_APP', kind: 'TIMER', status: 'REQUESTED' }];
  const result = compileWorkEgressProjection(input);
  assert.equal(result.disposition, 'NO_OP_TERMINAL_WORK');
  assert.equal(result.projection_eligible, false);
});

test('UNKNOWN_PROVIDER_PROJECTION_FAILS_CLOSED_WITHOUT_ROOT_STOP', () => {
  const input = fixture();
  input.projections = [{ projection_ref: 'bugzilla:unknown', provider_family: 'BUGZILLA', kind: 'TASK', status: 'UNKNOWN' }];
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

console.log(JSON.stringify({ status: 'PASS', cases: 9, provider_effects: 0, canonical_work_first: true, owner_heartbeat_required: false }));
