import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalAgentServiceUnit} from '../src/install/local-agent-service.mjs';

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
