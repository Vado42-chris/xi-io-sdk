import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileStudioHeadlessTopology, compileStudioRoster } from '../src/install/studio-headless-topology.mjs';

const source=fs.readFileSync(new URL('../src/install/studio-headless-topology.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/xi-io-Inbox|xi-io-Switchboard|xi-io-HEX|xi-io_bins|\.dev\.xi-io\.net|xi-io-Studio\/Tauri/,
  'white-label topology must not supply XI-IO-specific owners, shell or domain defaults');

const x=compileStudioHeadlessTopology({product_id:'xiio_inbox',base_port:8791,state_root:'/tmp/xiio-test',servers:[]});
assert.equal(x.minimum_server_count,3);
assert.equal(x.servers.length,3);
assert.equal(new Set(x.servers.map(s=>s.port)).size,3);
assert.equal(x.next_hvt,'HVT-001');
assert.equal(x.hvt_punchcards[0].target,'BIN_REGISTRY');
assert.equal(x.bin_registry.owner_product,null);
assert.equal(x.bin_registry.global_path_mutation,false);
assert.equal(x.bin_registry.all_roles_receipted,false);
assert.equal(x.cloudflare.hostname,null);
assert.equal(x.cloudflare.state,'UNBOUND');
assert.equal(x.crm.owner_product,null);
assert.equal(x.crm.external_email_fallback,false);
assert.equal(x.installer.owner_product,null);
assert.equal(x.quarantine.user_existing_settings_mutated,false);
assert.equal(x.servers.find(s=>s.role==='switchboard_control').adapter_refs.length,0);
assert.equal(x.servers.find(s=>s.role==='internal_mail_crm').owner_product,null);
assert.equal(x.hvt_punchcards.find(c=>c.target==='CLOUDFLARE_DEV_PROJECTION').state,'UNBOUND');

const configured=compileStudioHeadlessTopology({
  product_id:'tenant-product',base_port:8791,state_root:'/tmp/tenant',
  bin_registry:{owner_product:'tenant-store',registry_ref:'store:current'},
  servers:[
    {role:'product_runtime',host_shell:'tenant-native',verified:true},
    {role:'internal_mail_crm',owner_product:'tenant-mail',host_shell:'tenant-sidecar',verified:true,adapter_refs:['mail-adapter']},
    {role:'switchboard_control',owner_product:'tenant-router',host_shell:'tenant-headless',verified:true},
  ],
  bins:Object.fromEntries(['product_runtime','internal_mail_crm','switchboard_control'].map(role=>[role,{ref:'bin:'+role,verified:true,receipt_ref:'receipt:'+role}])),
  cloudflare:{owner_product:'tenant-router',hostname:'tenant.example.test'},
  installer:{owner_product:'tenant-launcher',host_shell:'tenant-native'},
});
assert.equal(configured.bin_registry.all_roles_receipted,true);
assert.equal(configured.bin_registry.owner_product,'tenant-store');
assert.equal(configured.crm.owner_product,'tenant-mail');
assert.equal(configured.servers.find(s=>s.role==='internal_mail_crm').host_shell,'tenant-sidecar');
assert.deepEqual(configured.servers.find(s=>s.role==='internal_mail_crm').adapter_refs,['mail-adapter']);
assert.equal(configured.cloudflare.hostname,'tenant.example.test');
assert.equal(configured.installer.owner_product,'tenant-launcher');
assert.equal(configured.servers.every(s=>s.state==='SUPPLIED_UNVERIFIED'),true);
assert.equal(configured.authority.service_install,false,'supplied bindings do not install servers');

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

const chained=compileStudioRoster({state_root:'/tmp/xiio-test',registry_ref:'ward://children',registry_digest:'sha256:test',registry_receipt_ref:'rcp:test',registry_complete:true,expected_product_count:2,products:[{product_id:'inbox',dependencies:['switchboard']},{product_id:'publisher',dependencies:['missing-child']}],external_dependencies:['switchboard']});
assert.equal(chained.registry_complete,false);
assert.equal(chained.registry_discovery.state,'WAIT_REGISTRY_UNBOUND');
assert.equal(chained.dependency_closure,false);
assert.equal(chained.blockers.some(x=>x.target==='ROSTER_DEPENDENCY'&&x.dependency==='missing-child'),true);

const sampledNoEdges=compileStudioRoster({state_root:'/tmp/xiio-test',products:[{product_id:'inbox'}]});
assert.equal(sampledNoEdges.dependency_closure,false,'NO_DECLARED_DEPENDENCIES_DOES_NOT_CLOSE_PARTIAL_GRAPH');
assert.equal(sampledNoEdges.supplied_dependency_closure,true);

assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[]}));
assert.throws(()=>compileStudioRoster({state_root:'/tmp/x',products:[{product_id:'same'},{product_id:'same'}]}));
assert.throws(()=>compileStudioHeadlessTopology({product_id:'x',state_root:'relative'}));
console.log('studio-headless-topology: PASS');

