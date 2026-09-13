const ROLES=['product_runtime','internal_mail_crm','switchboard_control'];
const SAFE=/^[a-z0-9][a-z0-9-]{1,62}$/;
const OWNERS={
 product_runtime:{owner_product:'INSTALL_TARGET',host_shell:'xi-io-Studio/Tauri',adapter_refs:[]},
 internal_mail_crm:{owner_product:'xi-io-Inbox',host_shell:'xi-io-Studio/Tauri',adapter_refs:['server/internal-team-crm-api.mjs','server/truth-sdk-crm-mailbox.mjs']},
 switchboard_control:{owner_product:'xi-io-Switchboard',host_shell:'HEADLESS',adapter_refs:['HEADLESS_ADAPTER_REQUIRED']}
};
function text(v,n){if(typeof v!=='string'||!v.trim())throw new Error(n+'_REQUIRED');return v.trim();}
export function compileStudioHeadlessTopology(input){
 if(!input||typeof input!=='object')throw new Error('INPUT_REQUIRED');
 const product_id=text(input.product_id,'PRODUCT_ID').toLowerCase().replace(/_/g,'-');
 if(!SAFE.test(product_id))throw new Error('PRODUCT_ID_INVALID');
 const base=Number.isInteger(input.base_port)?input.base_port:8800;
 if(base<1024||base>65000)throw new Error('BASE_PORT_INVALID');
 const root=text(input.state_root,'STATE_ROOT');
 if(!root.startsWith('/')||root==='/'||/\/\.\.(?:\/|$)/.test(root))throw new Error('STATE_ROOT_INVALID');
 const supplied=Array.isArray(input.servers)?input.servers:[];
 const servers=ROLES.map((role,i)=>{
  const row=supplied.find(x=>x?.role===role)||{}, ownership=OWNERS[role];
  return {role,server_id:`${product_id}:${role}`,owner_product:role==='product_runtime'?product_id:ownership.owner_product,host_shell:ownership.host_shell,adapter_refs:ownership.adapter_refs,bind_host:'127.0.0.1',port:Number.isInteger(row.port)?row.port:base+i,state_dir:`${root}/${product_id}/${role}`,health_path:row.health_path||'/health',state:row.verified===true?'SUPPLIED_UNVERIFIED':'MISSING',receipt_ref:row.receipt_ref||null};
 });
 const ports=servers.map(x=>x.port); if(new Set(ports).size!==ports.length||ports.some(x=>x<1024||x>65535))throw new Error('SERVER_PORT_COLLISION');
 const mail=servers.find(x=>x.role==='internal_mail_crm'),control=servers.find(x=>x.role==='switchboard_control'),runtime=servers.find(x=>x.role==='product_runtime');
 const cards=[
  {card_id:'HVT-001',target:'INTERNAL_MAIL_CRM_SERVER',owner_product:'xi-io-Inbox',depends_on:[],state:mail.state,why:'CRM and agent coordination have no usable transport without internal mail'},
  {card_id:'HVT-002',target:'SWITCHBOARD_HEADLESS_CONTROL_SERVER',owner_product:'xi-io-Switchboard',depends_on:['HVT-001'],state:control.state,why:'Cadence cannot admit, route or return work without the control server'},
  {card_id:'HVT-003',target:'PRODUCT_RUNTIME_SERVER',owner_product:product_id,depends_on:['HVT-001','HVT-002'],state:runtime.state,why:'A product runtime alone cannot participate in governed Studio work'},
  {card_id:'HVT-004',target:'CLOUDFLARE_DEV_PROJECTION',owner_product:'xi-io-Switchboard',depends_on:['HVT-001','HVT-002','HVT-003'],state:'PROPOSED',why:'Dev ingress follows local health and Switchboard admission'},
  {card_id:'HVT-005',target:'HEX_TAURI_INSTALL_RECEIPT',owner_product:'xi-io-hex',host_shell:'xi-io-Studio/Tauri',depends_on:['HVT-001','HVT-002','HVT-003','HVT-004'],state:'BLOCKED',why:'Installation closes only after native and dev readback'}
 ];
 const first=cards.find(c=>c.state!=='SUPPLIED_UNVERIFIED'&&c.depends_on.every(id=>cards.find(x=>x.card_id===id)?.state==='SUPPLIED_UNVERIFIED'))||cards[0];
 return {schema:'xiio.sdk.studio-headless-topology/v1',product_id,minimum_server_count:3,servers,quarantine:{loopback_only:true,state_root:root,user_existing_settings_mutated:false,separate_ports:true,dev_namespace_only:true},cloudflare:{hostname:`${product_id}.dev.xi-io.net`,state:'PROPOSED_NOT_APPLIED',owner_product:'xi-io-Switchboard',ward_admission_required:true},crm:{owner_product:'xi-io-Inbox',transport:'internal_mail_crm',external_email_fallback:false},installer:{owner_product:'xi-io-hex',host_shell:'xi-io-Studio/Tauri'},hvt_punchcards:cards,next_hvt:first.card_id,closure:false,authority:{cloudflare:false,service_install:false,provider_effect:false},hard:['ONE_SERVER!=STUDIO_INSTALL','CRM_WITHOUT_INTERNAL_MAIL=UNUSABLE','CADENCE_WITHOUT_SWITCHBOARD=PROJECTION_ONLY','LOCAL_HEALTH!=DEV_LIVE','PROPOSED_HOSTNAME!=DNS_EFFECT','USER_SETTINGS_MUTATION=DENIED','EXISTING_OWNER!=DUPLICATE_IMPLEMENTATION']};
}
