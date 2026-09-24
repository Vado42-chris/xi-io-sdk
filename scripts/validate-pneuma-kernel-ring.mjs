#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluatePneumaKernelRing } from '../src/runtime/pneuma-kernel-ring.mjs';

const base={
  generation:'ring:g1',
  digest:'ring:d1',
  spine_ref:'spine:kernel:g1',
  x_cross_ref:'x:kernel:g1',
  spin_out_ref:'spin:out:g1',
  spin_back_ref:'spin:back:g1',
  reciprocal_ref:'xi-io.net:standards/punchcards/spine-spin-reciprocal.v1.json',
  audhd:{state:'PASS',evidence_ref:'audhd:ux:g1'},
  switchboard:{state:'PASS',evidence_ref:'switchboard:ux:g1'},
  ward:{state:'PASS',evidence_ref:'ward:floor:g1'},
  ibal_ref:'ibal:observer:g1',
  coms_ref:'coms:return:g1',
};
const chain=[
  {kernel_ring_generation:'ring:g1',kernel_ring_digest:'ring:d1'},
  {kernel_ring_generation:'ring:g1',kernel_ring_digest:'ring:d1'},
  {kernel_ring_generation:'ring:g1',kernel_ring_digest:'ring:d1'},
];

function run(id,mutate,expectState,expectRed){
  const ring=structuredClone(base);
  mutate(ring);
  const out=evaluatePneumaKernelRing({kernel_ring:ring},chain);
  assert.equal(out.state,expectState,id);
  assert.equal(out.first_red,expectRed,id);
  return {id,state:out.state,first_red:out.first_red};
}

const results=[];
results.push(run('PASS_RECIPROCAL_RING',()=>{},'PASS',null));
results.push(run('TOP_TOO_COMPLICATED',x=>{x.audhd.state='FAIL';},'FAIL','UX_TOP_TOO_COMPLICATED'));
results.push(run('X_OVERLAP_FAIL',x=>{x.switchboard.state='FAIL';},'FAIL','UX_SWITCHBOARD_X_FAIL'));
results.push(run('BOTTOM_TOO_WEAK',x=>{x.ward.state='FAIL';},'FAIL','UX_BOTTOM_TOO_WEAK'));
results.push(run('MISSING_IBAL',x=>{x.ibal_ref='';},'TRUE_WAIT','UX_IBAL_OBSERVER_REF_MISSING'));
results.push(run('MISSING_COMS',x=>{x.coms_ref='';},'TRUE_WAIT','UX_COMS_RETURN_REF_MISSING'));

const drift=evaluatePneumaKernelRing({kernel_ring:base},[
  {kernel_ring_generation:'ring:g1',kernel_ring_digest:'ring:d1'},
  {kernel_ring_generation:'ring:g1',kernel_ring_digest:'ring:drift'},
]);
assert.equal(drift.state,'FAIL');
assert.equal(drift.first_red,'KERNEL_RING_DIGEST_DRIFT');
results.push({id:'RING_DIGEST_DRIFT',state:drift.state,first_red:drift.first_red});

console.log(JSON.stringify({
  schema:'xiio.sdk.pneuma-kernel-ring-validation/v1',
  state:'PASS',
  denominator:results.length,
  false_green:0,
  reciprocal_geometry_ref:'xi-io.net:standards/punchcards/spine-spin-reciprocal.v1.json',
  results,
  hard:[
    'SPINE!=SPIN',
    'PNEUMA_PIVOT!=RESET',
    'ONE_WAY_PASS!=RECIPROCAL_PASS',
    'AUDHD_TOP_FAIL=>TOO_COMPLICATED',
    'WARD_BOTTOM_FAIL=>TOO_WEAK',
    'SWITCHBOARD_X_FAIL=>UX_OVERLAP_NOT_PROVEN',
    'IBAL_VISIBILITY!=AUTHORITY',
    'COMS!=RUNTIME_TRUTH'
  ],
  effect_authority:0
},null,2));
