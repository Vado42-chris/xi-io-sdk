import assert from 'node:assert/strict';
import {compileYar,validateYar,YAR_SCHEMA} from '../src/acks/yar-return.mjs';
const base={schema:YAR_SCHEMA,ack_ref:'ack:1',root_ref:'studio:current',returned_root_ref:'studio:current',work_ref:'work:1',returned_work_ref:'work:1',generation:'g1',ack_generation:'g1',result_ref:'result:1',return_target_ref:'studio:current',return_ref:'return:1',apply_return_ref:'apply:1',readback_ref:'readback:1',reap_ref:'reap:1',next_input_ref:'next:1',source_occurrences:3,returned_source_occurrences:3,affected_refs:['a','b'],returned_affected_refs:['a','b'],result_bit:1,return_bit:1,apply_bit:1,readback_bit:1,reap_bit:1,effect_authority:0};
assert.equal(validateYar(base).supplied_complete,true);
assert.equal(validateYar(base).complete,false);
assert.equal(validateYar(base).verification_state,'SUPPLIED_UNVERIFIED');
const hostile=[
 p=>{p.return_bit=0},p=>{p.apply_bit=0},p=>{p.readback_bit=0},p=>{p.reap_bit=0},
 p=>{p.returned_root_ref='leaf:1'},p=>{p.ack_generation='stale'},p=>{p.returned_work_ref='other'},
 p=>{p.returned_source_occurrences=2},p=>{p.returned_affected_refs=['c']},p=>{p.effect_authority=1},
 p=>{p.return_ref=''},p=>{p.result_bit=0},p=>{p.reap_bit=2},
 p=>{p.affected_refs=['a','a']},p=>{p.returned_affected_refs=['a']},
 p=>{p.source_occurrences=undefined;p.returned_source_occurrences=undefined},
 p=>{p.readback_ref=p.return_ref}
];
let caught=0;
for(let i=0;i<200;i++){const p=JSON.parse(JSON.stringify(base));hostile[i%hostile.length](p);if(!validateYar(p).supplied_complete)caught++;}
assert.equal(caught,200);
assert.equal(compileYar(base).state,'SUPPLIED_UNVERIFIED');
assert.equal(compileYar(base).complete,false);
assert.equal(compileYar(base).authority_granted,false);
assert.equal(compileYar(base).provider_effect,false);
const replay={...base,ack_ref:'ack:2',work_ref:'work:2',returned_work_ref:'work:2'};
assert.equal(compileYar(replay).complete,false,'shared unverified receipts cannot become independently verified');
console.log(JSON.stringify({valid:1,hostiles:200,rejected:caught,false_green:200-caught,scope:'structural_only',runtime_proven:false}));
