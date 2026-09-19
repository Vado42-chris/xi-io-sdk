import crypto from 'node:crypto';

const ROLES=['email','ibal_golden','ibal_subterranean'];
const SAFE=/^[a-z0-9][a-z0-9-]{1,62}$/;
const OWNERS={
 email:{owner_product:'xi-io-Inbox',host_shell:'xi-io-Studio/Tauri',adapter_refs:['server/truth-sdk-crm-mailbox.mjs']},
 ibal_golden:{owner_product:'xi-io-Ibal',host_shell:'xi-io-Studio/Tauri',adapter_refs:[]},
 ibal_subterranean:{owner_product:'xi-io-Ibal',host_shell:'xi-io-Studio/Tauri',adapter_refs:['xi-io_bins']}
};
function text(v,n){if(typeof v!=='string'||!v.trim())throw new Error(n+'_REQUIRED');return v.trim();}
function id(v){const x=text(v,'PRODUCT_ID').toLowerCase().replace(/_/g,'-');if(!SAFE.test(x))throw new Error('PRODUCT_ID_INVALID');return x;}
function stableUuid(...parts){
 const chars=crypto.createHash('sha256').update(parts.map(String).join('\u001f')).digest('hex').slice(0,32).split('');
 chars[12]='5';chars[16]=['8','9','a','b'][parseInt(chars[16],16)%4];
 const raw=chars.join('');
 return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}
function channelState(row){return row?.verified===true?'SUPPLIED_UNVERIFIED':'MISSING';}

export function compileStudioHeadlessTopology(input){
 if(!input||typeof input!=='object')throw new Error('INPUT_REQUIRED');
 const product_id=id(input.product_id),base=Number.isInteger(input.base_port)?input.base_port:8800;
 if(base<1024||base>65000)throw new Error('BASE_PORT_INVALID');
 const root=text(input.state_root,'STATE_ROOT');
 if(!root.startsWith('/')||root==='/'||/\/\.\.(?:\/|$)/.test(root))throw new Error('STATE_ROOT_INVALID');
 const supplied=Array.isArray(input.servers)?input.servers:[],bins=input.bins&&typeof input.bins==='object'?input.bins:{};
 const root_channel_uuid=stableUuid('xiio','studio-three-way-comms',product_id);
 const servers=ROLES.map((role,i)=>{
  const row=supplied.find(x=>x?.role===role)||{},ownership=OWNERS[role],bin=bins[role]||{};
  return {
   role,
   channel_uuid:stableUuid(root_channel_uuid,role),
   root_channel_uuid,
   server_id:`${product_id}:${role}`,
   owner_product:ownership.owner_product,
   host_shell:ownership.host_shell,
   adapter_refs:ownership.adapter_refs,
   bin:{registry:'xi-io_bins',ref:bin.ref||null,verified:bin.verified===true,receipt_ref:bin.receipt_ref||null},
   bind_host:'127.0.0.1',
   port:Number.isInteger(row.port)?row.port:base+i,
   state_dir:`${root}/${product_id}/${role}`,
   health_path:row.health_path||'/health',
   state:channelState(row),
   receipt_ref:row.receipt_ref||null
  };
 });
 const ports=servers.map(x=>x.port);
 if(new Set(ports).size!==ports.length||ports.some(x=>x<1024||x>65535))throw new Error('SERVER_PORT_COLLISION');
 const uuids=servers.map(x=>x.channel_uuid);
 if(new Set(uuids).size!==uuids.length)throw new Error('CHANNEL_UUID_COLLISION');
 const binsReady=servers.every(x=>x.bin.ref&&x.bin.verified&&x.bin.receipt_ref);
 const email=servers.find(x=>x.role==='email');
 const golden=servers.find(x=>x.role==='ibal_golden');
 const subterranean=servers.find(x=>x.role==='ibal_subterranean');
 const threeWayCurrent=[email,golden,subterranean].every(x=>x.state==='SUPPLIED_UNVERIFIED');
 const cards=[
  {card_id:'HVT-001',target:'BIN_REGISTRY',owner_product:'xi-io_bins',depends_on:[],state:binsReady?'SUPPLIED_UNVERIFIED':'MISSING',why:'All three channels require receipt-backed Bins bindings before execution credit'},
  {card_id:'HVT-002',target:'EMAIL_CHANNEL',owner_product:'xi-io-Inbox',depends_on:['HVT-001'],state:email.state,why:'Email is one leg of the three-way communications floor/ceiling'},
  {card_id:'HVT-003',target:'IBAL_GOLDEN_CHANNEL',owner_product:'xi-io-Ibal',depends_on:['HVT-001','HVT-002'],state:golden.state,why:'Golden is the visible targeting/projection leg'},
  {card_id:'HVT-004',target:'IBAL_SUBTERRANEAN_CHANNEL',owner_product:'xi-io-Ibal',depends_on:['HVT-001','HVT-002','HVT-003'],state:subterranean.state,why:'Subterranean is the Bins-backed hidden-state/mirror leg'},
  {card_id:'HVT-005',target:'THREE_WAY_UUID_RECONCILIATION',owner_product:'xi-io-Ibal',depends_on:['HVT-001','HVT-002','HVT-003','HVT-004'],state:threeWayCurrent?'SUPPLIED_UNVERIFIED':'MISSING',why:'Email, Golden and Subterranean must reconcile through one serialized root UUID lineage'},
  {card_id:'HVT-006',target:'HEX_TAURI_INSTALL_RECEIPT',owner_product:'xi-io-HEX',host_shell:'xi-io-Studio/Tauri',depends_on:['HVT-001','HVT-002','HVT-003','HVT-004','HVT-005'],state:'BLOCKED',why:'HEX native install closes only after three-way channel health and Studio launch readback'}
 ];
 const done=c=>c.state==='SUPPLIED_UNVERIFIED';
 const first=cards.find(c=>!done(c)&&c.depends_on.every(x=>done(cards.find(y=>y.card_id===x))))||cards.find(c=>!done(c))||null;
 return {
  schema:'xiio.sdk.studio-headless-topology/v2',
  product_id,
  minimum_server_count:3,
  root_channel_uuid,
  servers,
  communications:{
   topology:'THREE_WAY',
   roles:[...ROLES],
   clear_at_all_levels_required:true,
   serialized_uuid_mapping:true,
   mirror_rule:'IBAL_GOLDEN<->IBAL_SUBTERRANEAN_BY_SHARED_ROOT_CHANNEL_UUID',
   email_rule:'EMAIL_OCCURRENCES_MUST_BIND_TO_THE_SAME_COORDINATE/ROOT_UUID_LINEAGE'
  },
  semantic_services:{
   calendar_crm:{owner_product:'xi-io-Calendar',carried_over:['email','ibal_golden','ibal_subterranean']},
   tasks:{owner_product:'xi-io-Tasks',composition:['bugzilla','dotproject'],carried_over:['email','ibal_golden','ibal_subterranean']},
   switchboard:{owner_product:'xi-io-Switchboard',role:'ADMISSION_AND_EFFECT_ROUTING_NOT_A_PHYSICAL_FOURTH_SERVER'}
  },
  bin_registry:{owner_product:'xi-io_bins',global_path_mutation:false,all_roles_receipted:binsReady},
  quarantine:{loopback_only:true,state_root:root,user_existing_settings_mutated:false,separate_ports:true,dev_namespace_only:true},
  web_projection:{surface:'MARKETPLACE_CATALOG_ONLY',runtime_install_authority:false,launch_authority:false,provider_effect:false},
  installer:{owner_product:'xi-io-HEX',host_shell:'xi-io-Studio/Tauri'},
  hvt_punchcards:cards,
  next_hvt:first?.card_id||null,
  closure:false,
  authority:{service_install:false,provider_effect:false,marketplace_effect:false},
  hard:[
   'THREE_SERVER_COUNT_IS_TOPOLOGY_INVARIANT',
   'THREE_SERVER_COUNT!=NUMBER_OF_PRODUCTS',
   'EMAIL!=CRM',
   'CRM=CALENDAR',
   'TASKS=BUGZILLA+DOTPROJECT_COMPOSITE',
   'IBAL_GOLDEN!=IBAL_SUBTERRANEAN',
   'GOLDEN_WITHOUT_SUBTERRANEAN_MIRROR=FLATPLANE',
   'SUBTERRANEAN_WITHOUT_GOLDEN_PROJECTION=FLATPLANE',
   'CHANNEL_NAME!=CHANNEL_UUID',
   'MATCHED_UUID!=CURRENT_GENERATION',
   'WEB_MARKETPLACE!=TAURI_INSTALLER',
   'MARKETPLACE_LISTING!=INSTALL_AUTHORITY',
   'HEX_TAURI_INSTALL!=HEX_WEB_MARKETPLACE',
   'BIN_NAME!=EXECUTABLE_RECEIPT',
   'LOCAL_HEALTH!=DEV_LIVE',
   'USER_SETTINGS_MUTATION=DENIED'
  ]
 };
}

export function compileStudioRoster(input){
 if(!input||!Array.isArray(input.products)||input.products.length===0)throw new Error('PRODUCT_ROSTER_REQUIRED');
 const evidenceNames=['data_forge','dotproject','bugzilla'],evidenceInput=input.evidence_stack&&typeof input.evidence_stack==='object'?input.evidence_stack:{};
 const evidence_stack=evidenceNames.map(name=>{const row=evidenceInput[name]||{};return {name,owner_product:row.owner_product||null,contract_ref:row.contract_ref||null,receipt_ref:row.receipt_ref||null,verified:row.verified===true,state:row.verified===true&&row.contract_ref&&row.receipt_ref?'SUPPLIED_UNVERIFIED':'UNKNOWN_BLOCKED'};});
 const seen=new Set(),base=Number.isInteger(input.base_port)?input.base_port:8800;
 const products=input.products.map((p,i)=>{const product_id=id(p.product_id);if(seen.has(product_id))throw new Error('DUPLICATE_PRODUCT_ID');seen.add(product_id);return {...compileStudioHeadlessTopology({...p,product_id,state_root:p.state_root||input.state_root,base_port:Number.isInteger(p.base_port)?p.base_port:base+i*10}),dependencies:Array.isArray(p.dependencies)?p.dependencies.map(id):[]};});
 const external=new Set(Array.isArray(input.external_dependencies)?input.external_dependencies.map(id):[]);
 const dependencyBlockers=products.flatMap(p=>p.dependencies.filter(d=>!seen.has(d)&&!external.has(d)).map(dependency=>({target:'ROSTER_DEPENDENCY',product_id:p.product_id,dependency,state:'UNKNOWN_BLOCKED'})));
 const expected=Number.isInteger(input.expected_product_count)?input.expected_product_count:null;
 const registryProved=input.registry_complete===true&&typeof input.registry_ref==='string'&&typeof input.registry_digest==='string'&&typeof input.registry_receipt_ref==='string'&&expected===products.length;
 const registryBlockers=registryProved?[]:[{target:'ROSTER_REGISTRY_PROOF',state:'UNKNOWN_BLOCKED',expected_product_count:expected,observed_product_count:products.length,registry_ref:input.registry_ref||null,registry_digest:input.registry_digest||null,registry_receipt_ref:input.registry_receipt_ref||null}];
 const productBlockers=products.flatMap(p=>p.hvt_punchcards.filter(c=>c.state!=='SUPPLIED_UNVERIFIED').map(c=>({product_id:p.product_id,...c})));
 const evidenceBlockers=evidence_stack.filter(x=>x.state!=='SUPPLIED_UNVERIFIED').map(x=>({target:'EVIDENCE_DEPENDENCY',...x}));
 const blockers=[...registryBlockers,...evidenceBlockers,...dependencyBlockers,...productBlockers];
 return {
  schema:'xiio.sdk.studio-roster/v2',
  registry_ref:input.registry_ref||null,
  registry_digest:input.registry_digest||null,
  registry_receipt_ref:input.registry_receipt_ref||null,
  registry_complete:registryProved,
  evidence_stack,
  evidence_complete:evidenceBlockers.length===0,
  dependency_closure:dependencyBlockers.length===0,
  products,
  product_count:products.length,
  server_count:products.length*3,
  blockers,
  closure:false,
  hard:[
   'REGISTRY_FLAG!=REGISTRY_PROOF',
   'REGISTRY_COMPLETE_FALSE!=FULL_ROSTER',
   'PRODUCT_OMISSION=BLOCKER',
   'UNRESOLVED_DEPENDENCY=BLOCKER',
   'PRODUCT_COUNT*3=MINIMUM_SERVER_COUNT',
   'IMPACT_REPORT_WITHOUT_DATA_FORGE_DOTPROJECT_BUGZILLA=UNRELIABLE',
   'PLACEHOLDER_ADAPTER!=IMPLEMENTATION'
  ]
 };
}
