import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalAgentServiceUnit,waitForLocalAgentServiceStatus} from '../src/install/local-agent-service.mjs';

test('local-agent service is loopback-only and runs installed SDK agent under existing admission',()=>{
  const out=compileLocalAgentServiceUnit({
    node_path:'/usr/bin/node',
    sdk_root:'/opt/xi-io/sdk',
    workspace_dir:'/srv/xi-io/workspace',
  });
  assert.equal(out.schema,'xiio.sdk.local-agent-service/v1');
  assert.equal(out.unit,'xiio-local-agent.service');
  assert.equal(out.endpoint,'http://127.0.0.1:3109');
  assert.equal(out.status_endpoint,'http://127.0.0.1:3109/v1/status');
  assert.equal(out.execute_mode,'BOUNDED_REQUIRES_ROTFL_ADMISSION');
  assert.match(out.content,/ExecStart="\/usr\/bin\/node" "\/opt\/xi-io\/sdk\/bin\/xi-local-agent\.mjs" --serve --execute/);
  assert.match(out.content,/WorkingDirectory="\/srv\/xi-io\/workspace"/);
  assert.match(out.content,/WantedBy=default\.target/);
  assert.equal(out.authority_granted,false);
  assert.equal(out.provider_effect,false);
});

test('service compiler rejects missing or multiline path inputs',()=>{
  assert.throws(()=>compileLocalAgentServiceUnit({}),/LOCAL_AGENT_SERVICE_INPUT_REQUIRED/);
  assert.throws(()=>compileLocalAgentServiceUnit({
    node_path:'/usr/bin/node\nBad=1',
    sdk_root:'/opt/xi-io/sdk',
    workspace_dir:'/srv/xi-io/workspace',
  }),/LOCAL_AGENT_SERVICE_VALUE_INVALID/);
});

test('service unit contains no operator-specific home path',()=>{
  const out=compileLocalAgentServiceUnit({
    node_path:'/home/example/.local/node/bin/node',
    sdk_root:'/home/example/.local/share/xi-io/sdk',
    workspace_dir:'/home/example/.local/share/xi-io/workspaces/default',
  });
  assert.doesNotMatch(out.content,/chrishallberg|Storage 22|\/media\//);
});

const validStatus={schema:'xiio.cli.local-agent-http/v1',service_listener_observed:true,
  state:'DEGRADED',runtime_verified:false,installed_sdk_generation_verified:false};
const response=(status=validStatus)=>({status:200,json:async()=>status});
const fast={timeoutMs:80,requestTimeoutMs:20,retryDelayMs:1};

test('service readiness retries delayed listener and preserves degraded runtime evidence',async()=>{
  const calls=[];
  const result=await waitForLocalAgentServiceStatus({...fast,fetchImpl:async(url,options)=>{
    calls.push({url,method:options.method,redirect:options.redirect});
    if(calls.length<3)throw new Error('ECONNREFUSED');
    return response();
  }});
  assert.equal(result.status_readback,true);
  assert.equal(result.attempts,3);
  assert.deepEqual(result.status,validStatus);
  assert.equal(result.status.runtime_verified,false);
  assert.equal(result.status.installed_sdk_generation_verified,false);
  assert.equal(result.provider_effect,false);
  assert.equal(result.authority_granted,false);
  assert.ok(calls.every(c=>c.url==='http://127.0.0.1:3109/v1/status'&&c.method==='GET'&&c.redirect==='error'));
});

test('service readiness bounds connection failure and returns no successful readback',async()=>{
  const result=await waitForLocalAgentServiceStatus({...fast,timeoutMs:12,fetchImpl:async()=>{throw new Error('ECONNREFUSED');}});
  assert.equal(result.status_readback,false);
  assert.equal(result.status,null);
  assert.ok(result.attempts>0);
  assert.equal(result.reason,'LOCAL_AGENT_STATUS_UNAVAILABLE');
});

test('service readiness timeout also bounds stalled body reads and aborts the request',async()=>{
  const signals=[];
  const result=await waitForLocalAgentServiceStatus({...fast,timeoutMs:25,requestTimeoutMs:8,fetchImpl:async(_,o)=>{
    signals.push(o.signal);
    return {status:200,json:()=>new Promise(()=>{})};
  }});
  assert.equal(result.status_readback,false);
  assert.equal(result.status,null);
  assert.equal(result.reason,'LOCAL_AGENT_STATUS_TIMEOUT');
  assert.ok(signals.length>0&&signals.every(s=>s.aborted));
});

test('service readiness does not credit wrong response shape or HTTP failure',async()=>{
  for(const fetchImpl of [async()=>({status:503,json:async()=>validStatus}),async()=>response({schema:'other',service_listener_observed:true}),async()=>response({...validStatus,service_listener_observed:false})]){
    const result=await waitForLocalAgentServiceStatus({...fast,timeoutMs:8,fetchImpl});
    assert.equal(result.status_readback,false);
    assert.equal(result.status,null);
    assert.equal(result.authority_granted,false);
  }
});

test('service readiness rejects invalid timing before any probe',async()=>{
  let calls=0;
  for(const options of [{timeoutMs:0},{timeoutMs:Infinity},{requestTimeoutMs:0},{retryDelayMs:-1},{timeoutMs:30001}]){
    await assert.rejects(waitForLocalAgentServiceStatus({...options,fetchImpl:async()=>{calls++;return response();}}),/LOCAL_AGENT_STATUS_TIMING_INVALID/);
  }
  assert.equal(calls,0);
});

test('service readiness never credits a body completed after the deadline',async()=>{
  const result=await waitForLocalAgentServiceStatus({...fast,timeoutMs:5,requestTimeoutMs:5,fetchImpl:async()=>({
    status:200,
    async json(){
      const end=performance.now()+20;
      while(performance.now()<end){}
      return validStatus;
    },
  })});
  assert.equal(result.status_readback,false);
  assert.equal(result.reason,'LOCAL_AGENT_STATUS_TIMEOUT');
});
