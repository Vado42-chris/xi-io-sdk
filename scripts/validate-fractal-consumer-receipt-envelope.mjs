import assert from 'node:assert/strict';
import {
  FRACTAL_CONSUMER_RECEIPT_SCHEMA,
  FRACTAL_SCALES,
  compileFractalConsumerReceiptEnvelope,
} from '../src/receipts/fractal-consumer.mjs';

const conserved={
  packet_id:'packet:1',
  generation:'g1',
  semantic_digest:'sem:1',
  blast_radius_digest:'blast:1',
  affected_refs:['hex','studio','bins'],
  return_targets:['return:studio','return:hex'],
  first_red:'Q_SEARCH_BINS'
};

for(const scale of FRACTAL_SCALES){
  const row=compileFractalConsumerReceiptEnvelope({
    consumer_id:'HEX',
    scale,
    producer_ref:'hex:producer:'+scale,
    observer_ref:'benchmark:observer:'+scale,
    source_ref:'hex:projection:'+scale,
    readback_ref:'hex:readback:'+scale,
    conserved
  });
  assert.equal(row.schema,FRACTAL_CONSUMER_RECEIPT_SCHEMA);
  assert.equal(row.scale,scale);
  assert.equal(row.applicability,'APPLICABLE');
  assert.equal(row.effect_authority,0);
  assert.deepEqual(row.conserved.affected_refs,['bins','hex','studio']);
  assert.deepEqual(row.conserved.return_targets,['return:hex','return:studio']);
  assert.equal('verification_state' in row,false);
  assert.equal('state' in row,false);
}

const na=compileFractalConsumerReceiptEnvelope({
  consumer_id:'API',
  scale:'META',
  producer_ref:'api:producer',
  observer_ref:'framework:observer',
  source_ref:'api:meta',
  applicability:'N_A',
  na_evidence_ref:'na:api:meta'
});
assert.equal(na.applicability,'N_A');
assert.equal(na.conserved,null);
assert.equal(na.na_evidence_ref,'na:api:meta');

assert.throws(()=>compileFractalConsumerReceiptEnvelope({
  consumer_id:'HEX',
  scale:'10S',
  producer_ref:'p',
  observer_ref:'o',
  source_ref:'s',
  conserved
}),/SCALE_INVALID/);

assert.throws(()=>compileFractalConsumerReceiptEnvelope({
  consumer_id:'HEX',
  scale:'MICRO',
  producer_ref:'p',
  observer_ref:'o',
  source_ref:'s',
  applicability:'N_A'
}),/NA_EVIDENCE_REF_REQUIRED/);

console.log(JSON.stringify({
  schema:'xiio.sdk.fractal-consumer-receipt-envelope-check/v1',
  state:'PASS',
  scales:FRACTAL_SCALES,
  emitter_self_verification:false,
  effect_authority:0
},null,2));
