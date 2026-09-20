import assert from 'node:assert/strict';
import { compileRotflOrderOfOperations, validateRotflOrderOfOperations, rotflOrderCatalog, ROTFL_ORDER_STEPS } from '../src/preflight/order-of-operations.mjs';

const evidence = Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,[`fixture:evidence:${id}`]]));
const preflight = Object.fromEntries(ROTFL_ORDER_STEPS.map(({id})=>[id,[`fixture:preflight:${id}`]]));
const ids = ROTFL_ORDER_STEPS.map(({id})=>id);

const clean = compileRotflOrderOfOperations({
  source_generation:'fixture:g1',
  completed_step_ids:ids.slice(0,12),
  evidence_refs:evidence,
  preflight_refs:preflight,
});

assert.equal(clean.current_step_id,'O12');
assert.equal(clean.pre_attempt_ready,true);
assert.equal(clean.mutation_admitted,true);
assert.equal(clean.complete,false);
assert.equal(validateRotflOrderOfOperations(clean).ok,true);

const catalog = rotflOrderCatalog();
assert.equal(catalog.denominator,14);
assert.deepEqual(catalog.steps.map((x)=>x.id),ids);

let rejected=0;
let falseGreen=0;

for(let i=0;i<110;i+=1){
  const mode=i%11;
  const candidate=JSON.parse(JSON.stringify(clean));

  if(mode===0) candidate.completed_step_ids=['O0','O2'];
  if(mode===1) candidate.completed_step_ids=['O1'];
  if(mode===2) candidate.completed_step_ids=[...candidate.completed_step_ids].reverse();
  if(mode===3) candidate.completed_step_ids=[...candidate.completed_step_ids,'O11'];
  if(mode===4) candidate.current_step_id='O13';
  if(mode===5) candidate.evidence_refs.O3=[];
  if(mode===6) candidate.pre_attempt_ready=false;
  if(mode===7) candidate.mutation_admitted=false;
  if(mode===8) candidate.source_generation='';
  if(mode===9) candidate.profile_ref='sdk:rotfl-ack-oor:wrong';
  if(mode===10) candidate.preflight_refs.O7=[];

  const verdict=validateRotflOrderOfOperations(candidate);
  if(verdict.ok) falseGreen += 1;
  else rejected += 1;
}

assert.equal(rejected,110);
assert.equal(falseGreen,0);

for(let n=0;n<=ROTFL_ORDER_STEPS.length;n+=1){
  const prefix=compileRotflOrderOfOperations({
    source_generation:`fixture:g${n}`,
    completed_step_ids:ids.slice(0,n),
    evidence_refs:evidence,
    preflight_refs:preflight,
  });
  const verdict=validateRotflOrderOfOperations(prefix);
  assert.equal(verdict.ok,true,`prefix ${n} must be valid`);
  assert.equal(verdict.completed_count,n);
  assert.equal(prefix.current_step_id,n<ids.length?ids[n]:null);
}

console.log(JSON.stringify({
  mode:'ROTFL_ACK_ORDER_OF_OPERATIONS',
  denominator:ROTFL_ORDER_STEPS.length,
  hostile_denominator:110,
  increment_preflight_required:true,
  increment_preflight_denominator:ROTFL_ORDER_STEPS.length,
  hostile_rejected:rejected,
  false_green:falseGreen,
  prefix_controls:ROTFL_ORDER_STEPS.length+1,
  result:'PASS',
  effects:0
}));
