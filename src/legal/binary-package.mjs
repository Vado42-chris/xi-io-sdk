import crypto from 'node:crypto';
import { compileAckItemTrinity } from '../acks/item-trinity.mjs';

export const LEGAL_BINARY_INPUT_SCHEMA = 'xiio.sdk.legal-binary-package-input/v1';
export const LEGAL_BINARY_SCHEMA = 'xiio.sdk.legal-binary-package/v1';

const ANSWERS = new Set(['YES','NO','ASK_MORE_DETAILS','N_A']);
const EFFECTS = new Set(['NONE','OWNER','OATH','SERVICE','FILING','REGISTRY','PROVIDER']);
const SCALES = new Set(['META','MESO','MICRO']);
const FIVE_D_KEYS = ['WHERE','WHAT','HOW_WHO','WHEN','WHY'];
const bounded = (v,max=1024) => typeof v==='string' && v.trim()===v && v.length>0 && v.length<=max;
const refs = (v=[]) => {
  if(!Array.isArray(v)) throw new TypeError('refs must be array');
  return [...new Set(v.map(x=>{ if(!bounded(x)) throw new TypeError('invalid ref'); return x; }))].sort();
};
const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])) : v;
const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const uuidFrom = (v) => {
  const h=sha(v);
  return [h.slice(0,8),h.slice(8,12),'5'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20,32)].join('-');
};

function answerBits(answer){
  if(answer==='YES') return {known_bit:1,value_bit:1};
  if(answer==='NO') return {known_bit:1,value_bit:0};
  if(answer==='ASK_MORE_DETAILS') return {known_bit:0,value_bit:0};
  return {known_bit:1,value_bit:1};
}

function normalizeFact(raw,input){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new TypeError('fact invalid');
  for(const k of ['fact_id','question','owner_ref','work_ref','source_generation']) if(!bounded(raw[k])) throw new TypeError(`${k} required`);
  if(!ANSWERS.has(raw.answer)) throw new TypeError(`answer invalid: ${raw.fact_id}`);
  if(!EFFECTS.has(raw.effect_class ?? 'NONE')) throw new TypeError(`effect_class invalid: ${raw.fact_id}`);
  const source_refs=refs(raw.source_refs);
  if(raw.answer!=='ASK_MORE_DETAILS' && raw.answer!=='N_A' && source_refs.length===0) throw new TypeError(`known fact requires source_refs: ${raw.fact_id}`);
  const bits=answerBits(raw.answer);
  return {
    fact_id:raw.fact_id,
    question:raw.question,
    answer:raw.answer,
    ...bits,
    applicable_bit:raw.answer==='N_A'?0:1,
    required_bit:raw.required_bit===0?0:1,
    material_bit:raw.material_bit===0?0:1,
    owner_ref:raw.owner_ref,
    work_ref:raw.work_ref,
    source_refs,
    source_generation:raw.source_generation,
    issue_refs:refs(raw.issue_refs),
    consumer_refs:refs(raw.consumer_refs),
    effect_class:raw.effect_class ?? 'NONE',
    user_choice_bit:raw.user_choice_bit===1?1:0,
    currentness:raw.currentness ?? ((raw.answer==='ASK_MORE_DETAILS' && source_refs.length===0) ? 'UNKNOWN' : 'CURRENT'),
    priority_rank:Number.isInteger(raw.priority_rank) && raw.priority_rank>=0 ? raw.priority_rank : 1000,
    note:bounded(raw.note ?? '',2048)?raw.note:null,
    root_ref:input.root_ref,
  };
}

function normalizeItem(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new TypeError('package item invalid');
  for(const k of ['item_id','path_ref','role']) if(!bounded(raw[k])) throw new TypeError(`${k} required`);
  const required_fact_ids=refs(raw.required_fact_ids);
  return {
    item_id:raw.item_id,
    path_ref:raw.path_ref,
    role:raw.role,
    required_bit:raw.required_bit===0?0:1,
    present_bit:raw.present_bit===1?1:0,
    current_bit:raw.current_bit===1?1:0,
    source_bound_bit:raw.source_bound_bit===1?1:0,
    consumer_bound_bit:raw.consumer_bound_bit===1?1:0,
    required_fact_ids,
    evidence_refs:refs(raw.evidence_refs),
    owner_gate_bit:raw.owner_gate_bit===1?1:0,
    executed_bit:raw.executed_bit===1?1:0,
  };
}

function factState(f){
  if(f.answer==='N_A') return 'N_A_WITH_EVIDENCE';
  if(f.answer==='YES') return 'PASS';
  if(f.answer==='NO') return 'FAIL';
  return 'UNKNOWN';
}

export function compileLegalBinaryPackage(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('input must be object');
  if(input.schema!==LEGAL_BINARY_INPUT_SCHEMA) throw new TypeError('input schema mismatch');
  for(const k of ['root_ref','root_generation','user_ref','product_ref','studio_root_ref','ack_ref','ack_generation','sdk_ref','sdk_generation','work_ref']) {
    if(!bounded(input[k])) throw new TypeError(`${k} required`);
  }
  if(!SCALES.has(input.scale)) throw new TypeError('scale must be META|MESO|MICRO');
  if(!input.five_d || typeof input.five_d!=='object' || Array.isArray(input.five_d)) throw new TypeError('five_d required');
  for(const key of FIVE_D_KEYS) if(!bounded(input.five_d[key])) throw new TypeError(`five_d.${key} required`);
  if(input.scale!=='META' && !bounded(input.parent_ref)) throw new TypeError('parent_ref required below META');
  if(input.scale!=='MICRO' && !bounded(input.impact_assessment_ref)) throw new TypeError('impact_assessment_ref required at META/MESO');
  if(input.ack_current_bit!==1) throw new TypeError('fresh ACK required');
  if(input.sdk_current_bit!==1) throw new TypeError('fresh SDK required');
  if(input.running_consumption_bit!==1) throw new TypeError('running ACK/SDK consumption required');
  if(!Array.isArray(input.facts) || !input.facts.length) throw new TypeError('facts required');
  if(!Array.isArray(input.package_items) || !input.package_items.length) throw new TypeError('package_items required');

  const facts=input.facts.map(x=>normalizeFact(x,input));
  const factIds=new Set();
  for(const f of facts){ if(factIds.has(f.fact_id)) throw new TypeError(`duplicate fact_id: ${f.fact_id}`); factIds.add(f.fact_id); }
  const items=input.package_items.map(normalizeItem);
  const itemIds=new Set();
  for(const i of items){ if(itemIds.has(i.item_id)) throw new TypeError(`duplicate item_id: ${i.item_id}`); itemIds.add(i.item_id); for(const id of i.required_fact_ids) if(!factIds.has(id)) throw new TypeError(`unknown required fact ${id} for ${i.item_id}`); }

  const ackInput={
    schema:'xiio.sdk.ack-item-trinity-input/v1',
    root_ref:input.root_ref,
    root_generation:input.root_generation,
    scale:input.scale,
    parent_ref:input.parent_ref ?? null,
    impact_assessment_ref:input.impact_assessment_ref ?? null,
    five_d:{...input.five_d},
    studio_root_ref:input.studio_root_ref,
    ack_sources:[{
      ack_ref:input.ack_ref,
      ack_generation:input.ack_generation,
      root_generation:input.root_generation,
      items:facts.map(f=>({
        item_id:f.fact_id,
        path_ref:`facts.${f.fact_id}`,
        label:f.question,
        applicable_bit:f.applicable_bit,
        required_bit:f.required_bit,
        material_bit:f.material_bit,
        owner_ref:f.owner_ref,
        work_ref:f.work_ref,
        declared_state:factState(f),
        evidence_refs:f.source_refs,
        hex_qualification:{state:'UNVERIFIED',receipt_ref:null},
        currentness:{state:f.currentness==='CURRENT'?'CURRENT':f.currentness==='STALE'?'STALE':'UNKNOWN',evidence_ref:f.source_refs[0] ?? null},
        result_ref:null,
        return_ref:null,
        apply_return_ref:null,
        reap_state:'PENDING',
      }))
    }]
  };
  const ack_trinity=compileAckItemTrinity(ackInput);

  const dataforge_records=facts.map(f=>{
    const event_uuid=uuidFrom([input.root_ref,input.root_generation,f.fact_id,f.source_generation,f.source_refs]);
    return {
      schema:'xiio.dataforge.legal-fact/v1',
      dataforge_event_uuid:event_uuid,
      root_ref:input.root_ref,
      work_ref:f.work_ref,
      fact_id:f.fact_id,
      question:f.question,
      answer:f.answer,
      known_bit:f.known_bit,
      value_bit:f.value_bit,
      source_refs:f.source_refs,
      source_generation:f.source_generation,
      issue_refs:f.issue_refs,
      consumer_refs:f.consumer_refs,
      effect_class:f.effect_class,
      owner_ref:f.owner_ref,
      user_choice_bit:f.user_choice_bit,
      currentness:f.currentness,
      provider_effect:false,
      legal_effect:false,
    };
  });

  const byFact=new Map(facts.map(f=>[f.fact_id,f]));
  const package_rows=items.map(i=>{
    const factsFor=i.required_fact_ids.map(id=>byFact.get(id));
    const factsKnown=factsFor.every(f=>f.answer==='YES' || f.answer==='N_A');
    const factsFail=factsFor.some(f=>f.answer==='NO');
    const factsUnknown=factsFor.some(f=>f.answer==='ASK_MORE_DETAILS');
    const structural=i.present_bit===1 && i.current_bit===1 && i.source_bound_bit===1 && i.consumer_bound_bit===1;
    const pass=i.required_bit===0 ? true : structural && factsKnown;
    const state=pass?'PASS':factsFail?'FAIL':factsUnknown?'UNKNOWN':'FAIL';
    return {...i,state,structural_pass:structural,fact_gate_pass:factsKnown};
  });

  const requiredFacts=facts.filter(f=>f.required_bit===1 && f.material_bit===1 && f.applicable_bit===1);
  const requiredItems=package_rows.filter(i=>i.required_bit===1);
  const openFacts=requiredFacts.filter(f=>f.answer!=='YES');
  const openItems=requiredItems.filter(i=>i.state!=='PASS');
  const hotfolder_wakes=[
    ...openFacts.map(f=>({wake_id:`FACT:${f.fact_id}`,kind:f.answer==='ASK_MORE_DETAILS'?'SOURCE_OR_OWNER':'FACT_RED',owner_ref:f.owner_ref,work_ref:f.work_ref,effect_class:f.effect_class,priority_rank:f.priority_rank})),
    ...openItems.map(i=>({wake_id:`ITEM:${i.item_id}`,kind:'PACKAGE_ITEM_RED',owner_ref:input.package_owner_ref ?? input.user_ref,work_ref:input.work_ref,effect_class:'NONE',priority_rank:500})),
  ];
  hotfolder_wakes.sort((a,b)=>a.priority_rank-b.priority_rank || a.wake_id.localeCompare(b.wake_id));
  const first_red=hotfolder_wakes[0] ?? null;
  const gate_pass=openFacts.length===0 && openItems.length===0;

  return Object.freeze({
    schema:LEGAL_BINARY_SCHEMA,
    root_ref:input.root_ref,
    root_generation:input.root_generation,
    user_ref:input.user_ref,
    product_ref:input.product_ref,
    ack_ref:input.ack_ref,
    ack_generation:input.ack_generation,
    sdk_ref:input.sdk_ref,
    sdk_generation:input.sdk_generation,
    ack_current:true,
    sdk_current:true,
    running_consumption:true,
    fact_denominator:facts.length,
    required_fact_denominator:requiredFacts.length,
    package_item_denominator:items.length,
    required_package_item_denominator:requiredItems.length,
    dataforge_record_denominator:dataforge_records.length,
    silent_remainder:0,
    facts,
    dataforge_records,
    ack_trinity,
    package_rows,
    hotfolder_wakes,
    first_red,
    gate_pass,
    owner_review_ready:openItems.length===0 && (gate_pass || (openFacts.length>0 && openFacts.every(f=>f.user_choice_bit===1 || f.effect_class==='OWNER'))),
    terminal:false,
    provider_effect:false,
    legal_effect:false,
    hard:[
      'USER_DATA -> BINARY_FACT -> DATAFORGE_RECORD -> ACK_TRINITY -> PACKAGE_GATE',
      'META|MESO|MICRO_USE_THE_SAME_BINARY_CALCULUS',
      'EVERY_SCALE_REQUIRES_WHERE_WHAT_HOW_WHO_WHEN_WHY',
      'ALPHABETICAL_ORDER != PRIORITY',
      'YES != VERIFIED_PROVIDER_EFFECT',
      'NO != UNKNOWN',
      'ASK_MORE_DETAILS != FALSE',
      'DOCUMENT_PRESENT != FACT_TRUE',
      'PACKAGE_ITEM_COUNT != PACKAGE_ACCEPTANCE',
      'ACK_PRESENT != ACK_CURRENT',
      'SDK_PRESENT != SDK_CURRENT',
      'SOURCE_CURRENT != RUNNING_CONSUMPTION',
      'OWNER_REVIEW_READY != OWNER_ADOPTED',
      'PRE_OATH != SWORN != SERVED != FILED != REGISTRY_ACCEPTED',
      'RESULT != RETURN != APPLY_RETURN',
      'DATAFORGE_RECORD != BINS_CUSTODY',
      'BINS_CUSTODY != EFFECT_AUTHORITY'
    ],
  });
}
