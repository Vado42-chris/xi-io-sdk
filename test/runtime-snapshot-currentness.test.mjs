import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRuntimeSnapshotCurrentness } from '../src/currentness/runtime-snapshot.mjs';

const H = 'example.health/v1';
const S = 'example.snapshot/v1';
const base = () => ({
  work_ref: 'work-1',
  source_generation: 'gen-7',
  runtime_agent_id: 'agent-a',
  assignment_ref: 'asg-9',
  health_schema: H,
  snapshot_schema: S,
  health: { schema: H, state: 'RUNNING', installed_generation: 'inst-3' },
  body: {
    schema: S,
    state: 'CURRENT',
    work_id: 'work-1',
    project_id: 'proj-1',
    snapshot: {
      work_id: 'work-1',
      source_generation: 'gen-7',
      workers: [{ agent_id: 'agent-a', canDispatch: true, assignment: { assignment_ref: 'asg-9', source_generation: 'gen-7' } }],
    },
  },
});

test('binds a current, dispatchable snapshot with runtime generation', () => {
  const out = bindRuntimeSnapshotCurrentness(base());
  assert.equal(out.state, 'CURRENT');
  assert.equal(out.runtime_generation, 'inst-3');
  assert.equal(out.project_id, 'proj-1');
});

test('refuses non-running health', () => {
  const c = base(); c.health.state = 'STOPPED';
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_HEALTH_UNVERIFIED/);
});

test('refuses health without installed generation', () => {
  const c = base(); delete c.health.installed_generation;
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_HEALTH_UNVERIFIED/);
});

test('refuses a snapshot for a different work', () => {
  const c = base(); c.body.work_id = 'work-2';
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_SNAPSHOT_NOT_CURRENT/);
});

test('refuses a stale source generation', () => {
  const c = base(); c.source_generation = 'gen-6';
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_SNAPSHOT_NOT_CURRENT/);
});

test('refuses an assignment that cannot dispatch', () => {
  const c = base(); c.body.snapshot.workers[0].canDispatch = false;
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_ASSIGNMENT_NOT_DISPATCHABLE/);
});

test('refuses a dispatchable row whose assignment generation is stale', () => {
  const c = base(); c.body.snapshot.workers[0].assignment.source_generation = 'gen-6';
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_ASSIGNMENT_NOT_DISPATCHABLE/);
});

test('requires caller-supplied schema names', () => {
  const c = base(); delete c.health_schema;
  assert.throws(() => bindRuntimeSnapshotCurrentness(c), /RUNTIME_SNAPSHOT_HEALTH_SCHEMA_REQUIRED/);
});
