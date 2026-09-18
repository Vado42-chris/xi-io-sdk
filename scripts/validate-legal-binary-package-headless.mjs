#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiio-legal-headless-'));
const passInput=path.join(dir,'pass.json');
const passOutput=path.join(dir,'out','pass.json');
const redInput=path.join(dir,'red.json');
const redOutput=path.join(dir,'out','red.json');

const base={
  schema:'xiio.sdk.legal-binary-package-input/v1',
  root_ref:'case:test',root_generation:'g1',user_ref:'user:test',product_ref:'sam_law',studio_root_ref:'studio:root',
  scale:'META',impact_assessment_ref:'impact:g1',
  five_d:{WHERE:'test',WHAT:'legal package',HOW_WHO:'headless sdk',WHEN:'g1',WHY:'runtime proof'},
  ack_ref:'ack:test',ack_generation:'ack:g1',ack_current_bit:1,
  sdk_ref:'sdk:test',sdk_generation:'sdk:g1',sdk_current_bit:1,running_consumption_bit:1,
  work_ref:'work:test',package_owner_ref:'owner:test',
  facts:[{
    fact_id:'F1',question:'Is the required source present?',answer:'YES',required_bit:1,material_bit:1,
    owner_ref:'owner:test',work_ref:'work:test',source_refs:['source:test'],source_generation:'source:g1',
    issue_refs:['issue:test'],consumer_refs:['consumer:test'],effect_class:'NONE',user_choice_bit:0,currentness:'CURRENT',priority_rank:1
  }],
  package_items:[{
    item_id:'P1',path_ref:'package/test.pdf',role:'COURT_ARTIFACT',required_bit:1,present_bit:1,current_bit:1,
    source_bound_bit:1,consumer_bound_bit:1,owner_gate_bit:0,executed_bit:0,required_fact_ids:['F1'],evidence_refs:['evidence:test']
  }]
};
fs.writeFileSync(passInput,JSON.stringify(base));
const red=structuredClone(base);
red.facts[0].answer='ASK_MORE_DETAILS';
red.facts[0].source_refs=[];
red.facts[0].currentness='UNKNOWN';
fs.writeFileSync(redInput,JSON.stringify(red));

const run=(input,output)=>spawnSync(process.execPath,['scripts/legal-binary-package-headless.mjs','--input',input,'--output',output],{encoding:'utf8'});
const pass=run(passInput,passOutput);
assert.equal(pass.status,0,pass.stderr);
const passResult=JSON.parse(fs.readFileSync(passOutput,'utf8'));
assert.equal(passResult.gate_pass,true);
assert.equal(passResult.dataforge_record_denominator,1);
assert.equal(passResult.ack_trinity.trinity_accounting_100,true);

const fail=run(redInput,redOutput);
assert.equal(fail.status,2,fail.stderr);
const failResult=JSON.parse(fs.readFileSync(redOutput,'utf8'));
assert.equal(failResult.gate_pass,false);
assert.equal(failResult.first_red.wake_id,'FACT:F1');
assert.equal(failResult.dataforge_records[0].known_bit,0);

console.log(JSON.stringify({
  schema:'xiio.sdk.legal-binary-headless-validation/v1',
  result:'PASS',
  pass_exit:pass.status,
  red_exit:fail.status,
  ack_trinity:true,
  dataforge:true,
  provider_effect:false,
  legal_effect:false
}));
