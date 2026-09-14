import assert from 'node:assert/strict';
import { compileIbalRootProjection } from '../src/ibal/root-projection.mjs';

const base = {
  summons: { ref: 'summons:1' }, root: { ref: 'root:1', generation: 'g1' },
  formation: { ref: 'formation:1', root_ref: 'root:1', root_generation: 'g1', reducer_ref: 'reducer:1' },
  primitives: [{ ref: 'primitive:read' }],
  punch_cards: [{ ref: 'punch:read', primitive_refs: ['primitive:read'] }],
  score_cards: [{ ref: 'score:read', denominator: 1 }]
};
const bind = {
  admission: { ref: 'admission:1', root_ref: 'root:1', root_generation: 'g1' },
  assignments: [{ ref: 'assignment:1', root_ref: 'root:1', root_generation: 'g1', consumer_ref: 'agent:1', consumer_generation: 'a1', role: 'worker' }]
};
const ack = { ref: 'ack:1', assignment_ref: 'assignment:1', root_ref: 'root:1', root_generation: 'g1', consumer_ref: 'agent:1', consumer_generation: 'a1' };
assert.equal(compileIbalRootProjection(base).projection_state, 'PROJECTION_READY_ADMISSION_UNBOUND');
assert.equal(compileIbalRootProjection({ ...base, ...bind }).projection_state, 'TASK_ADMITTED_ACK_DUE');
assert.equal(compileIbalRootProjection({ ...base, ...bind, acks: [ack] }).projection_state, 'ACTIVE_ATTEMPT_DUE');
assert.equal(compileIbalRootProjection({ ...base, ...bind, attempts: [{ ref: 'attempt:bad', assignment_ref: 'assignment:1', root_ref: 'root:1', root_generation: 'g1' }] }).projection_state, 'BLOCKED');
const attempt = { ref: 'attempt:1', assignment_ref: 'assignment:1', root_ref: 'root:1', root_generation: 'g1' };
const result = { ref: 'result:1', attempt_ref: 'attempt:1', root_ref: 'root:1', root_generation: 'g1' };
const ret = { ref: 'return:1', result_ref: 'result:1', root_ref: 'root:1', root_generation: 'g1' };
const applied = { ref: 'apply:1', return_ref: 'return:1', root_ref: 'root:1', root_generation: 'g1' };
assert.equal(compileIbalRootProjection({ ...base, ...bind, acks: [ack], attempts: [attempt], results: [result] }).projection_state, 'RETURN_DUE');
assert.equal(compileIbalRootProjection({ ...base, ...bind, acks: [ack], attempts: [attempt], results: [result], returns: [ret] }).projection_state, 'APPLY_RETURN_DUE');
const done = compileIbalRootProjection({ ...base, ...bind, acks: [ack], attempts: [attempt], results: [result], returns: [ret], apply_returns: [applied] });
assert.equal(done.projection_state, 'REPROJECTION_DUE');
assert.deepEqual(done.authority, { admit: false, ack: false, execute: false, effect: false, deploy: false });
assert.equal(done.registry.sdk_package_version, '0.1.0-candidate.2');
assert.equal(compileIbalRootProjection({ ...base, admission: { root_ref: 'root:1', root_generation: 'wrong' } }).projection_state, 'BLOCKED');
assert.equal(compileIbalRootProjection({ ...base, ...bind, assignments: [{ ...bind.assignments[0], role: 'watcher', execute: true }] }).projection_state, 'BLOCKED');
assert.equal(compileIbalRootProjection({ ...base, punch_cards: [...base.punch_cards, base.punch_cards[0]] }).projection_state, 'BLOCKED');
console.log(JSON.stringify({ verdict: 'SOURCE_CONTRACT_PASS', fixtures: 9, runtime_deploy: false }));
