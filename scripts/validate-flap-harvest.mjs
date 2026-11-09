#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileFlapHarvest } from '../src/transport/flap-harvest.mjs';

const hash='c9f6aec5c306885c31bf36603a833705ae9633e41b60141d886da391015de7c6';
const occurrences=Array.from({length:10},(_,i)=>({
  occurrence_ref:'occ-'+String(i+1).padStart(2,'0'),
  canonical_identity:'payload:transport-demo',
  generation:'G1',
  content_sha256:hash,
  content_bytes:28224,
}));

const q=compileFlapHarvest({occurrences,current_generation:'G1'});
assert.equal(q.received_occurrences,10);
assert.equal(q.unique_content_identities,1);
assert.equal(q.duplicate_occurrences,9);
assert.equal(q.redundant_ratio,0.9);
assert.equal(q.identities[0].quantized_work_units,1);
assert.equal(q.resume.state,'AWAIT_EXECUTION_ADMISSION');
assert.equal(q.resume.repeat_effect,false);
assert.equal(q.resume.authority_granted,false);
assert.equal(q.provider_effect,false);
assert.equal(q.runtime_complete,false);
assert.equal(Object.hasOwn(q,'page_request'),false);

const cacheKey=q.identities[0].cache_key;
const flap=compileFlapHarvest({
  occurrences,current_generation:'G1',
  checkpoint:{committed:true,acknowledged:false,generation:'G1',cache_key:cacheKey}
});
assert.equal(flap.resume.state,'READBACK_EXISTING_RECEIPT');
assert.equal(flap.resume.repeat_effect,false);
assert.equal(flap.resume.increment_generation,false);

const replay=compileFlapHarvest({
  occurrences,current_generation:'G1',
  checkpoint:{committed:true,acknowledged:true,generation:'G1',cache_key:cacheKey}
});
assert.equal(replay.resume.state,'VERIFY_REPLAY_RECEIPT');
assert.equal(replay.resume.repeat_effect,false);

const stale=compileFlapHarvest({
  occurrences,current_generation:'G2',
  checkpoint:{committed:true,acknowledged:false,generation:'G1',cache_key:cacheKey}
});
assert.equal(stale.resume.state,'REBASE_REQUIRED');
assert.equal(stale.resume.repeat_effect,false);

assert.equal(q.event_projection.field_path,'payload.data');
assert.equal(q.event_projection.target_schema_ref,'xiio://schemas/event-record.schema.json');

// Hostile 200-case denominator: corrupt digest, replay ref, byte-count drift,
 // caller-supplied checkpoint bits, and arbitrary private paging payload cannot
 // change this pure compile into executed provider/effect/current proof.
for(let i=0;i<200;i++){
  const x=structuredClone(occurrences);
  const input={occurrences:x,current_generation:'G1'};
  if(i%10===0)x[0].content_sha256='invalid';
  if(i%10===1)x[0].content_bytes=-1;
  if(i%10===2)x[0].content_bytes=28223;
  if(i%10===3)x[1].occurrence_ref=x[0].occurrence_ref;
  if(i%10===4)input.checkpoint={committed:true,acknowledged:'true',generation:'G1',cache_key:cacheKey};
  if(i%10===5)input.checkpoint={committed:false,acknowledged:true,generation:'G1',cache_key:cacheKey};
  if(i%10===6)input.checkpoint={committed:true,acknowledged:true,generation:'G1',cache_key:cacheKey};
  if(i%10===7)input.checkpoint={committed:true,acknowledged:false,generation:'G1',cache_key:cacheKey};
  if(i%10===8)input.page_request={token:'PRIVATE_DO_NOT_ECHO'};
  if(i%10===9)x[0].generation='G2';
  if([0,1,2,3,4].includes(i%10)){
    assert.throws(()=>compileFlapHarvest(input),undefined,'BAD_INPUT_ADMITTED_'+i);
  }else{
    const out=compileFlapHarvest(input);
    assert.equal(out.runtime_complete,false,'FALSE_COMPLETE_'+i);
    assert.equal(out.provider_effect,false,'PROVIDER_EFFECT_'+i);
    assert.equal(out.authority_granted,false,'AUTHORITY_'+i);
    assert.equal(out.resume.repeat_effect,false,'FALSE_REEXECUTE_'+i);
    assert.equal(out.resume.increment_generation,false,'FALSE_GENERATION_BUMP_'+i);
    assert.equal(JSON.stringify(out).includes('PRIVATE_DO_NOT_ECHO'),false,'PRIVATE_ECHO_'+i);
    if(i%10===5)assert.equal(out.resume.state,'BLOCKED_CONTRADICTORY_CLAIM');
    if(i%10===6)assert.equal(out.resume.state,'VERIFY_REPLAY_RECEIPT');
    if(i%10===7)assert.equal(out.resume.state,'READBACK_EXISTING_RECEIPT');
    if(i%10===9)assert.equal(out.resume.state,'REBASE_REQUIRED');
  }
}
console.log(JSON.stringify({
  check:'FLAP_HARVEST_TRANSPORT_STABILITY',
  status:'PASS',
  received:10,
  unique:1,
  duplicates:9,
  redundant_percent:90,
  interrupted_after_commit:'READBACK_EXISTING_RECEIPT',
  hostile_denominator:200,
  false_green:0,
  replay:'VERIFY_REPLAY_RECEIPT',
  stale_generation:'REBASE_REQUIRED',
  event_projection:'payload.data',
},null,2));
