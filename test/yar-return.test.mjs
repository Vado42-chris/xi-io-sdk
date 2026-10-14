import assert from 'node:assert/strict';
import {compileYar,validateYar,YAR_SCHEMA} from '../src/acks/yar-return.mjs';
const base={schema:YAR_SCHEMA,ack_ref:'ack:1',root_ref:'studio:current',returned_root_ref:'studio:current',work_ref:'work:1',returned_work_ref:'work:1',generation:'g1',ack_generation:'g1',result_ref:'result:1',return_target_ref:'studio:current',return_ref:'return:1',apply_return_ref:'apply:1',readback_ref:'readback:1',reap_ref:'reap:1',next_input_ref:'next:1',source_occurrences:3,returned_source_occurrences:3,affected_refs:['a','b'],returned_affected_refs:['a'],result_bit:1,return_bit:1,apply_bit:1,readback_bit:1,reap_bit:1,effect_authority:0};
assert.equal(validateYar(base).complete,true);
const hostile=[
 p=>{p.return_bit=0},p=>{p.apply_bit=0},p=>{p.readback_bit=0},p=>{p.reap_bit=0},
 p=>{p.returned_root_ref='leaf:1'},p=>{p.ack_generation='stale'},p=>{p.returned_work_ref='other'},
 p=>{p.returned_source_occurrences=2},p=>{p.returned_affected_refs=['c']},p=>{p.effect_authority=1},
 p=>{p.return_ref=''},p=>{p.result_bit=0},p=>{p.reap_bit=2}
];
let caught=0;
for(let i=0;i<200;i++){const p=JSON.parse(JSON.stringify(base));hostile[i%hostile.length](p);if(!validateYar(p).complete)caught++;}
assert.equal(caught,200);
assert.equal(compileYar(base).state,'REAPED_RETURN_HOME');
console.log(JSON.stringify({valid:1,hostiles:200,rejected:caught,false_green:200-caught,scope:'structural_only',runtime_proven:false}));
