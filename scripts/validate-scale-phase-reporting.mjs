#!/usr/bin/env node
import assert from 'node:assert/strict';
import {validateScalePhaseTuple,compileScalePhaseProjection} from '../src/metrics/scale-phase-reporting.mjs';

const base={
 scale:'100s',phase:'PLAN',direction:'10_TO_1',qualification:'SILVER',readiness:'WAIT',
 currentness:'CURRENT',effect_ceiling:0,reporting_mutates_state:false,scale_inferred_from_count:false,
 exact_child_refs:Array.from({length:10},(_,i)=>`10s-${i+1}`),plan_receipt:'PLAN',
 execution_receipts:Array.from({length:10},(_,i)=>`EXEC-${i+1}`),return_receipt:'RETURN',
 parent_recompute_receipt:'RECOMPUTE',silent_remainder:0,independent_replay:false
};

const families=[
 ['COUNT_AS_SCALE',x=>x.scale_inferred_from_count=true,'COUNT_USED_AS_SCALE'],
 ['WRONG_DIRECTION',x=>x.direction='1_TO_10','DIRECTION_PHASE_MISMATCH'],
 ['REPORT_MUTATES',x=>x.reporting_mutates_state=true,'REPORTING_MUTATES_STATE'],
 ['MISSING_CHILD',x=>x.exact_child_refs=x.exact_child_refs.slice(0,9),'TEN_CHILD_REFS_REQUIRED'],
 ['MISSING_PLAN',x=>delete x.plan_receipt,'PLAN_RECEIPT_REQUIRED'],
 ['MISSING_EXEC',x=>x.execution_receipts=x.execution_receipts.slice(0,9),'EXECUTION_RECEIPTS_REQUIRED'],
 ['MISSING_RETURN',x=>delete x.return_receipt,'RETURN_RECEIPT_REQUIRED'],
 ['MISSING_RECOMPUTE',x=>delete x.parent_recompute_receipt,'PARENT_RECOMPUTE_REQUIRED'],
 ['SILENT_REMAINDER',x=>x.silent_remainder=1,'SILENT_REMAINDER_NONZERO'],
 ['GOLD_WAIT',x=>x.qualification='GOLD','GOLD_WITHOUT_PASS'],
 ['PLATINUM_NO_REPLAY',x=>{x.qualification='PLATINUM';x.readiness='PASS';},'PLATINUM_WITHOUT_INDEPENDENT_REPLAY'],
 ['BAD_SCALE',x=>x.scale='500s','SCALE_INVALID']
];

for(let i=0;i<120;i++){
  const [name,mut,expected]=families[i%families.length];
  const x=JSON.parse(JSON.stringify(base)); mut(x);
  const result=validateScalePhaseTuple(x);
  assert.equal(result.ok,false,name);
  assert.ok(result.errors.includes(expected),`${name} missing ${expected}`);
}
assert.equal(validateScalePhaseTuple(base).ok,true);
const projected=compileScalePhaseProjection(base);
assert.equal(projected.ok,true);
assert.equal(projected.projection.reporting_read_only,true);
assert.equal(projected.projection.scale,'100s');
assert.equal(projected.projection.phase,'PLAN');
console.log('SDK_ROTFL_SCALE_PHASE_REPORTING=PASS hostiles=120 false_green=0');
