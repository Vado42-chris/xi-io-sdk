import assert from 'node:assert/strict';
import { compileStudioHeadlessTopology, compileStudioRoster } from '../src/install/studio-headless-topology.mjs';

const x=compileStudioHeadlessTopology({product_id:'xiio_inbox',base_port:8791,state_root:'/tmp/xiio-test',servers:[]});
assert.equal(x.minimum_server_count,3);
assert.equal(x.servers.length,3);
assert.equal(new Set(x.servers.map(s=>s.port)).size,3);
assert.equal(x.next_hvt,'HVT-001');
assert.equal(x.hvt_punchcards[0].target,'BIN_REGISTRY');
assert.equal(x.bin_registry.owner_product,'xi-io_bins');
assert.equal(x.bin_registry.global_path_mutation,false);
assert.equal(x.cloudflare.hostname,'xiio-inbox.dev.xi-io.net');
assert.equal(x.crm.owner_product,'xi-io-Inbox');
assert.equal(x.crm.external_email_fallback,false);
assert.equal(x.installer.owner_product,'xi-io-HEX');
assert.equal(x.quarantine.user_existing_settings_mutated,false);
assert.equal(x.servers.find(s=>s.role==='switchboard_control').adapter_refs.length,0);

const roster=compileStudioRoster({state_root:'/tmp/xiio-test',registry_ref:'ward://children',registry_complete:false,products:[{product_id:'xiio_inbox'},{product_id:'xiio_publisher'}]});
assert.equal(roster.product_count,2);
assert.equal(roster.server_count,6);
assert.equal(roster.products.every(p=>p.servers.length===3),true);
assert.equal(roster.registry_complete,false);
assert.equal(roster.blockers.some(x=>x.target==='ROSTER_REGISTRY_PROOF'),true);
assert.equal(roster.evidence_complete,false);
assert.deepEqual(roster.evidence_stack.map(x=>x.name),['data_forge','dotproject','bugzilla']);
assert.equal(roster.evidence_stack.every(x=>x.state==='UNKNOWN_BLOCKED'),true);
assert.equal(roster.blockers.filter(x=>x.target==='EVIDENCE_DEPENDENCY').length,3);

const chained=compileStudioRoster({state_root:'/tmp/xiio-test',registry_ref:'ward://children',registry_digest:'sha256:'+'a'.repeat(64),registry_receipt_ref:'rcp:test',registry_complete:true,expected_product_count:2,products:[{product_id:'inbox',dependencies:['switchboard']},{product_id:'publisher',dependencies:['missing-child']}],external_dependencies:['switchboard']});
assert.equal(chained.registry_complete,false,'CALLER_REGISTRY_FLAG_CANNOT_CERTIFY_FULL_CENSUS');
assert.equal(chained.registry_discovery.state,'SUPPLIED_UNVERIFIED');
assert.equal(chained.registry_discovery.verified,false);
assert.equal(chained.relationship_graph.state,'TRUE_WAIT');
assert.equal(chained.relationship_graph.first_red,'RELATIONSHIP_GRAPH_UNBOUND');
assert.equal(chained.dependency_closure,false);
assert.equal(chained.blockers.some(x=>x.target==='ROSTER_DEPENDENCY'&&x.dependency==='missing-child'),true);

const partialGraph=compileStudioRoster({
  state_root:'/tmp/xiio-test',registry_ref:'registry:current',registry_digest:'sha256:'+'b'.repeat(64),
  registry_receipt_ref:'receipt:provided',registry_complete:true,expected_product_count:2,
  products:[{product_id:'inbox'},{product_id:'publisher'}],
  relationship_graph:{schema:'xiio.studio-relationship-graph/v1',generation:'g1',
    product_denominator_ref:'registry:current',status:'PARTIAL_GRAPH_CURRENT_PRODUCT_DENOMINATOR_BOUND',
    complete:false,completeness_reason:'Historical edges remain unresolved'},
});
assert.equal(partialGraph.relationship_graph.complete,false);
assert.equal(partialGraph.relationship_graph.first_red,'RELATIONSHIP_GRAPH_INCOMPLETE');
assert.equal(partialGraph.relationship_graph.completeness_reason,'Historical edges remain unresolved');
assert.equal(partialGraph.blockers.some(x=>x.target==='RELATIONSHIP_GRAPH'),true);
assert.equal(partialGraph.registry_complete,false);
const forgedComplete=compileStudioRoster({
  state_root:'/tmp/xiio-test',registry_ref:'registry:current',registry_digest:'sha256:'+'c'.repeat(64),
  registry_receipt_ref:'receipt:provided',registry_complete:true,expected_product_count:1,
  products:[{product_id:'inbox'}],relationship_graph:{schema:'xiio.studio-relationship-graph/v1',
    generation:'g1',product_denominator_ref:'registry:current',status:'COMPLETE',complete:true,
    authenticated:true,verified:true},
});
assert.equal(forgedComplete.relationship_graph.verified,false,'CALLER_VERIFIED_FLAG_IS_NOT_PROVIDER_READBACK');
assert.equal(forgedComplete.relationship_graph.first_red,'RELATIONSHIP_GRAPH_CURRENT_READBACK_REQUIRED');
assert.equal(forgedComplete.registry_complete,false);

assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[]}));
assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[{product_id:'same'},{product_id:'same'}]}));
assert.throws(()=>compileStudioHeadlessTopology({product_id:'x',state_root:'relative'}));
console.log('studio-headless-topology: PASS');
