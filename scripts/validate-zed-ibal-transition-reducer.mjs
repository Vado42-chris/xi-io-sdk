#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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

// Evaluate only status helpers with synthetic inputs. No pgrep, runtime launch,
// settings write, network request or service command executes in this test.
function helper(name,nextName,globals={}){
  const start=src.indexOf(`function ${name}(`);
  const end=src.indexOf(`function ${nextName}(`,start);
  assert.ok(start>=0 && end>start,`missing bounded helper ${name}`);
  return vm.runInNewContext(`(${src.slice(start,end).trim()})`,globals);
}
const bindingReady=helper('zedIbalStatusBindingReady','zedIbalStatusFirstRed');
const firstRed=helper('zedIbalStatusFirstRed','ndjsonLineCount');
// Matches the accepted framework direct-operator launcher shape. Its wrapper
// is explicitly not a readiness requirement (zed-ibal-configure.mjs).
const direct={
  zed:{agent_servers_ok:true,agent_servers_ibal_command:'/fixture/node',agent_servers_ibal_args:['/fixture/acp-agent/agent-runtime-operator.mjs']},
  acp:{wrapper_ok:false,agent_ok:true,node_ok:true,node:'/fixture/node',runtime_entrypoint:'/fixture/acp-agent/agent-runtime-operator.mjs'},
  ollama:{ok:true},
};
assert.equal(bindingReady(direct),true,'direct operator must not require a legacy wrapper');
assert.equal(bindingReady({...direct,acp:{...direct.acp,wrapper_ok:true}}),true);
const legacy={zed:{agent_servers_ok:true},acp:{wrapper_ok:true,agent_ok:true,node_ok:true},ollama:{ok:true}};
assert.equal(bindingReady(legacy),true,'legacy wrapper remains supported');
assert.equal(bindingReady({...legacy,acp:{...legacy.acp,wrapper_ok:false}}),false);
for(const [group,key] of [['zed','agent_servers_ok'],['acp','agent_ok'],['acp','node_ok'],['ollama','ok']]){
  assert.equal(bindingReady({...direct,[group]:{...direct[group],[key]:false}}),false,`${group}.${key}`);
}
for(const zed of [
  {...direct.zed,agent_servers_ibal_command:'/fixture/other-node'},
  {...direct.zed,agent_servers_ibal_args:['/fixture/acp-agent/agent.mjs']},
  {...direct.zed,agent_servers_ibal_args:[...direct.zed.agent_servers_ibal_args,'--unqualified']},
]) assert.equal(bindingReady({...direct,zed}),false,'only exact supported direct binding qualifies');
assert.equal(bindingReady({}),false);

const probes=[
  [{status:0,stdout:'2\n'},2],
  [{status:1,stdout:'0\n'},0],
  [{status:null,error:{code:'ENOENT'},stdout:''},null],
  [{status:2,stdout:'0'},null],
  [{status:null,signal:'SIGTERM',stdout:'0'},null],
  [{status:0,stdout:''},null],
  [{status:0,stdout:'not-a-count'},null],
  [{status:0,stdout:'0'},null],
  [{status:1,stdout:'2'},null],
  [{status:0,stdout:'9007199254740992'},null],
];
for(const [response,expected] of probes){
  let calls=0;
  const observe=helper('observeProcessCount','zedIbalStatusBindingReady',{
    spawnSync:(command,args)=>{calls++;assert.equal(command,'pgrep');assert.deepEqual(Array.from(args),['-fc','synthetic-pattern']);return response;},
  });
  assert.equal(observe('synthetic-pattern'),expected);
  assert.equal(calls,1);
}
for(const [zed,acp,expected] of [
  [null,1,'ZED_PROCESS_OBSERVATION_UNKNOWN'],
  [0,1,'ZED_PROCESS_NOT_OBSERVED'],
  [1,null,'ACP_PROCESS_OBSERVATION_UNKNOWN'],
  [1,0,'ACP_PROCESS_NOT_OBSERVED'],
  [1,1,'ACP_SESSION_READBACK_UNVERIFIED'],
]) assert.equal(firstRed(true,{zed_process_count:zed,acp_agent_count:acp}),expected);
assert.equal(firstRed(false,{zed_process_count:1,acp_agent_count:1}),'BINDING_APPLIED');
const pattern=src.match(/observeProcessCount\('([^']*agent\([^']*)'\)/)?.[1];
assert.ok(pattern,'status must observe the supported operator entrypoint');
const regex=new RegExp(pattern.replaceAll('\\\\','\\').replace('[[:space:]]','\\s'));
assert.ok(regex.test('node /fixture/acp-agent/agent-runtime-operator.mjs'));
assert.ok(regex.test('node /fixture/acp-agent/agent.mjs'));
assert.equal(regex.test('node /fixture/acp-agent/agent.mjs.bak'),false);
assert.match(src,/action==='status'\?zedIbalStatusBindingReady\(source\):Boolean\(/,'recovery keeps its original readiness predicate');
assert.match(src,/COMMAND_LINE_PATTERN_ONLY_NOT_SESSION_OR_TOOL_PROOF/);
console.log('ZED_IBAL_STATUS=PASS direct_and_legacy_binding=12 process_observation=10 first_red=6 supported_process_pattern=3 effects=0');
console.log('ZED_IBAL_TRANSITION_REDUCER=PASS active_denominator=3 first_zero_order=ZED_RUNNING>ACP_SPAWNED>ACP_SESSION_DELTA');
