import assert from 'node:assert/strict';
import { REGISTRY_IDENTITY } from '../src/ibal/root-projection.mjs';
import { compileColdStartHydration, validateOpaqueRef } from '../src/ibal/cold-start-hydration.mjs';

const hostile = '../../DROP TABLE 🧨 ${TOKEN}';
const base = {
  sdk_registry: REGISTRY_IDENTITY,
  invocation: { app_ref: 'app:inbox', app_generation: 'generation:g1', session_ref: 'session:temp' },
  agent: { ref: 'agent:temp', generation: 'generation:g1', role_ref: 'role:qual' },
  root: { ref: 'root:stable-1', generation: 'generation:root-g1' },
  entities: [
    { ref: 'entity:1', type_ref: 'type:person', label: hostile, location_ref: 'place:hostile-1', bins_ref: 'bins:hostile-1', repo_ref: 'repo:github:owner/name' },
    { ref: 'entity:2', type_ref: 'type:organization', label: hostile }
  ],
  projections: [
    { ref: 'projection:samlaw:research', generation: 'generation:proj-g1', role_ref: 'projection-role:research-work', provider_surface_ref: 'slack-channel:C0BPWD48RAT', label: '#proj-sam_law' },
    { ref: 'projection:samlaw:private-source', generation: 'generation:proj-g1', role_ref: 'projection-role:private-source-currentness', provider_surface_ref: 'slack-channel:C0BS1KKBCSY', label: '#proj-sam-law-andersen-v-hallberg' },
    { ref: 'projection:samlaw:owner', generation: 'generation:proj-g1', role_ref: 'projection-role:owner-human', provider_surface_ref: 'slack-channel:C0BTDR1PGE4', label: '#client-sam-law-andersen-vs-hallberg' }
  ],
  punch_cards: [{ ref: 'punch:1', root_ref: 'root:stable-1', root_generation: 'generation:root-g1' }],
  score_cards: [{ ref: 'score:1', denominator: 1 }],
  privacy: { policy_ref: 'ward:policy', policy_generation: 'generation:g1' },
  return_target: { ref: 'crm:return:1' }
};
const ready = compileColdStartHydration(base);
assert.equal(ready.state, 'HYDRATION_READY_ACK_DUE');
assert.equal(ready.next_transition, 'ACK');
assert.equal(ready.entities[0].label, hostile);
assert.equal(ready.projections.length, 3);
assert.equal(ready.projections[0].role_ref, 'projection-role:research-work');
assert.equal(ready.projections[1].provider_surface_ref, 'slack-channel:C0BS1KKBCSY');
assert.equal(ready.projection_rule, 'PROVIDER_SURFACE_IS_NAVIGATION_NOT_WORK_IDENTITY_OR_AUTHORITY');
assert.deepEqual(ready.authority, { admit: false, ack: false, execute: false, effect: false, deploy: false });
assert.equal(compileColdStartHydration({ ...base, entities: [...base.entities, { ...base.entities[0] }] }).state, 'BLOCKED');
assert.equal(compileColdStartHydration({ ...base, projections: [...base.projections, { ...base.projections[0] }] }).state, 'BLOCKED');
assert.equal(compileColdStartHydration({ ...base, projections: [{ ...base.projections[0], provider_surface_ref: '../../slack' }] }).state, 'BLOCKED');
assert.equal(compileColdStartHydration({ ...base, sdk_registry: { ...REGISTRY_IDENTITY, contract_digest: 'wrong' } }).state, 'BLOCKED');
assert.equal(compileColdStartHydration({ ...base, privacy: {} }).state, 'BLOCKED');
assert.equal(compileColdStartHydration({ ...base, punch_cards: [] }).state, 'BLOCKED');
for (const value of ['../../etc/passwd', '%2e%2e%2fuser-data', 'root:good\nFORGED:ACK', ' root:stable ', 'root:']) assert.equal(validateOpaqueRef(value).ok, false);
assert.equal(validateOpaqueRef('repo:github:Vado42-chris/xi-io-sdk').ok, true);
console.log(JSON.stringify({ verdict: 'SOURCE_CONTRACT_PASS', fixtures: 7, projection_roles: 3, hostile_labels_preserved: true, runtime_deploy: false }));
