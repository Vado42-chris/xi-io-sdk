import crypto from 'node:crypto';

export const FLAP_HARVEST_SCHEMA='xiio.sdk.flap-harvest/v1';

function text(v,k){
  if(typeof v!=='string'||!v.trim()||v.trim()!==v||v.length>512) throw new TypeError(k+'_INVALID');
  return v;
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
    content_sha256:(()=>{
      const x=text(row.content_sha256,'CONTENT_SHA256');
      if(!/^[a-f0-9]{64}$/.test(x))throw new TypeError('CONTENT_SHA256_INVALID');
      return x;
    })(),
    content_bytes:(()=>{
      if(!Number.isSafeInteger(row.content_bytes)||row.content_bytes<0)
        throw new TypeError('CONTENT_BYTES_INVALID');
      return row.content_bytes;
    })(),
  });
}

export function compileFlapHarvest(input={}){
  if(!Array.isArray(input.occurrences)||!input.occurrences.length) throw new TypeError('OCCURRENCES_REQUIRED');
  const current_generation=text(input.current_generation,'CURRENT_GENERATION');
  const rows=input.occurrences.map(occurrence);
  if(new Set(rows.map(row=>row.occurrence_ref)).size!==rows.length)
    throw new TypeError('OCCURRENCE_REF_REUSED');
  const groups=new Map();
  for(const row of rows){
    const key=[row.canonical_identity,row.generation,row.content_sha256].join('|');
    const bucket=groups.get(key)||[];
    bucket.push(row);
    groups.set(key,bucket);
  }

  const identities=[...groups.entries()].map(([key,bucket])=>{
    const exemplar=bucket[0];
    if(bucket.some(x=>x.content_bytes!==exemplar.content_bytes))
      throw new TypeError('IDENTICAL_DIGEST_DIFFERENT_BYTE_LENGTH');
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

  const checkpoint=input.checkpoint??null;
  if(checkpoint!==null&&(!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint)))
    throw new TypeError('CHECKPOINT_INVALID');
  if(checkpoint&&(typeof checkpoint.committed!=='boolean'||typeof checkpoint.acknowledged!=='boolean'))
    throw new TypeError('CHECKPOINT_BINARY_OBSERVATION_REQUIRED');
  const generation_matches=checkpoint?checkpoint.generation===current_generation:true;
  const cache_key_matches=checkpoint?identities.some(x=>x.cache_key===checkpoint.cache_key):true;
  const stale_occurrences=rows.some(x=>x.generation!==current_generation);

  let resume;
  if(stale_occurrences||checkpoint&&(!generation_matches||!cache_key_matches)){
    resume={state:'REBASE_REQUIRED',reason:stale_occurrences?'OCCURRENCE_GENERATION_DRIFT':
      !generation_matches?'GENERATION_DRIFT':'CACHE_IDENTITY_DRIFT'};
  }else if(checkpoint?.acknowledged&&!checkpoint?.committed){
    resume={state:'BLOCKED_CONTRADICTORY_CLAIM',reason:'ACK_WITHOUT_COMMIT'};
  }else if(checkpoint?.committed&&!checkpoint?.acknowledged){
    resume={state:'READBACK_EXISTING_RECEIPT',reason:'COMMIT_CLAIMED_ACK_MISSING'};
  }else if(checkpoint?.committed&&checkpoint?.acknowledged){
    resume={state:'VERIFY_REPLAY_RECEIPT',reason:'COMMIT_ACK_CLAIMED_NOT_AUTHENTICATED'};
  }else{
    resume={state:'AWAIT_EXECUTION_ADMISSION',reason:'NO_ADMITTED_COMMIT_OR_EFFECT_AUTHORITY'};
  }
  resume=Object.freeze({...resume,repeat_effect:false,increment_generation:false,
    authenticated_readback:false,authority_granted:false,provider_effect:false,
    first_red:'AUTHENTICATED_EFFECT_OR_REPLAY_READBACK_REQUIRED'});

  const payload_data=Object.freeze({
    schema:FLAP_HARVEST_SCHEMA,
    transport_mode:'FLAP_HARVEST',
    received_occurrences,
    unique_content_identities,
    duplicate_occurrences,
    redundant_ratio,
    identities,
    resume,
    current_generation,
    // Do not echo arbitrary paging payload, URLs, credentials or private request text.
    page_request_ref:input.page_request_ref==null?null:text(input.page_request_ref,'PAGE_REQUEST_REF'),
    verification_state:'SUPPLIED_UNVERIFIED',
    runtime_complete:false,
    authority_granted:false,
    provider_effect:false,
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
      'QUANTIZED_OCCURRENCE != AUTHORIZED_EFFECT',
      'CHECKPOINT_BOOLEAN != AUTHENTICATED_NATIVE_READBACK',
      'NO_PROOF != EXECUTE_ONCE',
    ]),
  });
}

export const FlapHarvest=compileFlapHarvest;
