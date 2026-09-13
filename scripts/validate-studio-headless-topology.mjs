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
assert.equal(roster.registry_structural_complete,false);
assert.equal(roster.blockers.some(x=>x.target==='ROSTER_REGISTRY_PROOF'),true);
assert.equal(roster.dependency_declarations_complete,false);
assert.equal(roster.dependency_closure,false);
assert.equal(roster.blockers.filter(x=>x.target==='PRODUCT_DEPENDENCY_DECLARATION').length,2);
assert.equal(roster.evidence_complete,false);
assert.equal(roster.evidence_structural_complete,false);
assert.deepEqual(roster.evidence_stack.map(x=>x.name),['data_forge','dotproject','bugzilla']);
assert.equal(roster.evidence_stack.every(x=>x.state==='UNKNOWN_BLOCKED'),true);
assert.equal(roster.blockers.filter(x=>x.target==='EVIDENCE_DEPENDENCY').length,3);

const chained=compileStudioRoster({state_root:'/tmp/xiio-test',registry_ref:'ward://children',registry_digest:'sha256:test',registry_receipt_ref:'rcp:test',registry_complete:true,expected_product_count:2,products:[{product_id:'inbox',dependencies:['switchboard']},{product_id:'publisher',dependencies:['missing-child']}],external_dependencies:['switchboard']});
assert.equal(chained.registry_structural_complete,true);
assert.equal(chained.registry_complete,false);
assert.equal(chained.registry_proof_state,'SUPPLIED_UNVERIFIED');
assert.equal(chained.blockers.some(x=>x.target==='ROSTER_REGISTRY_NATIVE_VERIFICATION'),true);
assert.equal(chained.dependency_declarations_complete,true);
assert.equal(chained.dependency_closure,false);
assert.equal(chained.blockers.some(x=>x.target==='ROSTER_DEPENDENCY'&&x.dependency==='missing-child'),true);
assert(chained.verification_required.includes('STUDIO_REGISTRY_PROVIDER_NATIVE_VERIFIER'));

const evidenceClaims={
 data_forge:{owner_product:'devforge',contract_ref:'devforge:g1',receipt_ref:'rcp:devforge:g1',verified:true},
 dotproject:{owner_product:'dotproject',contract_ref:'dotproject:g1',receipt_ref:'rcp:dotproject:g1',verified:true},
 bugzilla:{owner_product:'bugzilla',contract_ref:'bugzilla:g1',receipt_ref:'rcp:bugzilla:g1',verified:true},
};
const spoofedComplete=compileStudioRoster({
 state_root:'/tmp/xiio-test',registry_ref:'caller:registry',registry_digest:'sha256:caller',registry_receipt_ref:'caller:receipt',registry_complete:true,expected_product_count:2,evidence_stack:evidenceClaims,
 products:[{product_id:'inbox',dependencies:['publisher']},{product_id:'publisher',dependencies:[]}],
});
assert.equal(spoofedComplete.registry_structural_complete,true);
assert.equal(spoofedComplete.registry_complete,false);
assert.equal(spoofedComplete.evidence_structural_complete,true);
assert.equal(spoofedComplete.evidence_complete,false);
assert.equal(spoofedComplete.evidence_proof_state,'SUPPLIED_UNVERIFIED');
assert.equal(spoofedComplete.evidence_stack.every(x=>x.verified===false&&x.state==='SUPPLIED_UNVERIFIED'),true);
assert.equal(spoofedComplete.blockers.filter(x=>x.target==='EVIDENCE_NATIVE_VERIFICATION').length,3);
assert.deepEqual(spoofedComplete.verification_required,['STUDIO_REGISTRY_PROVIDER_NATIVE_VERIFIER','BINS_EVIDENCE_PROVIDER_NATIVE_VERIFIER']);

assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[]}));
assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[{product_id:'same'},{product_id:'same'}]}));
assert.throws(()=>compileStudioHeadlessTopology({product_id:'x',state_root:'relative'}));
console.log('studio-headless-topology: PASS / caller-supplied completion remains unverified');
