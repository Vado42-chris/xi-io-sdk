#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runHostileHarness, assertHostileHarness, HostileHarnessError } from '../src/evaluation/hostile-harness.mjs';

const fixture={state:'SAFE',rows:Array.from({length:20},(_,i)=>({id:'R'+i,value:i,locked:true})),effect_authority:0};
const validate=v=>{
  const e=[];
  if(v.state!=='SAFE') e.push('STATE_UNSAFE');
  if(v.rows.some(r=>r.locked!==true)) e.push('LOCK_BROKEN');
  if(v.effect_authority!==0) e.push('EFFECT_AUTHORITY');
  return e;
};

const good=runHostileHarness({
  fixture,validate,
  families:[
    {id:'STATE',count:100,expected_codes:['STATE_UNSAFE'],mutate:(v,i)=>{v.state='BAD_'+i;}},
    {id:'LOCK',count:100,expected_codes:['LOCK_BROKEN'],mutate:(v,i)=>{v.rows[i%20].locked=false;v.rows[i%20].value=1000+i;}},
    {id:'EFFECT',count:100,expected_codes:['EFFECT_AUTHORITY'],mutate:(v,i)=>{v.effect_authority=i+1;}}
  ]
});
assert.equal(good.denominator,300);
assert.equal(good.rejected,300);
assert.equal(good.false_green,0);
assert.equal(good.no_op_mutations,0);
assert.equal(good.wrong_invariant,0);
assert.equal(good.diversity_failures,0);
assert.equal(assertHostileHarness(good).strict_pass,true);

const noop=runHostileHarness({
  fixture,validate,
  families:[{id:'NOOP',count:10,expected_codes:['STATE_UNSAFE'],mutate:()=>{}}]
});
assert.equal(noop.strict_pass,false);
assert.equal(noop.no_op_mutations,10);

const falseGreen=runHostileHarness({
  fixture,validate:()=>[],
  families:[{id:'FG',count:10,expected_codes:['STATE_UNSAFE'],mutate:(v,i)=>{v.state='BAD_'+i;}}]
});
assert.equal(falseGreen.strict_pass,false);
assert.equal(falseGreen.false_green,10);

const wrong=runHostileHarness({
  fixture,
  validate:v=>v.state!=='SAFE'?['UNRELATED_ERROR']:[],
  families:[{id:'WRONG',count:10,expected_codes:['STATE_UNSAFE'],mutate:(v,i)=>{v.state='BAD_'+i;}}]
});
assert.equal(wrong.strict_pass,false);
assert.equal(wrong.wrong_invariant,10);

const inflated=runHostileHarness({
  fixture,validate,
  families:[{id:'INFLATED',count:100,expected_codes:['STATE_UNSAFE'],mutate:v=>{v.state='SAME_BAD';}}]
});
assert.equal(inflated.strict_pass,false);
assert.equal(inflated.families[0].unique_mutations,1);
assert.equal(inflated.diversity_failures,1);

let canonical='NO_ERROR';
try{
  runHostileHarness({fixture:{...fixture,state:'BAD'},validate,families:[{id:'X',count:1,expected_codes:['STATE_UNSAFE'],mutate:v=>{v.state='WORSE';}}]});
}catch(e){ canonical=e instanceof HostileHarnessError?e.code:e.name; }
assert.equal(canonical,'CANONICAL_FIXTURE_INVALID');

console.log(JSON.stringify({
  schema:'xiio.sdk.hostile-harness-self-test/v1',
  result:'PASS',
  real_hostiles:300,
  no_op_detected:10,
  false_green_detected:10,
  wrong_invariant_detected:10,
  denominator_inflation_detected:true,
  canonical_invalid_detected:true
},null,2));
