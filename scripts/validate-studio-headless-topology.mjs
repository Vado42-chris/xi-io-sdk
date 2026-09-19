import assert from 'node:assert/strict';
import { compileStudioHeadlessTopology, compileStudioRoster } from '../src/install/studio-headless-topology.mjs';

const suppliedServers = [
  {role:'email',verified:true,receipt_ref:'rcp:email'},
  {role:'ibal_golden',verified:true,receipt_ref:'rcp:golden'},
  {role:'ibal_subterranean',verified:true,receipt_ref:'rcp:sub'},
];
const suppliedBins = {
  email:{ref:'bins:email',verified:true,receipt_ref:'bins-rcp:email'},
  ibal_golden:{ref:'bins:golden',verified:true,receipt_ref:'bins-rcp:golden'},
  ibal_subterranean:{ref:'bins:sub',verified:true,receipt_ref:'bins-rcp:sub'},
};

const x=compileStudioHeadlessTopology({
  product_id:'xiio_inbox',
  base_port:8791,
  state_root:'/tmp/xiio-test',
  servers:suppliedServers,
  bins:suppliedBins,
});
assert.equal(x.schema,'xiio.sdk.studio-headless-topology/v2');
assert.equal(x.minimum_server_count,3);
assert.equal(x.servers.length,3);
assert.deepEqual(x.servers.map(s=>s.role),['email','ibal_golden','ibal_subterranean']);
assert.equal(new Set(x.servers.map(s=>s.port)).size,3);
assert.equal(new Set(x.servers.map(s=>s.channel_uuid)).size,3);
assert.match(x.root_channel_uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert(x.servers.every(s=>s.root_channel_uuid===x.root_channel_uuid));
assert.equal(x.communications.topology,'THREE_WAY');
assert.equal(x.communications.serialized_uuid_mapping,true);
assert.equal(x.semantic_services.calendar_crm.owner_product,'xi-io-Calendar');
assert.deepEqual(x.semantic_services.tasks.composition,['bugzilla','dotproject']);
assert.equal(x.semantic_services.switchboard.role,'ADMISSION_AND_EFFECT_ROUTING_NOT_A_PHYSICAL_FOURTH_SERVER');
assert.equal(x.web_projection.surface,'MARKETPLACE_CATALOG_ONLY');
assert.equal(x.web_projection.runtime_install_authority,false);
assert.equal(x.installer.owner_product,'xi-io-HEX');
assert.equal(x.hvt_punchcards[4].target,'THREE_WAY_UUID_RECONCILIATION');
assert.equal(x.next_hvt,'HVT-006');
assert.equal(x.authority.service_install,false);

const roster=compileStudioRoster({
 state_root:'/tmp/xiio-test',
 registry_ref:'ward://children',
 registry_complete:false,
 products:[
  {product_id:'xiio_inbox',servers:suppliedServers,bins:suppliedBins},
  {product_id:'xiio_publisher',servers:suppliedServers,bins:suppliedBins},
 ]
});
assert.equal(roster.product_count,2);
assert.equal(roster.server_count,6);
assert.equal(roster.products.every(p=>p.servers.length===3),true);
assert.equal(roster.registry_complete,false);
assert.equal(roster.blockers.some(x=>x.target==='ROSTER_REGISTRY_PROOF'),true);
assert.equal(roster.evidence_complete,false);
assert.deepEqual(roster.evidence_stack.map(x=>x.name),['data_forge','dotproject','bugzilla']);
assert.equal(roster.evidence_stack.every(x=>x.state==='UNKNOWN_BLOCKED'),true);

const chained=compileStudioRoster({
 state_root:'/tmp/xiio-test',
 registry_ref:'ward://children',
 registry_digest:'sha256:test',
 registry_receipt_ref:'rcp:test',
 registry_complete:true,
 expected_product_count:2,
 products:[
  {product_id:'inbox',dependencies:['switchboard'],servers:suppliedServers,bins:suppliedBins},
  {product_id:'publisher',dependencies:['missing-child'],servers:suppliedServers,bins:suppliedBins}
 ],
 external_dependencies:['switchboard']
});
assert.equal(chained.registry_complete,true);
assert.equal(chained.dependency_closure,false);
assert.equal(chained.blockers.some(x=>x.target==='ROSTER_DEPENDENCY'&&x.dependency==='missing-child'),true);

assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[]}));
assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[{product_id:'same'},{product_id:'same'}]}));
assert.throws(()=>compileStudioHeadlessTopology({product_id:'x',state_root:'relative'}));
console.log('studio-headless-topology: PASS');
