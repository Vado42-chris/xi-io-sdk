import assert from 'node:assert/strict';
import { compileStudioHeadlessTopology, compileStudioRoster } from '../src/install/studio-headless-topology.mjs';

const rootRoles=['email','ibal_golden','ibal_subterranean','studio_web','ack_api_gateway','client_parent','security_identity'];
const rootServers=rootRoles.map((role,i)=>({role,port:8800+i,verified:true,receipt_ref:`rcp:${role}`}));
const bins={
 email:{ref:'bins:email',verified:true,receipt_ref:'bins-rcp:email'},
 ibal_golden:{ref:'bins:golden',verified:true,receipt_ref:'bins-rcp:golden'},
 ibal_subterranean:{ref:'bins:sub',verified:true,receipt_ref:'bins-rcp:sub'},
 studio_web:{ref:'bins:web',verified:true,receipt_ref:'bins-rcp:web'},
 ack_api_gateway:{ref:'bins:api',verified:true,receipt_ref:'bins-rcp:api'},
 client_parent:{ref:'bins:rel',verified:true,receipt_ref:'bins-rcp:rel'},
 security_identity:{ref:'bins:sec',verified:true,receipt_ref:'bins-rcp:sec'},
};
const children=[
 {product_id:'bins',verified:true,receipt_ref:'child:bins'},
 {product_id:'switchboard',verified:true,receipt_ref:'child:switchboard'},
 {product_id:'ward',verified:true,receipt_ref:'child:ward'},
 {product_id:'inbox',verified:true,receipt_ref:'child:inbox'},
];

const x=compileStudioHeadlessTopology({
 instance_id:'client-acme',
 state_root:'/tmp/xiio-test',
 base_port:8800,
 root_servers:rootServers,
 bins,
 children,
});
assert.equal(x.schema,'xiio.sdk.studio-headless-topology/v3');
assert.equal(x.communications_server_count,3);
assert.equal(x.shared_root_server_count,7);
assert.equal(x.installed_child_count,4);
assert.equal(x.minimum_logical_server_count,11);
assert.equal(x.root_servers.length,7);
assert.equal(x.child_servers.length,4);
assert.deepEqual(x.communications.roles,['email','ibal_golden','ibal_subterranean']);
assert.equal(new Set(x.root_servers.map(s=>s.server_uuid)).size,7);
assert.equal(new Set(x.child_servers.map(s=>s.server_uuid)).size,4);
assert.equal(x.ack.issuer_owner,'xi-io_bins');
assert.equal(x.ack.gateway_role,'ack_api_gateway');
assert.equal(x.core_children.missing.length,0);
assert.equal(x.web_projection.one_domain_per_server_required,false);
assert.equal(x.placement.physical_machine_count_authority,false);
assert.equal(x.next_hvt,'HVT-006');

const roster=compileStudioRoster({
 instance_id:'client-acme',
 state_root:'/tmp/xiio-test',
 base_port:8800,
 root_servers:rootServers,
 bins,
 registry_complete:true,
 registry_ref:'registry:client-acme',
 registry_digest:'sha256:test',
 registry_receipt_ref:'receipt:registry',
 expected_product_count:4,
 products:children,
});
assert.equal(roster.product_count,4);
assert.equal(roster.communications_server_count,3);
assert.equal(roster.shared_root_server_count,7);
assert.equal(roster.child_server_count,4);
assert.equal(roster.server_count,11);
assert.equal(roster.registry_complete,true);

const missingSecurity=compileStudioHeadlessTopology({
 instance_id:'client-bad',
 state_root:'/tmp/xiio-test2',
 base_port:9000,
 root_servers:rootServers.filter(s=>s.role!=='security_identity'),
 bins,
 children,
});
assert.equal(missingSecurity.shared_root_server_count,7);
assert.equal(missingSecurity.hvt_punchcards.find(c=>c.target==='SEVEN_ROOT_SERVERS').state,'MISSING');

const noWard=compileStudioHeadlessTopology({
 instance_id:'client-no-ward',
 state_root:'/tmp/xiio-test3',
 base_port:9100,
 root_servers:rootServers,
 bins,
 children:children.filter(c=>c.product_id!=='ward'),
});
assert.deepEqual(noWard.core_children.missing,['ward']);
assert.equal(noWard.hvt_punchcards.find(c=>c.target==='CORE_CHILDREN').state,'MISSING');

assert.throws(()=>compileStudioHeadlessTopology({instance_id:'x',state_root:'relative'}));
assert.throws(()=>compileStudioHeadlessTopology({
 instance_id:'dup',state_root:'/tmp/x',
 children:[{product_id:'inbox'},{product_id:'inbox'}]
}));
console.log('studio-headless-topology-v3: PASS');
