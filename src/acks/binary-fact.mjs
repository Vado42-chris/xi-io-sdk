import crypto from 'node:crypto';

export const BINARY_FACT_INPUT_SCHEMA='xiio.sdk.binary-fact-input/v1';
export const BINARY_FACT_SCHEMA='xiio.sdk.binary-fact-set/v1';
const ANSWERS=new Set(['YES','NO','ASK_MORE_DETAILS']);
const bounded=(v,max=2000)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max;
const stable=(v)=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=(v)=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

function refs(value,label){
  if(!Array.isArray(value)) throw new TypeError(label+' must be array');
  const out=value.map(v=>{if(!bounded(v,1024)) throw new TypeError(label+' invalid ref'); return v;});
  return [...new Set(out)].sort();
}
function compileFact(raw,rootRef,sourceGeneration){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new TypeError('fact must be object');
  for(const k of ['fact_id','question','subject_ref']) if(!bounded(raw[k])) throw new TypeError(k+' required');
  if(!ANSWERS.has(raw.answer)) throw new TypeError('answer invalid:'+raw.fact_id);
  const sourceRefs=refs(raw.source_refs??[],'source_refs');
  if(raw.answer!=='ASK_MORE_DETAILS'&&sourceRefs.length===0) throw new TypeError('known answer requires source_refs:'+raw.fact_id);
  const known=raw.answer==='ASK_MORE_DETAILS'?0:1;
  const value=raw.answer==='YES'?1:0;
  const factRef='fact:'+digest({root_ref:rootRef,source_generation:sourceGeneration,fact_id:raw.fact_id,subject_ref:raw.subject_ref,question:raw.question});
  return Object.freeze({
    schema:'xiio.sdk.binary-fact/v1',
    fact_ref:factRef,
    root_ref:rootRef,
    source_generation:sourceGeneration,
    fact_id:raw.fact_id,
    subject_ref:raw.subject_ref,
    question:raw.question,
    answer:raw.answer,
    known_bit:known,
    value_bit:value,
    source_refs:sourceRefs,
    source_class:bounded(raw.source_class??'UNKNOWN')?raw.source_class:'UNKNOWN',
    owner_ref:bounded(raw.owner_ref??'UNBOUND')?raw.owner_ref:'UNBOUND',
    consumer_refs:refs(raw.consumer_refs??[],'consumer_refs'),
    wait_reason:raw.answer==='ASK_MORE_DETAILS'?(bounded(raw.wait_reason)?raw.wait_reason:'SOURCE_OR_HUMAN_DETAIL_REQUIRED'):null,
    authority_granted:false,
    provider_effect:false,
    legal_effect:false,
  });
}
export function compileBinaryFacts(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new TypeError('input must be object');
  if(input.schema!==BINARY_FACT_INPUT_SCHEMA) throw new TypeError('input schema mismatch');
  for(const k of ['root_ref','source_generation']) if(!bounded(input[k])) throw new TypeError(k+' required');
  if(!Array.isArray(input.facts)||input.facts.length===0) throw new TypeError('facts required');
  const ids=new Set();
  const facts=input.facts.map(raw=>{if(ids.has(raw?.fact_id)) throw new TypeError('duplicate fact_id:'+raw?.fact_id); ids.add(raw.fact_id); return compileFact(raw,input.root_ref,input.source_generation);});
  facts.sort((a,b)=>a.fact_id.localeCompare(b.fact_id));
  const counts={yes:0,no:0,ask_more_details:0,known:0,unknown:0};
  for(const f of facts){
    if(f.answer==='YES') counts.yes++;
    if(f.answer==='NO') counts.no++;
    if(f.answer==='ASK_MORE_DETAILS') counts.ask_more_details++;
    f.known_bit?counts.known++:counts.unknown++;
  }
  const firstOpen=facts.find(f=>f.known_bit===0||f.value_bit===0)??null;
  return Object.freeze({
    schema:BINARY_FACT_SCHEMA,
    root_ref:input.root_ref,
    source_generation:input.source_generation,
    denominator:facts.length,
    counts,
    silent_remainder:0,
    facts,
    all_yes:counts.yes===facts.length,
    first_open_fact_ref:firstOpen?.fact_ref??null,
    next:firstOpen?'RESOLVE_FIRST_OPEN_FACT':'VERIFY_AND_REAP',
    authority_granted:false,
    provider_effect:false,
    legal_effect:false,
    hard:[
      'YES => known_bit=1,value_bit=1',
      'NO => known_bit=1,value_bit=0',
      'ASK_MORE_DETAILS => known_bit=0',
      'UNKNOWN != FALSE != PASS',
      'SOURCE_REF != SOURCE_TRUTH_AUTHORITY',
      'FACT_SET != LEGAL_EFFECT_AUTHORITY',
      'QUANTITATIVE_SCORE != TRUTH_OVERRIDE'
    ]
  });
}
