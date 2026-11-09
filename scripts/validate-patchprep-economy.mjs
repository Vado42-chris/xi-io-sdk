import assert from 'node:assert/strict';
import {SURFACE_FAMILIES,PREP_CELLS,compilePatchPrepEconomy,compileColdFolder} from '../src/patchprep/economy.mjs';
const passCell=id=>({state:'PASS',evidence_refs:['e:'+id]});
const cells=()=>Object.fromEntries(PREP_CELLS.map(id=>[id,passCell(id)]));
function good(family){
 return compilePatchPrepEconomy({
  surface_family:family,generation:'g1',cells:cells(),evidence_mode:'SIM',
  prep_ms:2000,deploy_ms:3000,rework_ms:0,return_reap_ms:1000,
  deploy_attempts:1,failed_attempts:0,rollback_count:0,owner_restatement_count:0,manual_routing_count:0,stale_retry_count:0,
  rate_card:{pricing_ref:'synthetic:test',rate_microunits_per_second:1000},
  baseline:{total_ms:12000,friction:4,pricing_ref:'synthetic:test',total_microunits:12000}
 });
}
assert.equal(SURFACE_FAMILIES.length,58);
assert.equal(PREP_CELLS.length,12);
let goodPass=0;
for(const family of SURFACE_FAMILIES){
 const x=good(family);
 assert.equal(x.prepared,true,family);
 assert.equal(x.detonation_admitted,true,family);
 assert.equal(x.time.total_ms,6000);
 assert.equal(x.money.total_microunits,6000);
 assert.equal(x.delta.claim_state,'SIMULATED_IMPROVEMENT');
 goodPass++;
}
let hostile=0;
for(const family of SURFACE_FAMILIES){
 for(const missing of PREP_CELLS){
  const c=cells();
  c[missing]={state:'UNKNOWN',evidence_refs:[],wake:'resolve:'+missing};
  const x=compilePatchPrepEconomy({
   surface_family:family,generation:'g1',cells:c,evidence_mode:'SIM',
   prep_ms:2000,deploy_ms:3000,rework_ms:0,return_reap_ms:1000,
   deploy_attempts:1,failed_attempts:0,rollback_count:0,owner_restatement_count:0,manual_routing_count:0,stale_retry_count:0
  });
  assert.equal(x.prepared,false,family+':'+missing);
  assert.equal(x.detonation_admitted,false,family+':'+missing);
  hostile++;
 }
}
assert.equal(hostile,696);
const unpriced=compilePatchPrepEconomy({
 surface_family:'PUNCHCARD',generation:'g1',cells:cells(),prep_ms:1,deploy_ms:1,rework_ms:1,return_reap_ms:1,
 deploy_attempts:1,failed_attempts:0,rollback_count:0,owner_restatement_count:0,manual_routing_count:0,stale_retry_count:0
});
assert.equal(unpriced.money.state,'UNPRICED');
assert.equal(unpriced.money.total_microunits,null);
const cold=compileColdFolder({item_ref:'candidate:x',generation:'g1',reason:'unqualified'});
assert.equal(cold.runnable,false);
assert.equal(cold.detonation_allowed,false);
assert(cold.allowed_exits.includes('QUALIFY_TO_HOT_FOLDER'));
console.log(JSON.stringify({
 schema:'xiio.sdk.patch-prep-economy-check/v1',
 surface_families:SURFACE_FAMILIES.length,prep_cells:PREP_CELLS.length,
 positive_family_passes:goodPass,hostile_denominator:hostile,hostile_rejected:hostile,false_green:0,
 cold_folder:'PASS_NON_RUNNABLE',time_money_guard:'PASS',result:'PASS',effects:0
}));
