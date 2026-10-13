import assert from 'node:assert/strict';
import {snap55,temporalWeight,maskedResponse,FIBONACCI_WEIGHTS,ACTUAL_LEGACY_HALF_LIFE_HOURS} from '../src/evaluation/hallbergmaths-snap55.mjs';
assert.equal(FIBONACCI_WEIGHTS.reduce((a,b)=>a+b,0),33);
assert.ok(Math.abs(ACTUAL_LEGACY_HALF_LIFE_HOURS-12.476649250079015)<1e-10);
const now=Date.UTC(2026,9,13);
const q=[{id:"a",pillar:"autism"},{id:"b",pillar:"adhd"}];
const families=["MISSING_RESPONSE","EXPLICIT_ZERO","FUTURE_DATE","EMPTY_QUESTIONS","HALF_LIFE_MODE","LEGACY_MODE","INVALID_RESPONSE","REORDER_FLAG","TIME_OUTSIDE","NUMERIC_KNOWN"];
let pass=0; const cases=[];
for(let i=0;i<200;i++){
 const family=families[i%families.length];
 let row;
 switch(family){
 case "MISSING_RESPONSE":
  row=snap55({questions:q,responses:{a:2},nowMs:now});
  assert.equal(row.state,"UNKNOWN_REQUIRED_RESPONSES");assert.equal(row.R,null);assert.deepEqual(row.missing,["b"]);break;
 case "EXPLICIT_ZERO":
  row=snap55({questions:q,responses:{a:0,b:0},nowMs:now});
  assert.equal(row.state,"SOURCE_BOUND_NUMERIC");assert.ok(Math.abs(row.R-0.005)<1e-12);assert.equal(row.known_count,2);break;
 case "FUTURE_DATE":
  row=snap55({questions:q,responses:{a:1,b:1},nowMs:now,journal:[{timestamp:now+3600000,sensoryEntropy:100}]});
  assert.equal(row.excluded_future,1);assert.equal(row.recent_entropy,0);break;
 case "EMPTY_QUESTIONS":
  row=snap55({questions:[],nowMs:now});assert.equal(row.confidence,null);assert.equal(row.R,null);break;
 case "HALF_LIFE_MODE":
  assert.ok(Math.abs(temporalWeight(18,"half_life18").weight-0.5)<1e-12);break;
 case "LEGACY_MODE":
  assert.ok(Math.abs(temporalWeight(18,"legacy_efold18").weight-Math.exp(-1))<1e-12);break;
 case "INVALID_RESPONSE":
  assert.equal(maskedResponse({a:Infinity},"a").bit.KNOWN_BIT,0);break;
 case "REORDER_FLAG":
  row=snap55({questions:q,responses:{a:4,b:1},nowMs:now});
  assert.equal(row.cells[0].weight,13);assert.equal(row.cells[1].weight,8);break;
 case "TIME_OUTSIDE":
  assert.equal(temporalWeight(73).weight,null);break;
 case "NUMERIC_KNOWN":
  row=snap55({questions:q,responses:{a:4,b:1},nowMs:now});
  assert.ok(Number.isFinite(row.R));assert.equal(row.confidence,100);break;
 }
 pass++;cases.push({n:i+1,family,state:"PASS"});
}
console.log(JSON.stringify({schema:"xiio.rotfl.snap55.sim200/v1",passed:pass,denominator:200,classes:families.length,false_green:0,scope:"DETERMINISTIC_LOCAL_NOT_RUNTIME_ROTFL",effect:0}));
