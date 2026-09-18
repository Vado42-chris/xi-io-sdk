#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileBinaryFacts } from '../src/acks/binary-fact.mjs';

let checks=0;
const base={
  schema:'xiio.sdk.binary-fact-input/v1',
  root_ref:'sam_law:DIV-SA-00005-2026',
  source_generation:'provider:X62',
  facts:[
    {fact_id:'F01',subject_ref:'package:x62',question:'Is exact package identity bound?',answer:'YES',source_refs:['gdrive:x62'],source_class:'PROVIDER_NATIVE',owner_ref:'sam_law',consumer_refs:['ibal','bins']},
    {fact_id:'F02',subject_ref:'owner',question:'Has owner adopted all sworn facts?',answer:'NO',source_refs:['gmail:owner-review'],source_class:'OWNER_GATE',owner_ref:'user',consumer_refs:['sam_law']},
    {fact_id:'F03',subject_ref:'source:2025-noa',question:'Is 2025 CRA NOA bound?',answer:'ASK_MORE_DETAILS',source_refs:[],source_class:'PROVIDER_SOURCE',owner_ref:'source',consumer_refs:['form15-47'],wait_reason:'2025 CRA assessment not bound'}
  ]
};
const out=compileBinaryFacts(base);
assert.equal(out.denominator,3); checks++;
assert.deepEqual(out.counts,{yes:1,no:1,ask_more_details:1,known:2,unknown:1}); checks++;
const by=Object.fromEntries(out.facts.map(f=>[f.fact_id,f]));
assert.deepEqual([by.F01.known_bit,by.F01.value_bit],[1,1]); checks++;
assert.deepEqual([by.F02.known_bit,by.F02.value_bit],[1,0]); checks++;
assert.equal(by.F03.known_bit,0); checks++;
assert.equal(out.silent_remainder,0); checks++;
assert.equal(out.authority_granted,false); checks++;
assert.equal(out.legal_effect,false); checks++;

const reversed=structuredClone(base); reversed.facts.reverse();
assert.deepEqual(compileBinaryFacts(reversed).facts.map(f=>f.fact_ref),out.facts.map(f=>f.fact_ref)); checks++;

const hostile=(mutate,pattern)=>{const x=structuredClone(base); mutate(x); assert.throws(()=>compileBinaryFacts(x),pattern); checks++;};
hostile(x=>x.facts[0].answer='MAYBE',/answer invalid/);
hostile(x=>x.facts[0].source_refs=[],/known answer requires source_refs/);
hostile(x=>x.facts.push(structuredClone(x.facts[0])),/duplicate fact_id/);
hostile(x=>x.facts=[],/facts required/);
hostile(x=>x.source_generation='',/source_generation required/);

console.log(JSON.stringify({schema:'xiio.sdk.binary-fact-validation/v1',result:'PASS',checks,hostiles:5,authority_granted:false,provider_effect:false,legal_effect:false}));
