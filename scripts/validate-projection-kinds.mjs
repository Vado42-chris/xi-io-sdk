import assert from 'node:assert/strict';
import { compileProjection, projectionKindRegistry } from '../src/lexicon/compile-projection.mjs';

const hostile = '../../DROP TABLE 🧨 ${TOKEN}';
const base = {
  projection: { ref: 'projection:1', generation: 'generation:1', kind: 'task', label: hostile },
  root: { ref: 'root:1', generation: 'generation:1' },
  subject_refs: ['person:1'], source_refs: ['evidence:1'], observer_ref: 'observer:1', owner_ref: 'owner:1',
  privacy: { policy_ref: 'ward:1', policy_generation: 'generation:1' },
  lifecycle_state: 'active', return_target: { ref: 'return:1' }
};
const allKinds = Object.values(projectionKindRegistry().families).flat();
assert.equal(projectionKindRegistry().provenance.origin_claimed, false);
assert.equal(projectionKindRegistry().provenance.historical_lineage_complete, false);
for (const kind of allKinds) {
  const out = compileProjection({ ...base, projection: { ...base.projection, kind } });
  assert.equal(out.state, 'PROJECTION_COMPILED_NO_EFFECT');
  assert.equal(out.projection.label, hostile);
  assert.equal(out.authority.effect, false);
}
assert.equal(compileProjection({ ...base, projection: { ...base.projection, kind: 'unknown' } }).state, 'BLOCKED');
assert.equal(compileProjection({ ...base, subject_refs: ['../../etc/passwd'] }).state, 'BLOCKED');
assert.equal(compileProjection({ ...base, subject_refs: ['person:1', 'person:1'] }).state, 'BLOCKED');
assert.equal(compileProjection({ ...base, lifecycle_state: 'done' }).state, 'BLOCKED');
assert.equal(compileProjection({ ...base, projection: { ...base.projection, label: 'task' } }).projection.ref, 'projection:1');
console.log(JSON.stringify({ verdict: 'SOURCE_CONTRACT_PASS', kinds: allKinds.length, hostile_fixtures: 5, runtime_deploy: false }));
