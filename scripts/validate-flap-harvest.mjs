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
assert.equal(q.resume.state,'EXECUTE_ONCE');
assert.equal(q.resume.repeat_effect,true);

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
assert.equal(replay.resume.state,'JOIN_NO_OP');
assert.equal(replay.resume.repeat_effect,false);

const stale=compileFlapHarvest({
  occurrences,current_generation:'G2',
  checkpoint:{committed:true,acknowledged:false,generation:'G1',cache_key:cacheKey}
});
assert.equal(stale.resume.state,'REBASE_REQUIRED');
assert.equal(stale.resume.repeat_effect,false);

assert.equal(q.event_projection.field_path,'payload.data');
assert.equal(q.event_projection.target_schema_ref,'xiio://schemas/event-record.schema.json');

console.log(JSON.stringify({
  check:'FLAP_HARVEST_TRANSPORT_STABILITY',
  status:'PASS',
  received:10,
  unique:1,
  duplicates:9,
  redundant_percent:90,
  interrupted_after_commit:'READBACK_EXISTING_RECEIPT',
  replay:'JOIN_NO_OP',
  stale_generation:'REBASE_REQUIRED',
  event_projection:'payload.data',
},null,2));
