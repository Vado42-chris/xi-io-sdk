const ROLES=['product_runtime','internal_mail_crm','switchboard_control'];
const SAFE=/^[a-z0-9][a-z0-9-]{1,62}$/;
const OWNERS={
 product_runtime:{owner_product:'INSTALL_TARGET',host_shell:'xi-io-Studio/Tauri',adapter_refs:[]},
 internal_mail_crm:{owner_product:'xi-io-Inbox',host_shell:'xi-io-Studio/Tauri',adapter_refs:['server/internal-team-crm-api.mjs','server/truth-sdk-crm-mailbox.mjs']},
 switchboard_control:{owner_product:'xi-io-Switchboard',host_shell:'HEADLESS',adapter_refs:[]}
};
function text(v,n){if(typeof v!=='string'||!v.trim())throw new Error(n+'_REQUIRED');return v.trim();}
function id(v){const x=text(v,'PRODUCT_ID').toLowerCase().replace(/_/g,'-');if(!SAFE.test(x))throw new Error('PRODUCT_ID_INVALID');return x;}
export function compileStudioHeadlessTopology(input){
 if(!input||typeof input!=='object')throw new Error('INPUT_REQUIRED');
 const product_id=id(input.product_id),base=Number.isInteger(input.base_port)?input.base_port:8800;
 if(base<1024||base>65000)throw new Error('BASE_PORT_INVALID');
 const root=text(input.state_root,'STATE_ROOT');
 if(!root.startsWith('/')||root==='/'||/\/\.\.(?:\/|$)/.test(root))throw new Error('STATE_ROOT_INVALID');
 const supplied=Array.isArray(input.servers)?input.servers:[],bins=input.bins&&typeof input.bins==='object'?input.bins:{};
 const servers=ROLES.map((role,i)=>{
  const row=supplied.find(x=>x?.role===role)||{},ownership=OWNERS[role],bin=bins[role]||{};
  return {role,server_id:`${product_id}:${role}`,owner_product:role==='product_runtime'?product_id:ownership.owner_product,host_shell:ownership.host_shell,adapter_refs:ownership.adapter_refs,bin:{registry:'xi-io_bins',ref:bin.ref||null,verified:bin.verified===true,receipt_ref:bin.receipt_ref||null},bind_host:'127.0.0.1',port:Number.isInteger(row.port)?row.port:base+i,state_dir:`${root}/${product_id}/${role}`,health_path:row.health_path||'/health',state:row.verified===true?'SUPPLIED_UNVERIFIED':'MISSING',receipt_ref:row.receipt_ref||null};
 });
 const ports=servers.map(x=>x.port);if(new Set(ports).size!==ports.length||ports.some(x=>x<1024||x>65535))throw new Error('SERVER_PORT_COLLISION');
 const binsReady=servers.every(x=>x.bin.ref&&x.bin.verified&&x.bin.receipt_ref),mail=servers[1],control=servers[2],runtime=servers[0];
 const cards=[
  {card_id:'HVT-001',target:'BIN_REGISTRY',owner_product:'xi-io_bins',depends_on:[],state:binsReady?'SUPPLIED_UNVERIFIED':'MISSING',why:'No server is executable until every role resolves to a receipt-backed quarantined bin'},
  {card_id:'HVT-002',target:'INTERNAL_MAIL_CRM_SERVER',owner_product:'xi-io-Inbox',depends_on:['HVT-001'],state:mail.state,why:'CRM and agent coordination have no usable transport without internal mail'},
  {card_id:'HVT-003',target:'SWITCHBOARD_HEADLESS_CONTROL_SERVER',owner_product:'xi-io-Switchboard',depends_on:['HVT-001','HVT-002'],state:control.state,why:'Cadence cannot admit, route or return work without the control server'},
  {card_id:'HVT-004',target:'PRODUCT_RUNTIME_SERVER',owner_product:product_id,depends_on:['HVT-001','HVT-002','HVT-003'],state:runtime.state,why:'A product runtime alone cannot participate in governed Studio work'},
  {card_id:'HVT-005',target:'CLOUDFLARE_DEV_PROJECTION',owner_product:'xi-io-Switchboard',depends_on:['HVT-001','HVT-002','HVT-003','HVT-004'],state:'PROPOSED',why:'Dev ingress follows local health and Switchboard admission'},
  {card_id:'HVT-006',target:'HEX_TAURI_INSTALL_RECEIPT',owner_product:'xi-io-HEX',host_shell:'xi-io-Studio/Tauri',depends_on:['HVT-001','HVT-002','HVT-003','HVT-004','HVT-005'],state:'BLOCKED',why:'Installation closes only after native and dev readback'}
 ];
 const done=c=>c.state==='SUPPLIED_UNVERIFIED',first=cards.find(c=>!done(c)&&c.depends_on.every(x=>done(cards.find(y=>y.card_id===x))))||cards.find(c=>!done(c))||null;
 return {schema:'xiio.sdk.studio-headless-topology/v1',product_id,minimum_server_count:3,servers,bin_registry:{owner_product:'xi-io_bins',global_path_mutation:false,all_roles_receipted:binsReady},quarantine:{loopback_only:true,state_root:root,user_existing_settings_mutated:false,separate_ports:true,dev_namespace_only:true},cloudflare:{hostname:`${product_id}.dev.xi-io.net`,state:'PROPOSED_NOT_APPLIED',owner_product:'xi-io-Switchboard',ward_admission_required:true},crm:{owner_product:'xi-io-Inbox',transport:'internal_mail_crm',external_email_fallback:false},installer:{owner_product:'xi-io-HEX',host_shell:'xi-io-Studio/Tauri'},hvt_punchcards:cards,next_hvt:first?.card_id||null,closure:false,authority:{cloudflare:false,service_install:false,provider_effect:false},hard:['ONE_SERVER!=STUDIO_INSTALL','BIN_NAME!=EXECUTABLE_RECEIPT','ROSTER_SAMPLE!=ROSTER','CRM_WITHOUT_INTERNAL_MAIL=UNUSABLE','CADENCE_WITHOUT_SWITCHBOARD=PROJECTION_ONLY','LOCAL_HEALTH!=DEV_LIVE','PROPOSED_HOSTNAME!=DNS_EFFECT','USER_SETTINGS_MUTATION=DENIED','EXISTING_OWNER!=DUPLICATE_IMPLEMENTATION']};
}
export function compileStudioRoster(input){
 if(!input||!Array.isArray(input.products)||input.products.length===0)throw new Error('PRODUCT_ROSTER_REQUIRED');
 const evidenceNames=['data_forge','dotproject','bugzilla'],evidenceInput=input.evidence_stack&&typeof input.evidence_stack==='object'?input.evidence_stack:{};
 const evidence_stack=evidenceNames.map(name=>{const row=evidenceInput[name]||{},structural=row.verified===true&&typeof row.contract_ref==='string'&&row.contract_ref&&typeof row.receipt_ref==='string'&&row.receipt_ref;return {name,owner_product:row.owner_product||null,contract_ref:row.contract_ref||null,receipt_ref:row.receipt_ref||null,supplied_verified_claim:row.verified===true,structural_complete:Boolean(structural),verified:false,state:structural?'SUPPLIED_UNVERIFIED':'UNKNOWN_BLOCKED'};});
 const seen=new Set(),base=Number.isInteger(input.base_port)?input.base_port:8800;
 const products=input.products.map((p,i)=>{const product_id=id(p.product_id);if(seen.has(product_id))throw new Error('DUPLICATE_PRODUCT_ID');seen.add(product_id);const dependencies_declared=Array.isArray(p.dependencies);return {...compileStudioHeadlessTopology({...p,product_id,state_root:p.state_root||input.state_root,base_port:Number.isInteger(p.base_port)?p.base_port:base+i*10}),dependencies_declared,dependencies:dependencies_declared?p.dependencies.map(id):[]};});
 const external=new Set(Array.isArray(input.external_dependencies)?input.external_dependencies.map(id):[]);
 const missingDependencyDeclarations=products.filter(p=>!p.dependencies_declared).map(p=>({target:'PRODUCT_DEPENDENCY_DECLARATION',product_id:p.product_id,state:'UNKNOWN_BLOCKED'}));
 const unresolvedDependencies=products.flatMap(p=>p.dependencies.filter(d=>!seen.has(d)&&!external.has(d)).map(dependency=>({target:'ROSTER_DEPENDENCY',product_id:p.product_id,dependency,state:'UNKNOWN_BLOCKED'})));
 const dependencyBlockers=[...missingDependencyDeclarations,...unresolvedDependencies];
 const expected=Number.isInteger(input.expected_product_count)?input.expected_product_count:null;
 const registryStructural=input.registry_complete===true&&typeof input.registry_ref==='string'&&Boolean(input.registry_ref)&&typeof input.registry_digest==='string'&&Boolean(input.registry_digest)&&typeof input.registry_receipt_ref==='string'&&Boolean(input.registry_receipt_ref)&&expected===products.length;
 const registryBlockers=registryStructural
  ?[{target:'ROSTER_REGISTRY_NATIVE_VERIFICATION',state:'SUPPLIED_UNVERIFIED',expected_product_count:expected,observed_product_count:products.length,registry_ref:input.registry_ref||null,registry_digest:input.registry_digest||null,registry_receipt_ref:input.registry_receipt_ref||null}]
  :[{target:'ROSTER_REGISTRY_PROOF',state:'UNKNOWN_BLOCKED',expected_product_count:expected,observed_product_count:products.length,registry_ref:input.registry_ref||null,registry_digest:input.registry_digest||null,registry_receipt_ref:input.registry_receipt_ref||null}];
 const productBlockers=products.flatMap(p=>p.hvt_punchcards.filter(c=>c.state!=='SUPPLIED_UNVERIFIED').map(c=>({product_id:p.product_id,...c})));
 const evidenceStructural=evidence_stack.every(x=>x.structural_complete);
 const evidenceBlockers=evidence_stack.map(x=>({target:x.structural_complete?'EVIDENCE_NATIVE_VERIFICATION':'EVIDENCE_DEPENDENCY',...x}));
 const blockers=[...registryBlockers,...evidenceBlockers,...dependencyBlockers,...productBlockers];
 return {schema:'xiio.sdk.studio-roster/v1',registry_ref:input.registry_ref||null,registry_digest:input.registry_digest||null,registry_receipt_ref:input.registry_receipt_ref||null,registry_structural_complete:registryStructural,registry_complete:false,registry_proof_state:registryStructural?'SUPPLIED_UNVERIFIED':'UNKNOWN_BLOCKED',evidence_stack,evidence_structural_complete:evidenceStructural,evidence_complete:false,evidence_proof_state:evidenceStructural?'SUPPLIED_UNVERIFIED':'UNKNOWN_BLOCKED',dependency_declarations_complete:missingDependencyDeclarations.length===0,dependency_closure:dependencyBlockers.length===0,products,product_count:products.length,server_count:products.length*3,verification_required:[...(registryStructural?['STUDIO_REGISTRY_PROVIDER_NATIVE_VERIFIER']:[]),...(evidenceStructural?['BINS_EVIDENCE_PROVIDER_NATIVE_VERIFIER']:[])],blockers,closure:false,hard:['REGISTRY_FLAG!=REGISTRY_PROOF','CALLER_ASSERTED_REGISTRY_PROOF!=TRUSTED_REGISTRY_PROOF','SUPPLIED_UNVERIFIED!=COMPLETE','MISSING_DEPENDENCY_DECLARATION!=NO_DEPENDENCIES','REGISTRY_COMPLETE_FALSE!=FULL_ROSTER','PRODUCT_OMISSION=BLOCKER','UNRESOLVED_DEPENDENCY=BLOCKER','PRODUCT_COUNT*3=MINIMUM_SERVER_COUNT','IMPACT_REPORT_WITHOUT_DATA_FORGE_DOTPROJECT_BUGZILLA=UNRELIABLE','PLACEHOLDER_ADAPTER!=IMPLEMENTATION']};
}
