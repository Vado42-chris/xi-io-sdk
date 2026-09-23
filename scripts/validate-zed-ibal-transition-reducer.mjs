#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reduceMultiplicativeFactors } from '../src/evaluation/transition-proof-reducer.mjs';

const src=fs.readFileSync('bin/xi.mjs','utf8');
for(const token of [
  "xi-io zed ibal status --json",
  "xi-io zed ibal recover --json",
  "ZED_RUNNING",
  "ACP_SPAWNED",
  "ACP_SESSION_DELTA",
  "BINDING_APPLY_FAILED",
  "punchcard-plan-bridge-zed-ibal-controls.mjs",
  "operations.ndjson",
  "configureZedIbal",
]) assert.ok(src.includes(token),token);

const cases=[
  [[false,false,false],'ZED_RUNNING'],
  [[true,false,false],'ACP_SPAWNED'],
  [[true,true,false],'ACP_SESSION_DELTA'],
  [[true,true,true],null],
];
for(const [values,red] of cases){
  const got=reduceMultiplicativeFactors([
    {id:'ZED_RUNNING',value:values[0],evidence_ref:'z'},
    {id:'ACP_SPAWNED',value:values[1],evidence_ref:'a'},
    {id:'ACP_SESSION_DELTA',value:values[2],evidence_ref:'s'},
  ]);
  assert.equal(got.first_zero,red);
  assert.equal(got.product,red?0:1);
}
console.log('ZED_IBAL_TRANSITION_REDUCER=PASS active_denominator=3 first_zero_order=ZED_RUNNING>ACP_SPAWNED>ACP_SESSION_DELTA');
