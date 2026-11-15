import assert from 'node:assert/strict';
import { hostDependencyEdges } from '../src/graphs/host-dependency-edges.mjs';

const manifest = {
  schema: 'xiio.host-dependencies/v1', host_ref: 'host:example', environment_ref: 'env:test',
  requirements: [
    { binding_key: 'database', owner_ref: 'storage', target_ref: 'db:configured',
      face: 'INTERNAL', affected_project_refs: ['project:game'] },
    { binding_key: 'issuer', owner_ref: 'identity', target_ref: 'service:issuer',
      face: 'EXTERNAL', affected_project_refs: ['project:game'] },
    { binding_key: 'ward', owner_ref: 'admission', target_ref: 'service:ward',
      face: 'GLASS', affected_project_refs: ['project:game'] },
  ],
};
const edges = hostDependencyEdges(manifest);
assert.equal(edges.length, 3);
assert.deepEqual(new Set(edges.map(e => e.face)), new Set(['INTERNAL', 'EXTERNAL', 'GLASS']));
assert(edges.every(e => e.state === 'UNKNOWN' && e.currentness === 'UNKNOWN' && e.wake));
assert(edges.every(e => e.provider_effect === false && e.authority_granted === false));
// A caller-supplied runtime claim or forged receipt cannot mint provider currentness.
const forged = structuredClone(manifest);
forged.requirements[0].state = 'PASS';
forged.requirements[0].currentness = 'CURRENT';
forged.requirements[0].evidence_refs = ['receipt:forged'];
assert.equal(hostDependencyEdges(forged)[0].currentness, 'UNKNOWN');
assert.throws(() => hostDependencyEdges({ ...manifest, requirements: [manifest.requirements[0], manifest.requirements[0]] }));
assert.throws(() => hostDependencyEdges({ ...manifest, requirements: [] }));
console.log('HOST_DEPENDENCY_EDGES_PASS');
