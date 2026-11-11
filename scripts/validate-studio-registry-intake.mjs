import assert from 'node:assert/strict';
import { compileStudioRegistryIntake } from '../src/baseline/studio-registry-intake.mjs';
import { compileStudioRoster } from '../src/install/studio-headless-topology.mjs';
import { compileProductCapabilityBaseline } from '../src/baseline/product-capability.mjs';

const members = ['case_app','mail_app','tools_app'];
const denominator = {
  schema:'xiio.studio-product-denominator/v1', id:'CANONICAL_REGISTRY',
  generation:'G10',
  categories:{studio_member_known:members,studio_membership_unknown_drift:['new_app']},
  repository_bindings:{case_app:'owner/case_app',mail_app:'owner/mail_app'},
  no_repo_or_unresolved_bindings:{tools_app:'PLANNED_RESERVED'},
  counts:{studio_member_known:members.length,studio_membership_denominator:members.length},
};
const relationship_graph = {
  schema:'xiio.studio-relationship-graph/v1',root_ref:denominator.id,
  generation:'G4',complete:false,product_nodes:members.slice(0,2).map(id=>({id,membership:'MEMBER'})),
  unresolved_candidate_nodes:[{id:'unknown_relation'}],
};
const supplied = {
  denominator,relationship_graph,
  denominator_source_ref:'owner/studio:registry',
  graph_source_ref:'owner/studio:graph',
};
const unbound = compileStudioRegistryIntake();
assert.equal(unbound.state,'WAIT_REGISTRY_UNBOUND');
assert.equal(unbound.member_count,null);
assert.equal(unbound.full_affected_set_closed,false);
const partial = compileStudioRegistryIntake(supplied);
assert.equal(partial.member_count,3);
assert.deepEqual(partial.member_ids,members);
assert.deepEqual(partial.unknown_membership_ids,['new_app']);
assert.deepEqual(partial.missing_graph_member_ids,['tools_app']);
assert.deepEqual(partial.unresolved_relationship_ids,['unknown_relation']);
assert.equal(partial.state,'PARTIAL_GRAPH');
assert.equal(partial.relationship_complete,false);
assert.equal(partial.full_affected_set_closed,false);
assert.equal(partial.members[2].binding_state,'PLANNED_RESERVED');
assert.equal(partial.source.currentness,'SUPPLIED_UNVERIFIED');
assert.equal(compileStudioRegistryIntake({...supplied,relationship_graph:null}).state,'WAIT_GRAPH_UNBOUND');
assert.equal(compileStudioRegistryIntake({...supplied,relationship_graph:{...relationship_graph,root_ref:'wrong'}}).state,'BLOCKED_SOURCE_MISMATCH');
assert.throws(()=>compileStudioRegistryIntake({...supplied,denominator:{...denominator,schema:'forged'}}),/SCHEMA_INVALID/);
assert.throws(()=>compileStudioRegistryIntake({...supplied,denominator:{...denominator,categories:{...denominator.categories,studio_member_known:[members[0],members[0]]}}}),/DUPLICATE/);

// Even a complete claimed graph is still only a supplied, unverified source.
const populatedGraph = {...relationship_graph,complete:true,product_nodes:members.map(id=>({id,membership:'MEMBER'})),unresolved_candidate_nodes:[]};
const claimedComplete = compileStudioRegistryIntake({...supplied,relationship_graph:populatedGraph});
assert.equal(claimedComplete.relationship_complete,true);
assert.equal(claimedComplete.full_affected_set_closed,false);
assert.equal(claimedComplete.source.currentness,'SUPPLIED_UNVERIFIED');
const driftedDenominator={...denominator,counts:{studio_member_known:99,studio_membership_denominator:99}};
assert(compileStudioRegistryIntake({...supplied,denominator:driftedDenominator}).blockers.includes('STUDIO_DENOMINATOR_COUNT_DRIFT'));

// The old exact-count + supplied receipt shortcut cannot forge full-roster proof.
const flagsOnly=compileStudioRoster({state_root:'/tmp/sandbox-fixture',registry_complete:true,
  registry_ref:'claim',registry_digest:'sha256:claim',registry_receipt_ref:'claim',expected_product_count:1,
  products:[{product_id:'case_app'}]});
assert.equal(flagsOnly.registry_complete,false);
assert.equal(flagsOnly.registry_discovery.state,'WAIT_REGISTRY_UNBOUND');

// No manually maintained SDK roster: the supplied canonical member set drives
// the products and missing-member diagnostics on every roster intake.
const roster=compileStudioRoster({state_root:'/tmp/sandbox-fixture',studio_registry:supplied});
assert.equal(roster.product_count,members.length);
assert.equal(roster.known_member_coverage,true);
assert.equal(roster.registry_complete,false);
assert.equal(roster.relationship_complete,false);
assert.deepEqual(roster.missing_member_ids,[]);
assert(roster.blockers.some(b=>b.target==='ROSTER_RELATIONSHIP_GRAPH_PARTIAL'));
assert(roster.blockers.some(b=>b.target==='ROSTER_MEMBERSHIP_UNKNOWN'));
const scoped=compileStudioRoster({state_root:'/tmp/sandbox-fixture',studio_registry:supplied,
  products:[{product_id:'case_app'}]});
assert.deepEqual(scoped.missing_member_ids,['mail_app','tools_app']);
assert.equal(scoped.known_member_coverage,false);

const productInput={source_generation:'G1',observed_at:'2026-11-11',studio_registry:supplied,
  products:[{product_ref:'product:case',studio_product_id:'case_app'}, {product_ref:'product:mail',studio_product_id:'mail_app'}]};
const product=compileProductCapabilityBaseline(productInput);
assert.equal(product.canonical_studio_product_denominator,3);
assert.deepEqual(product.missing_canonical_member_ids,['tools_app']);
assert.equal(product.canonical_member_coverage_100,false);
assert.equal(product.relationship_graph_complete,false);
assert.equal(product.affected_set_closed,false);
const extra='fourth_app';
const expanded=compileStudioRegistryIntake({...supplied,
  denominator:{...denominator,categories:{...denominator.categories,studio_member_known:[...members,extra]},
    counts:{studio_member_known:4,studio_membership_denominator:4}},
});
assert.equal(expanded.member_count,4);
assert(expanded.member_ids.includes(extra));
assert.equal(expanded.missing_graph_member_ids.includes(extra),true);

console.log('studio-registry-intake: PASS');
