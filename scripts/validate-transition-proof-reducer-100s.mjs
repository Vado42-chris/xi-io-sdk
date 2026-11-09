#!/usr/bin/env node
import assert from 'node:assert/strict';
import { reduceMultiplicativeFactors, compileTransitionProofMatrix } from '../src/evaluation/transition-proof-reducer.mjs';

let falseGreen=0;
for(let i=0;i<100;i++){
  const mask=i%8;
  const values=[Boolean(mask&1),Boolean(mask&2),Boolean(mask&4)];
  const r=reduceMultiplicativeFactors([
    {id:'ZED_RUNNING',value:values[0],evidence_ref:'e1'},
    {id:'ACP_SPAWNED',value:values[1],evidence_ref:'e2'},
    {id:'ACP_SESSION_DELTA',value:values[2],evidence_ref:'e3'},
  ]);
  const expected=values.every(Boolean)?1:0;
  if(r.product!==expected) falseGreen++;
  assert.equal(r.product,expected);
  if(expected===0){
    const first=['ZED_RUNNING','ACP_SPAWNED','ACP_SESSION_DELTA'][values.findIndex(v=>!v)];
    assert.equal(r.first_zero,first);
    const firstIndex=r.rows.findIndex(x=>x.id===first);
    assert.ok(r.rows.slice(firstIndex+1).every(x=>x.state==='N_A_DOWNSTREAM'));
  }
}
assert.equal(falseGreen,0);

const transitions=['T1_LOAD','T2_SPAWN','T3_SESSION'];
const planes=['SOURCE','PROCESS','READBACK'];
const proven=transitions.map(t=>t+'::SOURCE');
const matrix=compileTransitionProofMatrix({
  transitions,proof_planes:planes,proven_cell_ids:proven,
  cells:[
    {id:'T1_LOAD::PROCESS',state:'WAIT'},
    {id:'T1_LOAD::READBACK',state:'WAIT'},
    {id:'T2_SPAWN::PROCESS',state:'WAIT'},
    {id:'T2_SPAWN::READBACK',state:'WAIT'},
    {id:'T3_SESSION::PROCESS',state:'WAIT'},
    {id:'T3_SESSION::READBACK',state:'WAIT'},
  ],
});
assert.equal(matrix.original_denominator,9);
assert.equal(matrix.proven_factor_count,3);
assert.equal(matrix.active_denominator,6);
assert.equal(matrix.false_green_count,0);
console.log('TRANSITION_PROOF_REDUCER_100S=PASS cases=100 false_green=0 matrix=9 proven=3 active=6');
