import crypto from 'node:crypto';

const SAFE=/^[a-z0-9][a-z0-9-]{1,62}$/;
const COMMS_ROLES=['email','ibal_golden','ibal_subterranean'];
const ROOT_ROLES=[
  ...COMMS_ROLES,
  'studio_web',
  'ack_api_gateway',
  'client_parent',
  'security_identity',
];
const CORE_CHILDREN=['bins','switchboard','ward'];

const ROOT_OWNERS={
  email:['xi-io-Inbox'],
  ibal_golden:['xi-io-Ibal'],
  ibal_subterranean:['xi-io-Ibal','xi-io_bins'],
  studio_web:['xi-io-Studio'],
  ack_api_gateway:['xi-io.net','xi-io-Switchboard'],
  client_parent:['xi-io-Studio','xi-io.net'],
  security_identity:['xi-io-Ward','AUTH_IDENTITY_BOUNDARY'],
};

function text(v,n){if(typeof v!=='string'||!v.trim())throw new Error(n+'_REQUIRED');return v.trim();}
function id(v){const x=text(v,'ID').toLowerCase().replace(/_/g,'-');if(!SAFE.test(x))throw new Error('ID_INVALID');return x;}
function stableUuid(...parts){
 const chars=crypto.createHash('sha256').update(parts.map(String).join('\u001f')).digest('hex').slice(0,32).split('');
 chars[12]='5';chars[16]=['8','9','a','b'][parseInt(chars[16],16)%4];
 const raw=chars.join('');
 return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}
function normalizeSupplied(input,key){return input&&typeof input==='object'&&input[key]&&typeof input[key]==='object'?input[key]:{};}
function serverState(row){return row?.verified===true?'SUPPLIED_UNVERIFIED':'MISSING';}

function rootServer(instanceId,role,index,base,root,input){
 const supplied=Array.isArray(input.root_servers)?input.root_servers.find(x=>x?.role===role)||{}:{};
 const bin=normalizeSupplied(input.bins,role);
 const rootUuid=stableUuid('xiio','studio-root',instanceId);
 return {
  role,
  server_class:'SHARED_ROOT',
  server_uuid:stableUuid(rootUuid,'root-server',role),
  root_instance_uuid:rootUuid,
  semantic_owners:[...ROOT_OWNERS[role]],
  bind_host:'127.0.0.1',
  port:Number.isInteger(supplied.port)?supplied.port:base+index,
  state_dir:`${root}/root/${role}`,
  health_path:supplied.health_path||'/health',
  state:serverState(supplied),
  receipt_ref:supplied.receipt_ref||null,
  bin:{
    registry:'xi-io_bins',
    ref:bin.ref||null,
    verified:bin.verified===true,
    receipt_ref:bin.receipt_ref||null,
  },
 };
}

function childServer(instanceId,raw,index,base,root){
 const product_id=id(raw?.product_id);
 const rootUuid=stableUuid('xiio','studio-root',instanceId);
 return {
  role:'child_runtime',
  server_class:'INSTALLED_CHILD',
  product_id,
  server_uuid:stableUuid(rootUuid,'child-server',product_id),
  root_instance_uuid:rootUuid,
  semantic_owners:[`xi-io:${product_id}`],
  bind_host:'127.0.0.1',
  port:Number.isInteger(raw?.port)?raw.port:base+100+index,
  state_dir:`${root}/children/${product_id}`,
  health_path:raw?.health_path||'/health',
  state:serverState(raw),
  receipt_ref:raw?.receipt_ref||null,
  dependencies:Array.isArray(raw?.dependencies)?raw.dependencies.map(id):[],
 };
}

export function compileStudioHeadlessTopology(input){
 if(!input||typeof input!=='object')throw new Error('INPUT_REQUIRED');
 const instance_id=id(input.instance_id||input.product_id||'studio-instance');
 const base=Number.isInteger(input.base_port)?input.base_port:8800;
 if(base<1024||base>64900)throw new Error('BASE_PORT_INVALID');
 const root=text(input.state_root,'STATE_ROOT');
 if(!root.startsWith('/')||root==='/'||/\/\.\.(?:\/|$)/.test(root))throw new Error('STATE_ROOT_INVALID');

 const root_servers=ROOT_ROLES.map((role,i)=>rootServer(instance_id,role,i,base,root,input));
 const childInput=Array.isArray(input.children)?input.children:[];
 const childIds=childInput.map(c=>id(c.product_id));
 if(new Set(childIds).size!==childIds.length)throw new Error('DUPLICATE_CHILD_PRODUCT_ID');
 const child_servers=childInput.map((child,i)=>childServer(instance_id,child,i,base,root));

 const all=[...root_servers,...child_servers];
 const ports=all.map(x=>x.port);
 if(new Set(ports).size!==ports.length||ports.some(x=>x<1024||x>65535))throw new Error('SERVER_PORT_COLLISION');
 const uuids=all.map(x=>x.server_uuid);
 if(new Set(uuids).size!==uuids.length)throw new Error('SERVER_UUID_COLLISION');

 const comms=root_servers.filter(s=>COMMS_ROLES.includes(s.role));
 const rootCurrent=root_servers.every(s=>s.state==='SUPPLIED_UNVERIFIED');
 const commsCurrent=comms.every(s=>s.state==='SUPPLIED_UNVERIFIED');
 const binsCurrent=comms.every(s=>s.bin.ref&&s.bin.verified&&s.bin.receipt_ref);
 const installed=new Set(child_servers.map(s=>s.product_id));
 const missingCore=CORE_CHILDREN.filter(x=>!installed.has(x));

 const cards=[
  {card_id:'HVT-001',target:'THREE_WAY_COMMS',state:commsCurrent?'SUPPLIED_UNVERIFIED':'MISSING',depends_on:[],why:'Email + Ibal Golden + Ibal Subterranean are the communications floor and ceiling'},
  {card_id:'HVT-002',target:'COMMS_BINS_BINDINGS',state:binsCurrent?'SUPPLIED_UNVERIFIED':'MISSING',depends_on:['HVT-001'],why:'Three-way communications require receipt-backed Bins references'},
  {card_id:'HVT-003',target:'SEVEN_ROOT_SERVERS',state:rootCurrent?'SUPPLIED_UNVERIFIED':'MISSING',depends_on:['HVT-001','HVT-002'],why:'Web, API, relationship and security planes complete the shared root without collapsing trust boundaries'},
  {card_id:'HVT-004',target:'CORE_CHILDREN',state:missingCore.length===0?'SUPPLIED_UNVERIFIED':'MISSING',depends_on:['HVT-003'],why:'Bins, Switchboard and Ward are required children for governed ACK/effect operation',missing:missingCore},
  {card_id:'HVT-005',target:'CHILD_SERVER_DENOMINATOR',state:child_servers.every(s=>s.state==='SUPPLIED_UNVERIFIED')?'SUPPLIED_UNVERIFIED':'MISSING',depends_on:['HVT-003'],why:'Every installed child requires at least one current child runtime server'},
  {card_id:'HVT-006',target:'HEX_TAURI_INSTALL_READBACK',state:'BLOCKED',depends_on:['HVT-003','HVT-004','HVT-005'],why:'Bootstrap/install closes only after Studio root and installed-child readback'}
 ];
 const done=c=>c.state==='SUPPLIED_UNVERIFIED';
 const first=cards.find(c=>!done(c)&&c.depends_on.every(x=>done(cards.find(y=>y.card_id===x))))||cards.find(c=>!done(c))||null;

 return {
  schema:'xiio.sdk.studio-headless-topology/v3',
  instance_id,
  root_instance_uuid:root_servers[0].root_instance_uuid,
  communications_server_count:3,
  shared_root_server_count:7,
  installed_child_count:child_servers.length,
  minimum_logical_server_count:7+child_servers.length,
  root_servers,
  child_servers,
  communications:{
   topology:'THREE_WAY',
   roles:[...COMMS_ROLES],
   serialized_uuid_mapping:true,
   clear_at_all_levels_required:true,
   golden_subterranean_mirror_required:true,
  },
  root_planes:{
   web:{role:'studio_web',rule:'PUBLIC_MARKETPLACE_AND_STUDIO_UI != PRIVILEGED_API'},
   api:{role:'ack_api_gateway',rule:'ACK_API_BROKER != ACK_ISSUER'},
   client_parent:{role:'client_parent',rule:'RELATIONSHIP_DIRECTORY != SECURITY_SECRET_BOUNDARY'},
   security:{role:'security_identity',rule:'WARD_POLICY != CREDENTIAL_STORE'},
  },
  ack:{
   gateway_role:'ack_api_gateway',
   issuer_owner:'xi-io_bins',
   issuer_child_required:true,
   rule:'BINS_IS_SOLE_ACK_INSTANCE_ISSUER'
  },
  core_children:{
   required:[...CORE_CHILDREN],
   missing:missingCore,
  },
  placement:{
   virtual_server_semantics:true,
   physical_machine_count_authority:false,
   colocation_allowed:true,
   trust_boundaries_must_remain_enforced:true,
  },
  web_projection:{
   marketplace:true,
   many_domains_supported:true,
   one_domain_per_server_required:false,
   install_authority:false,
  },
  hvt_punchcards:cards,
  next_hvt:first?.card_id||null,
  closure:false,
  authority:{provider_effect:false,install_effect:false,publish_effect:false},
  hard:[
   'COMMUNICATIONS_SERVER_COUNT=3',
   'SHARED_ROOT_SERVER_COUNT=7',
   'TOTAL_LOGICAL_SERVER_COUNT=7+INSTALLED_CHILD_COUNT',
   'ONE_INSTALLED_CHILD>=ONE_CHILD_RUNTIME_SERVER',
   'THREE_COMMS_SERVERS!=ENTIRE_ROOT_TOPOLOGY',
   'SERVER=VIRTUAL_TRUST_BOUNDARY!=PHYSICAL_MACHINE',
   'ACK_API_BROKER!=ACK_ISSUER',
   'BINS=SOLE_ACK_INSTANCE_ISSUER',
   'PUBLIC_WEB!=PRIVILEGED_API',
   'CLIENT_PARENT_DIRECTORY!=SECURITY_SECRET_BOUNDARY',
   'WARD_POLICY!=CREDENTIAL_STORE',
   'DOMAIN_COUNT!=SERVER_COUNT',
   'COLOCATION_ALLOWED!=TRUST_BOUNDARY_COLLAPSED',
  ]
 };
}

export function compileStudioRoster(input){
 if(!input||!Array.isArray(input.products))throw new Error('PRODUCT_ROSTER_REQUIRED');
 const products=input.products.map(p=>({product_id:id(p.product_id),...p}));
 if(new Set(products.map(p=>p.product_id)).size!==products.length)throw new Error('DUPLICATE_PRODUCT_ID');
 const root=compileStudioHeadlessTopology({
  instance_id:input.instance_id||'studio-instance',
  state_root:input.state_root,
  base_port:input.base_port,
  root_servers:input.root_servers,
  bins:input.bins,
  children:products,
 });
 const external=new Set(Array.isArray(input.external_dependencies)?input.external_dependencies.map(id):[]);
 const installed=new Set(products.map(p=>p.product_id));
 const dependencyBlockers=products.flatMap(p=>(Array.isArray(p.dependencies)?p.dependencies:[])
  .map(id)
  .filter(d=>!installed.has(d)&&!external.has(d))
  .map(dependency=>({target:'ROSTER_DEPENDENCY',product_id:p.product_id,dependency,state:'UNKNOWN_BLOCKED'})));
 const expected=Number.isInteger(input.expected_product_count)?input.expected_product_count:null;
 const registryProved=input.registry_complete===true
  &&typeof input.registry_ref==='string'
  &&typeof input.registry_digest==='string'
  &&typeof input.registry_receipt_ref==='string'
  &&expected===products.length;
 const blockers=[
  ...(registryProved?[]:[{target:'ROSTER_REGISTRY_PROOF',state:'UNKNOWN_BLOCKED',expected_product_count:expected,observed_product_count:products.length}]),
  ...dependencyBlockers,
  ...root.hvt_punchcards.filter(c=>c.state!=='SUPPLIED_UNVERIFIED'),
 ];
 return {
  schema:'xiio.sdk.studio-roster/v3',
  instance_id:root.instance_id,
  registry_complete:registryProved,
  dependency_closure:dependencyBlockers.length===0,
  products,
  product_count:products.length,
  communications_server_count:3,
  shared_root_server_count:7,
  child_server_count:products.length,
  server_count:7+products.length,
  root,
  blockers,
  closure:false,
  hard:[
   'PRODUCT_COUNT!=ROOT_SERVER_COUNT',
   'PRODUCT_COUNT=CHILD_SERVER_MINIMUM',
   'SERVER_COUNT=7+PRODUCT_COUNT',
   'REGISTRY_FLAG!=REGISTRY_PROOF',
   'UNRESOLVED_DEPENDENCY=BLOCKER'
  ]
 };
}
