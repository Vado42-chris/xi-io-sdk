export const FRACTAL_CONSUMER_RECEIPT_SCHEMA='xiio.studio.fractal-consumer-receipt/v1';
export const FRACTAL_SCALES=Object.freeze(['MICRO','MESO','MACRO','META']);

function text(v,k,max=1024){
  if(typeof v!=='string'||!v.trim()||v.length>max) throw new TypeError(k+'_REQUIRED');
  return v.trim();
}
function refs(v){
  if(!Array.isArray(v)) throw new TypeError('REFS_ARRAY_REQUIRED');
  return Object.freeze([...new Set(v.map(x=>text(x,'REF')))].sort());
}
function nullable(v){return v==null?null:String(v);}

export function compileFractalConsumerReceiptEnvelope(input={}){
  const scale=text(input.scale,'SCALE',32).toUpperCase();
  if(!FRACTAL_SCALES.includes(scale)) throw new TypeError('SCALE_INVALID');
  const applicability=(input.applicability||'APPLICABLE').toUpperCase();
  if(!['APPLICABLE','N_A'].includes(applicability)) throw new TypeError('APPLICABILITY_INVALID');

  const base={
    schema:FRACTAL_CONSUMER_RECEIPT_SCHEMA,
    consumer_id:text(input.consumer_id,'CONSUMER_ID',128),
    scale,
    applicability,
    producer_ref:text(input.producer_ref,'PRODUCER_REF'),
    observer_ref:text(input.observer_ref,'OBSERVER_REF'),
    source_ref:text(input.source_ref,'SOURCE_REF'),
    readback_ref:input.readback_ref?text(input.readback_ref,'READBACK_REF'):null,
    effect_authority:0,
  };

  if(applicability==='N_A'){
    return Object.freeze({
      ...base,
      na_evidence_ref:text(input.na_evidence_ref,'NA_EVIDENCE_REF'),
      conserved:null,
      hard:Object.freeze([
        'EMITTER_DOES_NOT_VERIFY_ITSELF',
        'N_A_REQUIRES_EVIDENCE',
        'RECEIPT!=AUTHORITY',
      ]),
    });
  }

  const c=input.conserved;
  if(!c||typeof c!=='object'||Array.isArray(c)) throw new TypeError('CONSERVED_VECTOR_REQUIRED');

  return Object.freeze({
    ...base,
    conserved:Object.freeze({
      packet_id:text(c.packet_id,'PACKET_ID'),
      generation:text(c.generation,'GENERATION'),
      semantic_digest:text(c.semantic_digest,'SEMANTIC_DIGEST'),
      blast_radius_digest:text(c.blast_radius_digest,'BLAST_RADIUS_DIGEST'),
      affected_refs:refs(c.affected_refs),
      return_targets:refs(c.return_targets),
      first_red:nullable(c.first_red),
    }),
    hard:Object.freeze([
      'EMITTER_DOES_NOT_VERIFY_ITSELF',
      'OBSERVED_VECTOR!=CANONICAL_AUTHORITY',
      'PRODUCER_REF_AND_OBSERVER_REF_PRESERVED',
      'READBACK_REF_NOT_FABRICATED',
      'RECEIPT!=AUTHORITY',
    ]),
  });
}
