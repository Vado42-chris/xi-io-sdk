import crypto from 'node:crypto';

export const REJOIN_TRANSPORT_REFRESH_SCHEMA='xiio.sdk.rejoin-transport-refresh/v1';
export const REJOIN_TRANSPORT_REFRESH_PACKET_SCHEMA='xiio.sdk.rejoin-transport-refresh-packet/v1';

const TRANSPORTS=new Set(['ACK','A2A','MCP','CRM','IMAP','SMTP','CLOUDFLARE','HTTP','SLACK']);
const APPLICABILITY=new Set(['REQUIRED','OPTIONAL','N_A']);
const STATES=new Set(['CURRENT','STALE','UNBOUND','UNKNOWN','BLOCKED']);
const EFFECTS=new Set(['NO_EFFECT','READ_ONLY','WRITE_CANDIDATE']);
const APPLY_STATES=new Set(['APPLY_RETURN','ALREADY_APPLIED_NO_OP']);
const EXTERNAL_WRITE_SENSITIVE=new Set(['SMTP','CLOUDFLARE','HTTP','SLACK']);

function text(value,code,max=512){
  const out=String(value??'').trim();
  if(!out||out.length>max) throw new Error(code);
  return out;
}
function optional(value,max=512){
  const out=String(value??'').trim();
  return out&&out.length<=max?out:null;
}
function list(value,code,max=64){
  if(value==null) return [];
  if(!Array.isArray(value)||value.length>max) throw new Error(code);
  return [...new Set(value.map((item)=>text(item,code,512)))];
}
function enumValue(value,allowed,code){
  const out=String(value??'').trim().toUpperCase();
  if(!allowed.has(out)) throw new Error(code);
  return out;
}
function iso(value,code){
  const raw=text(value,code,64);
  const parsed=new Date(raw);
  if(Number.isNaN(parsed.getTime())) throw new Error(code);
  return parsed.toISOString();
}
function id(prefix,parts){
  return `${prefix}:${crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0,24)}`;
}
function actionFor(transport){
  return ({
    ACK:'REVALIDATE_TYPED_ACK',
    A2A:'REFRESH_A2A_BINDING',
    MCP:'REFRESH_MCP_BINDING',
    CRM:'REFRESH_CRM_BINDING',
    IMAP:'REFRESH_IMAP_CAPABILITY',
    SMTP:'REFRESH_SMTP_CAPABILITY',
    CLOUDFLARE:'REFRESH_CLOUDFLARE_ROUTE',
    HTTP:'REFRESH_HTTP_BINDING',
    SLACK:'REFRESH_SLACK_BINDING',
  })[transport];
}

function normalizeBinding(input,parentGeneration){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('TRANSPORT_BINDING_OBJECT_REQUIRED');
  const transport=enumValue(input.transport,TRANSPORTS,'TRANSPORT_INVALID');
  const applicability=enumValue(input.applicability,APPLICABILITY,'APPLICABILITY_INVALID');
  const state=enumValue(input.state,STATES,'TRANSPORT_STATE_INVALID');
  const effectClass=enumValue(input.effect_class??'NO_EFFECT',EFFECTS,'EFFECT_CLASS_INVALID');
  const bindingRef=text(input.binding_ref,'BINDING_REF_REQUIRED',256);
  const consumerRef=text(input.consumer_ref,'CONSUMER_REF_REQUIRED',256);
  const boundGeneration=optional(input.bound_generation,256);
  const evidenceRefs=list(input.evidence_refs,'EVIDENCE_REFS_INVALID');
  const qualificationRef=optional(input.qualification_ref,512);
  const readbackRef=optional(input.readback_ref,512);
  const wardProfileRef=optional(input.ward_profile_ref,512);
  const authorityRef=optional(input.authority_ref,512);

  if(applicability==='N_A'){
    if(evidenceRefs.length===0) throw new Error(`N_A_EVIDENCE_REQUIRED:${bindingRef}`);
    return {
      binding_ref:bindingRef,transport,consumer_ref:consumerRef,applicability,
      state:'N_A_WITH_EVIDENCE',bound_generation:boundGeneration,effect_class:effectClass,
      evidence_refs:evidenceRefs,qualification_ref:qualificationRef,readback_ref:readbackRef,
      ward_profile_ref:wardProfileRef,authority_ref:authorityRef,
      disposition:'NO_EFFECT_WITH_EVIDENCE',refresh_required:false,refresh_packet:null,
    };
  }

  const generationCurrent=state==='CURRENT' && boundGeneration===parentGeneration;
  const writeSensitive=effectClass==='WRITE_CANDIDATE' && EXTERNAL_WRITE_SENSITIVE.has(transport);
  const writePreflightCurrent=!writeSensitive || Boolean(wardProfileRef&&authorityRef&&qualificationRef);
  const readbackCurrent=effectClass==='NO_EFFECT' || Boolean(readbackRef);
  const fullyCurrent=generationCurrent&&writePreflightCurrent&&readbackCurrent;

  let disposition;
  if(fullyCurrent) disposition='CURRENT';
  else if(state==='UNBOUND') disposition='UNBOUND';
  else if(state==='UNKNOWN') disposition='UNKNOWN';
  else if(writeSensitive&&!writePreflightCurrent) disposition='BLOCKED_EFFECT_PRECONDITION';
  else disposition='REFRESH_REQUIRED';

  const refreshRequired=disposition!=='CURRENT';
  const packet=refreshRequired?{
    schema:REJOIN_TRANSPORT_REFRESH_PACKET_SCHEMA,
    refresh_id:id('refresh',[bindingRef,parentGeneration]),
    binding_ref:bindingRef,
    transport,
    consumer_ref:consumerRef,
    target_generation:parentGeneration,
    prior_generation:boundGeneration,
    action:actionFor(transport),
    required_readback:effectClass!=='NO_EFFECT',
    required_ward_profile:writeSensitive,
    required_authority:writeSensitive,
    authority_granted:false,
    effect_ceiling:'READ_ONLY',
    provider_effect:false,
  }:null;

  return {
    binding_ref:bindingRef,transport,consumer_ref:consumerRef,applicability,state,
    bound_generation:boundGeneration,effect_class:effectClass,evidence_refs:evidenceRefs,
    qualification_ref:qualificationRef,readback_ref:readbackRef,ward_profile_ref:wardProfileRef,
    authority_ref:authorityRef,disposition,refresh_required:refreshRequired,refresh_packet:packet,
  };
}

export function compileRejoinTransportRefresh(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('REJOIN_REFRESH_INPUT_REQUIRED');
  const rootRef=text(input.root_ref,'ROOT_REF_REQUIRED',256);
  const workRef=text(input.work_ref,'WORK_REF_REQUIRED',256);
  const parentRef=text(input.parent_ref,'PARENT_REF_REQUIRED',256);
  const returnRef=text(input.return_ref,'RETURN_REF_REQUIRED',256);
  const applyReturnRef=text(input.apply_return_ref,'APPLY_RETURN_REF_REQUIRED',256);
  const applyReturnState=enumValue(input.apply_return_state,APPLY_STATES,'APPLY_RETURN_STATE_INVALID');
  const priorGeneration=text(input.parent_generation_before,'PARENT_GENERATION_BEFORE_REQUIRED',256);
  const parentGeneration=text(input.parent_generation_after,'PARENT_GENERATION_AFTER_REQUIRED',256);
  const observedAt=iso(input.observed_at,'OBSERVED_AT_INVALID');
  const rawBindings=Array.isArray(input.transport_bindings)?input.transport_bindings:[];
  if(rawBindings.length===0) throw new Error('TRANSPORT_BINDINGS_REQUIRED');

  const bindings=rawBindings.map((binding)=>normalizeBinding(binding,parentGeneration));
  const seen=new Set();
  for(const binding of bindings){
    if(seen.has(binding.binding_ref)) throw new Error(`DUPLICATE_BINDING_REF:${binding.binding_ref}`);
    seen.add(binding.binding_ref);
  }

  const required=bindings.filter((binding)=>binding.applicability==='REQUIRED');
  const requiredCurrent=required.filter((binding)=>binding.disposition==='CURRENT');
  const refreshPackets=bindings.map((binding)=>binding.refresh_packet).filter(Boolean);
  const unbound=bindings.filter((binding)=>binding.disposition==='UNBOUND').map((binding)=>binding.binding_ref);
  const unknown=bindings.filter((binding)=>binding.disposition==='UNKNOWN').map((binding)=>binding.binding_ref);
  const blocked=bindings.filter((binding)=>binding.disposition==='BLOCKED_EFFECT_PRECONDITION').map((binding)=>binding.binding_ref);
  const stale=bindings.filter((binding)=>binding.disposition==='REFRESH_REQUIRED').map((binding)=>binding.binding_ref);
  const allRequiredCurrent=required.length>0 && requiredCurrent.length===required.length;
  const changed=priorGeneration!==parentGeneration;

  return {
    schema:REJOIN_TRANSPORT_REFRESH_SCHEMA,
    root_ref:rootRef,
    work_ref:workRef,
    parent_ref:parentRef,
    return_ref:returnRef,
    apply_return_ref:applyReturnRef,
    apply_return_state:applyReturnState,
    parent_generation_before:priorGeneration,
    parent_generation_after:parentGeneration,
    parent_generation_changed:changed,
    observed_at:observedAt,
    status:allRequiredCurrent?'CURRENT':'REJOIN_REFRESH_REQUIRED',
    rejoin_complete:allRequiredCurrent,
    transport_bindings:bindings,
    refresh_packets:refreshPackets,
    counts:{
      total:bindings.length,
      required:required.length,
      required_current:requiredCurrent.length,
      refresh_required:refreshPackets.length,
      unbound:unbound.length,
      unknown:unknown.length,
      blocked_effect_precondition:blocked.length,
    },
    residue:{unbound,unknown,stale,blocked_effect_precondition:blocked},
    owner_ingress_required:false,
    authority_granted:false,
    provider_effects:0,
    next:allRequiredCurrent?'REAP_AND_REJOIN_READBACK':'HOST_ADAPTERS_EXECUTE_REFRESH_PACKETS_THEN_RECOMPILE',
    hard:[
      'RETURN != APPLY_RETURN',
      'APPLY_RETURN != TRANSPORT_REJOIN',
      'ACK_CURRENT_OLD_GENERATION != ACK_CURRENT_NEW_GENERATION',
      'A2A_PRESENT != A2A_CURRENT',
      'MCP_PRESENT != MCP_CURRENT',
      'CRM_PRESENT != IMAP_BOUND != SMTP_BOUND',
      'UNBOUND != CURRENT',
      'UNKNOWN != CURRENT',
      'PROVIDER_RESPONSE != READBACK',
      'WARD_PROFILE != EFFECT_AUTHORITY',
      'SDK_REFRESH_PACKET != PROVIDER_EFFECT',
    ],
  };
}
