#!/usr/bin/env node
import assert from 'node:assert/strict';
import { discoverRunnerServices, recoverAriesRunner } from '../src/recovery/aries-runner.mjs';

function fakeExecFactory({service='inactive',listener=false,job='queued'}={}){
  const calls=[];
  const exec=(command,args=[])=>{
    calls.push([command,...args]);
    const joined=[command,...args].join(' ');
    if(joined.includes('systemctl list-unit-files actions.runner.*.service')) return {ok:true,status:0,stdout:'actions.runner.test.service enabled\n',stderr:''};
    if(joined.includes('systemctl --user list-unit-files')) return {ok:true,status:0,stdout:'',stderr:''};
    if(joined.includes('systemctl is-active actions.runner.test.service')) return {ok:service==='active',status:service==='active'?0:3,stdout:service+'\n',stderr:''};
    if(joined.includes('systemctl start actions.runner.test.service')) { service='active'; return {ok:true,status:0,stdout:'',stderr:''}; }
    if(joined.startsWith('pgrep -af Runner.Listener')) return listener
      ? {ok:true,status:0,stdout:'123 /opt/actions-runner/bin/Runner.Listener run\n',stderr:''}
      : {ok:false,status:1,stdout:'',stderr:''};
    if(joined.includes('gh api repos/Vado42-chris/xi-io.net/actions/runs/42/jobs')){
      const status=job==='running'?'in_progress':job;
      return {ok:true,status:0,stdout:JSON.stringify({jobs:[{id:99,status,conclusion:null,runner_id:status==='queued'?0:7,runner_name:status==='queued'?null:'aries',steps:status==='queued'?[]:[{name:'Require Aries',status:'in_progress'}]}]}),stderr:''};
    }
    if(joined.includes('gh api repos/Vado42-chris/xi-io.net/actions/runs/42')){
      return {ok:true,status:0,stdout:JSON.stringify({id:42,status:job==='running'?'in_progress':job,head_sha:'a'.repeat(40)}),stderr:''};
    }
    if(joined.startsWith('find ')) return {ok:true,status:0,stdout:'',stderr:''};
    return {ok:true,status:0,stdout:'',stderr:''};
  };
  return {exec,calls,setListener(v){listener=v;},setJob(v){job=v;}};
}

{
  const f=fakeExecFactory({service:'inactive',listener:true,job:'running'});
  const plan=recoverAriesRunner({execute:false,host:'aries',exec:f.exec,env:{...process.env,XIIO_RUNNER_SEARCH_ROOTS:'/tmp'}});
  assert.equal(plan.state,'PLAN_READY');
  assert.equal(plan.authority.new_registration,false);
  assert.equal(plan.authority.token,false);
}

{
  const f=fakeExecFactory({service:'inactive',listener:true,job:'running'});
  const result=recoverAriesRunner({
    execute:true,host:'aries',exec:f.exec,env:{...process.env,XIIO_RUNNER_SEARCH_ROOTS:'/tmp'},
    targetRepo:'Vado42-chris/xi-io.net',targetRunId:'42',targetJobId:'99',targetHeadSha:'a'.repeat(40),waitSeconds:0,
  });
  assert.equal(result.state,'PASS_RUNTIME_RECOVERY');
  assert.equal(result.provider.runner_id,7);
  assert.equal(result.provider.steps,1);
  assert.equal(result.start.mutation,'START_EXISTING_SYSTEM_SERVICE');
  assert.ok(f.calls.some(x=>x.join(' ')==='systemctl start actions.runner.test.service'));
  assert.ok(!f.calls.some(x=>x.join(' ').includes('config.sh')));
}

{
  const f=fakeExecFactory({service:'active',listener:true,job:'running'});
  const result=recoverAriesRunner({execute:true,host:'aries',exec:f.exec,env:{...process.env,XIIO_RUNNER_SEARCH_ROOTS:'/tmp'}});
  assert.equal(result.state,'PASS_RUNTIME_RECOVERY');
  assert.equal(result.start.mutation,'NONE');
}

{
  const noRunner=(command,args=[])=>{
    const joined=[command,...args].join(' ');
    if(joined.includes('list-unit-files')) return {ok:true,status:0,stdout:'',stderr:''};
    if(joined.startsWith('pgrep ')) return {ok:false,status:1,stdout:'',stderr:''};
    if(joined.startsWith('find ')) return {ok:true,status:0,stdout:'',stderr:''};
    return {ok:true,status:0,stdout:'',stderr:''};
  };
  const result=recoverAriesRunner({execute:true,host:'aries',exec:noRunner,env:{...process.env,XIIO_RUNNER_SEARCH_ROOTS:'/tmp'}});
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.first_red,'RUNNER_SERVICE_AND_REGISTRATION_NOT_FOUND');
}

{
  const f=fakeExecFactory({service:'active',listener:true});
  const result=recoverAriesRunner({execute:true,host:'not-aries',exec:f.exec,env:{...process.env,XIIO_RUNNER_SEARCH_ROOTS:'/tmp'}});
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.first_red,'WRONG_HOST');
}

console.log(JSON.stringify({
  schema:'xiio.cli.aries-runner-recovery-validation/v2',
  status:'PASS',
  cases:5,
  service_first:true,
  listener_noop:true,
  exact_provider_job_readback:true,
  no_new_registration:true,
  no_token:true,
  provider_effects:0
}));
