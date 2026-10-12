import crypto from 'node:crypto';

export const FLAP_HARVEST_SCHEMA='xiio.sdk.flap-harvest/v1';

function text(v,k){
  if(typeof v!=='string'||!v.trim()) throw new TypeError(k+'_REQUIRED');
  return v.trim();
}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
function sha(v){
  return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(stable(v))).digest('hex');
}
function occurrence(row,index){
  if(!row||typeof row!=='object'||Array.isArray(row)) throw new TypeError('OCCURRENCE_'+index+'_OBJECT_REQUIRED');
  return Object.freeze({
    occurrence_ref:text(row.occurrence_ref,'OCCURRENCE_REF'),
    canonical_identity:text(row.canonical_identity,'CANONICAL_IDENTITY'),
    generation:text(row.generation,'GENERATION'),
    content_sha256:text(row.content_sha256,'CONTENT_SHA256'),
    content_bytes:Number.isSafeInteger(row.content_bytes)&&row.content_bytes>=0?row.content_bytes:0,
  });
}

export function compileFlapHarvest(input={}){
  if(!Array.isArray(input.occurrences)||!input.occurrences.length) throw new TypeError('OCCURRENCES_REQUIRED');
  const rows=input.occurrences.map(occurrence);
  const groups=new Map();
  for(const row of rows){
    const key=[row.canonical_identity,row.generation,row.content_sha256].join('|');
    const bucket=groups.get(key)||[];
    bucket.push(row);
    groups.set(key,bucket);
  }

  const identities=[...groups.entries()].map(([key,bucket])=>{
    const exemplar=bucket[0];
    const occurrence_refs=[...new Set(bucket.map(x=>x.occurrence_ref))].sort();
    return Object.freeze({
      cache_key:sha({canonical_identity:exemplar.canonical_identity,generation:exemplar.generation,content_sha256:exemplar.content_sha256}),
      canonical_identity:exemplar.canonical_identity,
      generation:exemplar.generation,
      content_sha256:exemplar.content_sha256,
      content_bytes:exemplar.content_bytes,
      occurrence_count:bucket.length,
      occurrence_refs,
      duplicate_occurrences:Math.max(0,bucket.length-1),
      quantized_work_units:1,
    });
  }).sort((a,b)=>a.cache_key.localeCompare(b.cache_key));

  const duplicate_occurrences=identities.reduce((n,x)=>n+x.duplicate_occurrences,0);
  const unique_content_identities=identities.length;
  const received_occurrences=rows.length;
  const redundant_ratio=received_occurrences?duplicate_occurrences/received_occurrences:0;

  const checkpoint=input.checkpoint&&typeof input.checkpoint==='object'?input.checkpoint:null;
  const committed=checkpoint?.committed===true;
  const acknowledged=checkpoint?.acknowledged===true;
  const generation_matches=checkpoint?checkpoint.generation===input.current_generation:true;
  const cache_key_matches=checkpoint?identities.some(x=>x.cache_key===checkpoint.cache_key):true;

  let resume;
  if(checkpoint&&(!generation_matches||!cache_key_matches)){
    resume={state:'REBASE_REQUIRED',repeat_effect:false,increment_generation:false,reason:!generation_matches?'GENERATION_DRIFT':'CACHE_IDENTITY_DRIFT'};
  }else if(committed&&!acknowledged){
    resume={state:'READBACK_EXISTING_RECEIPT',repeat_effect:false,increment_generation:false,reason:'COMMIT_PRESENT_ACK_MISSING'};
  }else if(committed&&acknowledged){
    resume={state:'JOIN_NO_OP',repeat_effect:false,increment_generation:false,reason:'ALREADY_COMMITTED_AND_ACKED'};
  }else{
    resume={state:'EXECUTE_ONCE',repeat_effect:true,increment_generation:true,reason:'NO_COMMIT_RECEIPT'};
  }

  const payload_data=Object.freeze({
    schema:FLAP_HARVEST_SCHEMA,
    transport_mode:'FLAP_HARVEST',
    received_occurrences,
    unique_content_identities,
    duplicate_occurrences,
    redundant_ratio,
    identities,
    resume,
    current_generation:input.current_generation??null,
    page_request:input.page_request??null,
  });

  return Object.freeze({
    schema:FLAP_HARVEST_SCHEMA,
    ...payload_data,
    event_projection:Object.freeze({
      target_schema_ref:'xiio://schemas/event-record.schema.json',
      field_path:'payload.data',
      payload_data,
      rule:'RICH_TRANSPORT_METADATA_LIVES_IN_EVENT_PAYLOAD_DATA_NOT_STRICT_OPERATIONAL_LEDGER_TOP_LEVEL',
    }),
    hard:Object.freeze([
      'OCCURRENCE_COUNT!=WORK_COUNT',
      'DUPLICATE_PAYLOAD!=NEW_WORK',
      'CACHE_KEY=CANONICAL_IDENTITY+GENERATION+CONTENT_SHA256',
      'CACHE!=SECOND_SOURCE_OF_TRUTH',
      'COMMITTED_AND_UNACKED=>READBACK_NOT_REEXECUTE',
      'REPLAY_MUST_NOT_INCREMENT_GENERATION',
      'GENERATION_DRIFT=>REBASE',
      'EVENT_FIELD_NOT_ALLOWED!=WIDEN_STRICT_LEDGER',
      'CANONICAL_EVENT_TRANSPORT_METADATA=>PAYLOAD.DATA',
      'QUANTIZE_BEFORE_FRACTALIZE',
    ]),
  });
}

export const FlapHarvest=compileFlapHarvest;
