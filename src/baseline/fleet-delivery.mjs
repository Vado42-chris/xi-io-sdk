import crypto from 'node:crypto';

export const FLEET_DELIVERY_SCHEMA='xiio.sdk.fleet-delivery-gate/v1';
export const FLEET_DELIVERY_GATES=Object.freeze(['LIVE_BINS_CHECKOUT','HEX_LINUX_FLATPAK_EQUIVALENT']);
const STATES=new Set(['PASS','FAIL','WAIT','BLOCKED','UNKNOWN']);
const REQUIRED_5WH=Object.freeze(['who_ref','what_ref','where_ref','when_ref','why_ref','how_ref']);
const REQUIRED_HOST_ABI=Object.freeze(['host_ref','subject_ref','generation','receipt_ref','observed_at']);
const NON_LIVE_EVIDENCE=/^(UNKNOWN|SYNTHETIC|FIXTURE|LOCAL_SANDBOX|CONTAINER_SANDBOX|UNVERIFIED_PASTE)$/i;

function canonical(value){
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value){return `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`;}
function text(value,field,max=512){if(typeof value!=='string'||!value.trim()||value.length>max) throw new TypeError(`${field} requires bounded text`);return value.trim();}
function timestamp(value,field='observed_at'){const out=text(value,field,64);if(Number.isNaN(Date.parse(out))) throw new TypeError(`${field} requires valid timestamp`);return new Date(out).toISOString();}
function optionalText(value){return typeof value==='string'&&value.trim()&&value.length<=512?value.trim():null;}
function finiteNonNegative(value){return Number.isFinite(value)&&value>=0?value:null;}
function normalizeEvidence(value={}){
  const out={};
  for(const field of REQUIRED_5WH) out[field]=optionalText(value?.[field]);
  return out;
}
function normalizeHostAbi(value={}){
  const out={};
  for(const field of REQUIRED_HOST_ABI) out[field]=optionalText(value?.[field]);
  if(out.observed_at && Number.isNaN(Date.parse(out.observed_at))) out.observed_at=null;
  out.evidence_class=optionalText(value?.evidence_class)||'UNKNOWN';
  out.live_evidence_claim=!NON_LIVE_EVIDENCE.test(out.evidence_class);
  return out;
}
function normalizeGate(value={}){
  const declared=STATES.has(value?.state)?value.state:'UNKNOWN';
  const proofRef=optionalText(value?.proof_ref);
  const fiveWH=normalizeEvidence(value?.five_w_h);
  const hostAbi=normalizeHostAbi(value?.host_abi);
  const fiveWHComplete=REQUIRED_5WH.every(k=>Boolean(fiveWH[k]));
  const hostAbiComplete=REQUIRED_HOST_ABI.every(k=>Boolean(hostAbi[k]));
  let state=declared;
  let blocker=optionalText(value?.blocker);
  if(declared==='PASS'&&!proofRef){state='UNKNOWN';blocker='PASS_WITHOUT_PROOF_REF';}
  else if(declared==='PASS'&&!fiveWHComplete){state='UNKNOWN';blocker='PASS_WITHOUT_COMPLETE_5W_H';}
  else if(declared==='PASS'&&!hostAbiComplete){state='UNKNOWN';blocker='PASS_WITHOUT_HOST_ABI_COORDINATES';}
  else if(declared==='PASS'&&!hostAbi.live_evidence_claim){state='UNKNOWN';blocker='NON_LIVE_HOST_ABI_EVIDENCE';}
  const suppliedPass=state==='PASS'&&Boolean(proofRef)&&fiveWHComplete&&hostAbiComplete&&hostAbi.live_evidence_claim;
  return {
    state,
    declared_state:declared,
    proof_ref:proofRef,
    five_w_h:fiveWH,
    five_w_h_complete:fiveWHComplete,
    host_abi:hostAbi,
    host_abi_complete:hostAbiComplete,
    supplied_pass:suppliedPass,
    verified:false,
    blocker:blocker||null,
  };
}
function economics(value={}){
  const metrics={
    owner_manual_hops:finiteNonNegative(value?.owner_manual_hops),
    owner_restatements:finiteNonNegative(value?.owner_restatements),
    owner_minutes:finiteNonNegative(value?.owner_minutes),
    time_to_first_action_ms:finiteNonNegative(value?.time_to_first_action_ms),
    duplicate_work_avoided:finiteNonNegative(value?.duplicate_work_avoided),
  };
  const observed=Object.values(metrics).some(v=>v!==null);
  return {state:observed?'OBSERVED_PARTIAL_OR_COMPLETE':'UNMEASURED',metrics,money_delta:'UNMEASURED_NO_VALUE_RATE'};
}

export function compileFleetDeliveryGate(input){
  if(!input||typeof input!=='object'||!Array.isArray(input.projects)||!input.projects.length) throw new TypeError('projects required');
  const seen=new Set();
  const projects=input.projects.map((project)=>{
    if(!project||typeof project!=='object'||Array.isArray(project)) throw new TypeError('project must be an object');
    const projectRef=text(project.project_ref,'project_ref');
    if(seen.has(projectRef)) throw new TypeError(`duplicate project_ref ${projectRef}`);
    seen.add(projectRef);
    const observations=project.observations||{};
    const gates=FLEET_DELIVERY_GATES.map(id=>({id,...normalizeGate(observations[id])}));
    const suppliedGatePass=gates.every(g=>g.supplied_pass);
    const firstOpen=gates.find(g=>!g.supplied_pass)||null;
    return {
      project_ref:projectRef,
      repo_ref:optionalText(project.repo_ref),
      gates,
      gate_denominator:gates.length,
      supplied_gate_pass:suppliedGatePass,
      requirements_100:false,
      closure_state:suppliedGatePass?'WAIT_AUTHENTICATED_LIVE_READBACK':'OPEN',
      next:firstOpen?{gate:firstOpen.id,state:firstOpen.state,blocker:firstOpen.blocker||'GATE_NOT_SUPPLIED_PASS'}:{gate:'AUTHENTICATE_LIVE_BINS_HEX_READBACK',state:'WAIT',blocker:'SDK_CANNOT_AUTHENTICATE_PROVIDER_OR_HOST_RECEIPTS'},
      economics:economics(project.economics),
    };
  }).sort((a,b)=>a.project_ref.localeCompare(b.project_ref));
  const suppliedPass=projects.filter(p=>p.supplied_gate_pass).length;
  const openCogCount=projects.reduce((n,p)=>n+p.gates.filter(g=>!g.supplied_pass).length,0);
  const unknownCount=projects.reduce((n,p)=>n+p.gates.filter(g=>g.state==='UNKNOWN').length,0);
  const payload={
    schema:FLEET_DELIVERY_SCHEMA,
    source_generation:text(input.source_generation,'source_generation'),
    observed_at:timestamp(input.observed_at),
    project_denominator:projects.length,
    gates_per_project:FLEET_DELIVERY_GATES.length,
    gate_denominator:projects.length*FLEET_DELIVERY_GATES.length,
    supplied_gate_pass_projects:suppliedPass,
    verified_requirements_100_projects:0,
    projects_not_verified_100:projects.length,
    verified_truth_percent:0,
    fleet_requirements_100:false,
    evidence_state:'SUPPLIED_UNVERIFIED',
    authority_granted:false,
    provider_effect:false,
    deploy_eligible:false,
    projects,
    game:{candidate_ticks:suppliedPass,verified_ticks:0,open_cogs:openCogCount,hope_unknown:unknownCount,closure_credit:0},
    economics:{state:projects.some(p=>p.economics.state!=='UNMEASURED')?'OBSERVED_PARTIAL_OR_COMPLETE':'UNMEASURED',money_delta:'UNMEASURED_NO_VALUE_RATE'},
    hard:[
      'LIVE_BINS_CHECKOUT_AND_HEX_LINUX_FLATPAK_EQUIVALENT_REQUIRED_FOR_PROJECT_100S',
      'ONE_GATE_PASS!=PROJECT_100S',
      'SUPPLIED_PASS!=VERIFIED_PASS',
      'HOST_ABI_COORDINATES!=PROVIDER_AUTHENTICATION',
      'SYNTHETIC_OR_SANDBOX_HOST_ABI!=LIVE_GATE_EVIDENCE',
      '5W_H_COMPLETE!=RUNTIME_EFFECT',
      'FIXTURE_PASS!=LIVE_BINS_CHECKOUT',
      'HEX_SOURCE_PRESENT!=LINUX_INSTALL_FUNCTIONAL',
      'FLATPAK_CLI_PRESENT!=XIIO_PRODUCT_INSTALLED',
      'ACCOUNTING_100!=CLOSURE_100',
      'SYNTHETIC_SCORE!=TIME_MONEY_VALUE',
      'MONEY_DELTA_REQUIRES_EXPLICIT_VALUE_RATE_AND_OBSERVED_TIME',
      'SDK_COMPILER!=DEPLOY_AUTHORITY',
    ],
  };
  return {...payload,fleet_delivery_generation:digest(payload)};
}
