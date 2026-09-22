#!/usr/bin/env node
import assert from 'node:assert/strict';
import {coordinateAddress,createCoordinateCache,compileChangedOnlyPatchPlan,compileTimeDollarCacheReceipt} from '../src/cache/coordinate-cache.mjs';

const identity={
  root_uuid:'5267f93e-2af8-57c8-975d-21fcbf77683e',
  work_uuid:'d4a4906a-80ec-54ed-aeb1-364154a486a9',
  occurrence_uuid:'8239e51f-f794-58e5-87eb-f15607fa3abb',
  generation_ref:'SEARCH_G1'
};
const dims=[
  {axis:'COG',face:'OWNER',split:'QUAL'},
  {axis:'PORT',face:'COLLISION',split:'QUAL'},
  {axis:'REPLAY',face:'INDEPENDENT',split:'QUAL'}
];
const addrs=dims.map((dimension)=>coordinateAddress({identity,dimension,heuristic_ref:'heuristics:search-g1'}));
assert.equal(new Set(addrs.map(x=>x.cache_key)).size,3,'different D must produce different coordinates');
assert.equal(addrs[0].cache_key,coordinateAddress({identity,dimension:dims[0],heuristic_ref:'heuristics:search-g1'}).cache_key,'same ID+D must replay');

const cache=createCoordinateCache({cache_ref:'local://test/search-coordinate-cache'});
let r=cache.read(addrs[0],{provider_generation_ref:'provider:g1'});
assert.equal(r.state,'MISS');assert.equal(r.provider_lookup_required,true);
cache.write(addrs[0],{provider_generation_ref:'provider:g1',payload:{state:'FAIL',wake:'owner-restatement=0'},evidence_refs:['pc:A10']});
r=cache.read(addrs[0],{provider_generation_ref:'provider:g1'});
assert.equal(r.state,'HIT_CURRENT');assert.equal(r.provider_lookup_required,false);
r=cache.read(addrs[0],{provider_generation_ref:'provider:g2'});
assert.equal(r.state,'INVALIDATED_PROVIDER_GENERATION_MOVED');assert.equal(r.provider_lookup_required,true);

cache.write(addrs[1],{provider_generation_ref:'provider:g1',payload:{state:'FAIL',wake:'resolve-port'},evidence_refs:['pc:I09']});
cache.write(addrs[2],{provider_generation_ref:'provider:g1',payload:{state:'FAIL',wake:'fresh-review'},evidence_refs:['pc:J10']});
const before=cache.snapshot().rows;

const next=createCoordinateCache({cache_ref:'local://test/search-coordinate-cache-next'});
next.write(addrs[0],{provider_generation_ref:'provider:g1',payload:{state:'FAIL',wake:'owner-restatement=0'},evidence_refs:['pc:A10']});
next.write(addrs[1],{provider_generation_ref:'provider:g2',payload:{state:'PASS',wake:null},evidence_refs:['pc:I09','receipt:port-fixed']});
next.write(addrs[2],{provider_generation_ref:'provider:g1',payload:{state:'FAIL',wake:'fresh-review'},evidence_refs:['pc:J10']});
const after=next.snapshot().rows;
const patch=compileChangedOnlyPatchPlan({baseline:before,current:after});
assert.equal(patch.denominator,3);
assert.equal(patch.changed_count,1);
assert.equal(patch.unchanged_count,2);
assert.equal(patch.broad_rebuild_required,false);
assert.equal(patch.changed[0].reason,'PROVIDER_GENERATION_MOVED');

const time=compileTimeDollarCacheReceipt({
  baseline_provider_lookups:3,
  current_provider_lookups:1,
  baseline_patch_decisions:3,
  current_patch_decisions:1,
  evidence_refs:['cache:known-answer','patch:changed-only']
});
assert.equal(time.provider_lookups_avoided,2);
assert.equal(time.patch_decision_slots_avoided,2);
assert.equal(time.estimated_cost_avoided,null);
assert.equal(time.money_state,'UNKNOWN_NO_RATE_CARD');

console.log(JSON.stringify({
  result:'PASS',
  id_plus_d:addrs.map(x=>x.id_plus_d_address),
  cache_metrics:cache.metrics,
  patch:{denominator:patch.denominator,changed:patch.changed_count,unchanged:patch.unchanged_count},
  time_dollar:time,
  false_green:0
},null,2));
