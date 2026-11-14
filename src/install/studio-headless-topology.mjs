import { compileStudioRegistryIntake } from '../baseline/studio-registry-intake.mjs';

const ROLES=['product_runtime','internal_mail_crm','switchboard_control'];
const SAFE=/^[a-z0-9][a-z0-9-]{1,62}$/;
function text(v,n){if(typeof v!=='string'||!v.trim())throw new Error(n+'_REQUIRED');return v.trim();}
function id(v){const x=text(v,'PRODUCT_ID').toLowerCase().replace(/_/g,'-');if(!SAFE.test(x))throw new Error('PRODUCT_ID_INVALID');return x;}
function optionalText(v){return typeof v==='string'&&v.trim()?v.trim():null;}
function optionalObject(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
export function compileStudioHeadlessTopology(input){
 if(!input||typeof input!=='object')throw new Error('INPUT_REQUIRED');
 const product_id=id(input.product_id),base=Number.isInteger(input.base_port)?input.base_port:8800;
 if(base<1024||base>65000)throw new Error('BASE_PORT_INVALID');
 const root=text(input.state_root,'STATE_ROOT');
 if(!root.startsWith('/')||root==='/'||/\/\.\.(?:\/|$)/.test(root))throw new Error('STATE_ROOT_INVALID');
 const supplied=Array.isArray(input.servers)?input.servers:[],bins=optionalObject(input.bins);
 const binRegistry=optionalObject(input.bin_registry),registryOwner=optionalText(binRegistry.owner_product),registryRef=optionalText(binRegistry.registry_ref);
 const ingress=optionalObject(input.cloudflare),ingressOwner=optionalText(ingress.owner_product),ingressHostname=optionalText(ingress.hostname);
 const installer=optionalObject(input.installer),installerOwner=optionalText(installer.owner_product),installerShell=optionalText(installer.host_shell);
 const servers=ROLES.map((role,i)=>{
  const row=optionalObject(supplied.find(x=>x?.role===role)),bin=optionalObject(bins[role]);
  const owner=role==='product_runtime'?product_id:optionalText(row.owner_product),shell=optionalText(row.host_shell);
  const adapters=Array.isArray(row.adapter_refs)?row.adapter_refs.map(optionalText).filter(Boolean):[];
  return {role,server_id:`${product_id}:${role}`,owner_product:owner,host_shell:shell,adapter_refs:adapters,bin:{registry:registryRef,ref:bin.ref||null,verified:bin.verified===true,receipt_ref:bin.receipt_ref||null},bind_host:'127.0.0.1',port:Number.isInteger(row.port)?row.port:base+i,state_dir:`${root}/${product_id}/${role}`,health_path:row.health_path||'/health',state:row.verified===true&&owner&&shell?'SUPPLIED_UNVERIFIED':'MISSING',receipt_ref:row.receipt_ref||null};
 });
 const ports=servers.map(x=>x.port);if(new Set(ports).size!==ports.length||ports.some(x=>x<1024||x>65535))throw new Error('SERVER_PORT_COLLISION');
 const binsReady=Boolean(registryOwner&&registryRef)&&servers.every(x=>x.bin.ref&&x.bin.verified&&x.bin.receipt_ref),mail=servers[1],control=servers[2],runtime=servers[0];
 const cards=[
  {card_id:'HVT-001',target:'BIN_REGISTRY',owner_product:registryOwner,depends_on:[],state:binsReady?'SUPPLIED_UNVERIFIED':'MISSING',why:'No server is executable until every role resolves to a receipt-backed quarantined bin'},
  {card_id:'HVT-002',target:'INTERNAL_MAIL_CRM_SERVER',owner_product:mail.owner_product,depends_on:['HVT-001'],state:mail.state,why:'CRM and agent coordination have no usable transport without internal mail'},
  {card_id:'HVT-003',target:'SWITCHBOARD_HEADLESS_CONTROL_SERVER',owner_product:control.owner_product,depends_on:['HVT-001','HVT-002'],state:control.state,why:'Cadence cannot admit, route or return work without the control server'},
  {card_id:'HVT-004',target:'PRODUCT_RUNTIME_SERVER',owner_product:product_id,depends_on:['HVT-001','HVT-002','HVT-003'],state:runtime.state,why:'A product runtime alone cannot participate in governed Studio work'},
  {card_id:'HVT-005',target:'CLOUDFLARE_DEV_PROJECTION',owner_product:ingressOwner,depends_on:['HVT-001','HVT-002','HVT-003','HVT-004'],state:ingressHostname&&ingressOwner?'PROPOSED':'UNBOUND',why:'Dev ingress follows local health and Switchboard admission'},
  {card_id:'HVT-006',target:'HEX_TAURI_INSTALL_RECEIPT',owner_product:installerOwner,host_shell:installerShell,depends_on:['HVT-001','HVT-002','HVT-003','HVT-004','HVT-005'],state:'BLOCKED',why:'Installation closes only after native and dev readback'}
 ];
 const done=c=>c.state==='SUPPLIED_UNVERIFIED',first=cards.find(c=>!done(c)&&c.depends_on.every(x=>done(cards.find(y=>y.card_id===x))))||cards.find(c=>!done(c))||null;
 return {schema:'xiio.sdk.studio-headless-topology/v1',product_id,minimum_server_count:3,servers,bin_registry:{owner_product:registryOwner,registry_ref:registryRef,global_path_mutation:false,all_roles_receipted:binsReady},quarantine:{loopback_only:true,state_root:root,user_existing_settings_mutated:false,separate_ports:true,dev_namespace_only:true},cloudflare:{hostname:ingressHostname,state:ingressHostname&&ingressOwner?'PROPOSED_NOT_APPLIED':'UNBOUND',owner_product:ingressOwner,ward_admission_required:true},crm:{owner_product:mail.owner_product,transport:'internal_mail_crm',external_email_fallback:false},installer:{owner_product:installerOwner,host_shell:installerShell},hvt_punchcards:cards,next_hvt:first?.card_id||null,closure:false,authority:{cloudflare:false,service_install:false,provider_effect:false},hard:['ONE_SERVER!=STUDIO_INSTALL','BIN_NAME!=EXECUTABLE_RECEIPT','ROSTER_SAMPLE!=ROSTER','CRM_WITHOUT_INTERNAL_MAIL=UNUSABLE','CADENCE_WITHOUT_SWITCHBOARD=PROJECTION_ONLY','LOCAL_HEALTH!=DEV_LIVE','PROPOSED_HOSTNAME!=DNS_EFFECT','SUPPLIED_OWNER_REF!=HOST_CAPABILITY','UNBOUND_HOST_CAPABILITY!=RUNNABLE_SURFACE','USER_SETTINGS_MUTATION=DENIED','EXISTING_OWNER!=DUPLICATE_IMPLEMENTATION']};
}
export function compileStudioRoster(input){
 if(!input||typeof input!=='object')throw new Error('PRODUCT_ROSTER_REQUIRED');
 const discovery=compileStudioRegistryIntake(input.studio_registry);
 // A caller may scope a diagnostic to a subset, but the missing members remain
 // explicit. Without an explicit roster, derive the entire known member set
 // from Studio's supplied source, never a fixed list in SDK.
 const supplied=Array.isArray(input.products)&&input.products.length
   ?input.products
   :discovery.members.map(member=>({product_id:member.product_id}));
 if(!supplied.length)throw new Error('PRODUCT_ROSTER_REQUIRED');
 const evidenceNames=['data_forge','dotproject','bugzilla'],evidenceInput=input.evidence_stack&&typeof input.evidence_stack==='object'?input.evidence_stack:{};
 const evidence_stack=evidenceNames.map(name=>{const row=evidenceInput[name]||{};return {name,owner_product:row.owner_product||null,contract_ref:row.contract_ref||null,receipt_ref:row.receipt_ref||null,verified:row.verified===true,state:row.verified===true&&row.contract_ref&&row.receipt_ref?'SUPPLIED_UNVERIFIED':'UNKNOWN_BLOCKED'};});
 const seen=new Set(),base=Number.isInteger(input.base_port)?input.base_port:8800;
 const products=supplied.map((p,i)=>{const product_id=id(p.product_id);if(seen.has(product_id))throw new Error('DUPLICATE_PRODUCT_ID');seen.add(product_id);return {...compileStudioHeadlessTopology({...p,product_id,state_root:p.state_root||input.state_root,base_port:Number.isInteger(p.base_port)?p.base_port:base+i*10}),dependencies:Array.isArray(p.dependencies)?p.dependencies.map(id):[]};});
 const external=new Set(Array.isArray(input.external_dependencies)?input.external_dependencies.map(id):[]);
 const dependencyBlockers=products.flatMap(p=>p.dependencies.filter(d=>!seen.has(d)&&!external.has(d)).map(dependency=>({target:'ROSTER_DEPENDENCY',product_id:p.product_id,dependency,state:'UNKNOWN_BLOCKED'})));
 const expected=discovery.member_count;
 const missingMemberIds=discovery.member_ids.filter(member=>!seen.has(id(member)));
 const nonMemberIds=discovery.member_ids.length
   ?products.map(product=>product.product_id).filter(product=>!discovery.member_ids.some(member=>id(member)===product))
   :[];
 const knownMemberCoverage=discovery.counted_from_canonical_registry&&discovery.registry_count_consistent&&missingMemberIds.length===0;
 // A caller-supplied count/receipt was formerly enough to claim a complete
 // roster. It is not authenticated Studio discovery, and graph G1 is partial.
 const registryProved=knownMemberCoverage&&discovery.relationship_complete&&
   discovery.unknown_membership_ids.length===0&&discovery.blockers.length===0&&
   discovery.source.currentness==='VERIFIED';
 const registryBlockers=[
   {target:'ROSTER_REGISTRY_PROOF',state:'UNKNOWN_BLOCKED',expected_product_count:expected,observed_product_count:products.length,registry_ref:discovery.source.denominator_ref,reason:discovery.state},
   ...missingMemberIds.map(product_id=>({target:'ROSTER_MEMBER_MISSING',product_id,state:'UNKNOWN_BLOCKED'})),
   ...nonMemberIds.map(product_id=>({target:'ROSTER_MEMBERSHIP_NOT_CONFIRMED',product_id,state:'UNKNOWN_BLOCKED'})),
   ...discovery.unknown_membership_ids.map(product_id=>({target:'ROSTER_MEMBERSHIP_UNKNOWN',product_id,state:'UNKNOWN_BLOCKED'})),
   ...(discovery.relationship_complete?[]:[{target:'ROSTER_RELATIONSHIP_GRAPH_PARTIAL',state:'UNKNOWN_BLOCKED',reason:discovery.state}]),
 ];
 const productBlockers=products.flatMap(p=>p.hvt_punchcards.filter(c=>c.state!=='SUPPLIED_UNVERIFIED').map(c=>({product_id:p.product_id,...c})));
 const evidenceBlockers=evidence_stack.filter(x=>x.state!=='SUPPLIED_UNVERIFIED').map(x=>({target:'EVIDENCE_DEPENDENCY',...x}));
 const blockers=[...registryBlockers,...evidenceBlockers,...dependencyBlockers,...productBlockers];
 return {schema:'xiio.sdk.studio-roster/v1',registry_ref:discovery.source.denominator_ref,registry_digest:null,registry_receipt_ref:null,registry_complete:registryProved,registry_discovery:discovery,known_member_coverage:knownMemberCoverage,missing_member_ids:missingMemberIds,nonmember_or_unconfirmed_ids:nonMemberIds,relationship_complete:discovery.relationship_complete,evidence_stack,evidence_complete:evidenceBlockers.length===0,supplied_dependency_closure:dependencyBlockers.length===0,dependency_closure:registryProved&&dependencyBlockers.length===0,products,product_count:products.length,server_count:products.length*3,blockers,closure:false,hard:['REGISTRY_FLAG!=REGISTRY_PROOF','REGISTRY_COMPLETE_FALSE!=FULL_ROSTER','PRODUCT_OMISSION=BLOCKER','UNRESOLVED_DEPENDENCY=BLOCKER','PRODUCT_COUNT*3=MINIMUM_SERVER_COUNT','IMPACT_REPORT_WITHOUT_DATA_FORGE_DOTPROJECT_BUGZILLA=UNRELIABLE','PLACEHOLDER_ADAPTER!=IMPLEMENTATION','GRAPH_PARTIAL!=NO_EFFECT','SUPPLIED_DENOMINATOR!=AUTHENTICATED_ADOPTION','NO_DECLARED_DEPENDENCIES!=GRAPH_CLOSURE']};
}

