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



// VeilRIFT B1 backfeed: retain caller-provided history without authenticating it.
const base={consumer_id:'consumer',scale:'MICRO',producer_ref:'producer',observer_ref:'observer',source_ref:'source',conserved};
const legacy=compileFractalConsumerReceiptEnvelope(base);
assert.equal('previous_receipt' in legacy,false);
assert.equal('previous_receipt_state' in legacy,false);
for(const applicability of ['APPLICABLE','N_A']){
  const input={...base,applicability,na_evidence_ref:'na:evidence'};
  for(const ref of ['receipt:prior','missing:receipt','cycle:self','https://example.invalid/receipt#previous']){
    const receipt=compileFractalConsumerReceiptEnvelope({...input,previous_receipt:ref,authenticated:true,verified:true});
    assert.equal(receipt.previous_receipt,ref);
    assert.equal(receipt.previous_receipt_state,'SUPPLIED_UNVERIFIED');
    assert.equal(receipt.effect_authority,0);
    assert.equal(Object.isFrozen(receipt),true);
    assert.equal('verified' in receipt,false);
    assert.equal('authenticated' in receipt,false);
    assert.equal('verification_state' in receipt,false);
  }
  const noLink=compileFractalConsumerReceiptEnvelope({...input,previous_receipt:null});
  assert.equal(noLink.previous_receipt,null);
  assert.equal(noLink.previous_receipt_state,'NOT_SUPPLIED');
  for(const invalid of ['', '  ',0,false,{},[], 'r'.repeat(1025)]){
    assert.throws(()=>compileFractalConsumerReceiptEnvelope({...input,previous_receipt:invalid}),/PREVIOUS_RECEIPT_REQUIRED/);
  }
}
assert.deepEqual(compileFractalConsumerReceiptEnvelope({...base,previous_receipt:undefined}),legacy);
let previousReads=0;
const changingInput={...base,get previous_receipt(){return ++previousReads===1?'receipt:stable':null;}};
const stableReceipt=compileFractalConsumerReceiptEnvelope(changingInput);
assert.equal(previousReads,1);
assert.equal(stableReceipt.previous_receipt,'receipt:stable');
assert.equal(stableReceipt.previous_receipt_state,'SUPPLIED_UNVERIFIED');
console.log(JSON.stringify({
  schema:'xiio.sdk.fractal-consumer-receipt-envelope-check/v1',
  state:'PASS',
  scales:FRACTAL_SCALES,
  emitter_self_verification:false,
  effect_authority:0
},null,2));
