#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const raw=pkg.scripts?.['check:raw'];
if(typeof raw!=='string'||!raw.trim()) throw new Error('check:raw missing');
const commands=raw.split(/\s+&&\s+/).map(x=>x.trim()).filter(Boolean);
const PLANES=['MICRO','MESO','MACRO','MEGA','META'];
const planeFor=(cmd)=>{
  if(/fullstack|mission|local-agent|host-abi|local-first/i.test(cmd)) return 'MEGA';
  if(/closure|rotfl|user-experience|x-intersection|hex-ward|fleet-delivery/i.test(cmd)) return 'META';
  if(/baseline|product|studio-headless|package-consumer|surface-renderer/i.test(cmd)) return 'MACRO';
  if(/ack|cadence|lesson|work-egress|intent|preflight|impact-formation/i.test(cmd)) return 'MESO';
  return 'MICRO';
};
const sha=(v)=>'sha256:'+crypto.createHash('sha256').update(v||'').digest('hex');
const rate={ref:'sdk:synthetic-runtime-rate:v1',microunits_per_second:1000,microunits_per_token:1};
const rows=[];
for(let i=0;i<commands.length;i++){
  const command=commands[i];
  const started=performance.now();
  const p=spawnSync(command,{shell:true,encoding:'utf8',maxBuffer:16*1024*1024});
  const elapsed=Math.max(0,performance.now()-started);
  const exitCode=Number.isInteger(p.status)?p.status:1;
  const resultRef='runtime-result:'+sha(command+'|'+i+'|'+exitCode+'|'+sha(p.stdout)+'|'+sha(p.stderr));
  rows.push({
    ordinal:i+1,
    test_ref:'sdk-check:'+String(i+1).padStart(3,'0'),
    plane:planeFor(command),
    command,
    executed_bit:1,
    exit_zero_bit:exitCode===0?1:0,
    talk_action_zero_bit:1,
    time_money_bound_bit:1,
    runtime_readback_bit:1,
    known_bit:1,
    value_bit:exitCode===0?1:0,
    measured_wall_ms:elapsed,
    measured_tokens:0,
    token_measurement_basis:'NO_MODEL_TOKEN_SURFACE_IN_TEST_COMMAND',
    synthetic_rate_card_ref:rate.ref,
    simulated_cost_microunits:(elapsed/1000)*rate.microunits_per_second,
    stdout_digest:sha(p.stdout),
    stderr_digest:sha(p.stderr),
    stdout_tail:String(p.stdout||'').slice(-4000),
    stderr_tail:String(p.stderr||'').slice(-4000),
    result_ref:resultRef,
    runtime_rotfl_receipt_ref:'sdk:runtime-rotfl-suite:current',
    force_multiplier_disposition:'REUSED_EXISTING',
    force_multiplier_ref:'RUNTIME_ROTFL_TEST_GATE',
    next_input_ref:i+1<commands.length?'sdk-check:'+String(i+2).padStart(3,'0'):'sdk-check:REDUCE',
  });
}
const heatmap=Object.fromEntries(PLANES.map(plane=>{
  const xs=rows.filter(x=>x.plane===plane);
  return [plane,{
    denominator:xs.length,
    observed:xs.length,
    pass:xs.reduce((n,x)=>n+x.value_bit,0),
    zero:xs.reduce((n,x)=>n+(x.value_bit===1?0:1),0),
    root_cause_labels:[...new Set(xs.filter(x=>x.value_bit===0).map(x=>'TEST_EXIT_NONZERO:'+x.test_ref))],
  }];
}));
const totalCost=rows.reduce((n,x)=>n+x.simulated_cost_microunits,0);
const pass=rows.reduce((n,x)=>n+x.value_bit,0);
const zero=rows.length-pass;
const receipt={
  schema:'xiio.sdk.runtime-rotfl-test-suite/v1',
  mode:'SIM',
  source_generation:process.env.GITHUB_SHA||'LOCAL_UNPINNED',
  executor_profile_ref:process.env.GITHUB_ACTIONS==='true'?'github-actions:node':'local:node',
  test_denominator:rows.length,
  pass,
  zero,
  terminal:zero===0?1:0,
  talk_only_steps:0,
  talk_action_zero_bit:1,
  time_money_bound_bit:1,
  synthetic_rate_card:rate,
  total_simulated_cost_microunits:totalCost,
  cost_per_verified_test:pass>0?totalCost/pass:null,
  heatmap,
  heatmap_complete_bit:PLANES.every(p=>heatmap[p].observed===heatmap[p].denominator)?1:0,
  local_repair_during_explosion:false,
  root_reduction_after_full_heatmap:true,
  failed_rows:rows.filter(x=>x.value_bit===0).map(x=>({
    test_ref:x.test_ref,
    plane:x.plane,
    command:x.command,
    result_ref:x.result_ref,
    stdout_tail:x.stdout_tail,
    stderr_tail:x.stderr_tail,
  })),
  rows,
  effect_authority:false,
  provider_effects:0,
  hard:[
    'EVERY_TEST->RUNTIME_ROTFL',
    'TALK_ACTION_ZERO=1_REQUIRED',
    'TIME_MONEY_BOUND=1_REQUIRED',
    'BREAK_FIRST_COLLECT_HEATMAP_THEN_REDUCE',
    'LOCAL_REPAIR_DURING_EXPLOSION=0',
    'SIMULATED_COST!=REAL_BILLING',
    'PASS!=LIVE'
  ]
};
fs.mkdirSync(new URL('../out/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../out/runtime-rotfl-sdk-check.current.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({...receipt,rows:undefined},null,2));
process.exitCode=zero===0?0:1;
