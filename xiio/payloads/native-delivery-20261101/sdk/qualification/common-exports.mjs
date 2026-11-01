import assert from 'node:assert/strict';
import * as connection from '@xi-io/sdk/worker/connection';
import * as lifecycle from '@xi-io/sdk/worker/lifecycle';
import * as babysit from '@xi-io/sdk/cadence/babysit';

assert.equal(connection.WORKER_CONNECTION_SCHEMA, 'xiio.sdk.worker-connection/v1');
for (const name of ['createSharedWorkerConnection','inspectLocalAgentStatus','normalizeLocalAgentMessage','validateLocalAgentTurnReply']) assert.equal(typeof connection[name], 'function');
assert.equal(typeof lifecycle.runWorkerLifecycleAttempt, 'function');
assert.equal(typeof lifecycle.compileWorkerAdapterConformance, 'function');
assert.equal(typeof babysit.runBabysitHost, 'function');
assert.throws(() => connection.createSharedWorkerConnection(), /SDK_WORKER_PORTS_UNBOUND/);
const status = connection.inspectLocalAgentStatus({});
assert.equal(status.state, 'BLOCKED');
assert.equal(status.authority_granted, false);
assert.equal(status.provider_effect, false);
console.log(JSON.stringify({
  schema:'xiio.sdk.current-main-closure-proof/v1',state:'PASS',
  public_exports:['@xi-io/sdk/worker/connection','@xi-io/sdk/worker/lifecycle','@xi-io/sdk/cadence/babysit'],
  no_ports:'SDK_WORKER_PORTS_UNBOUND',
  unqualified_status:status.first_red,
  source_only:true,installed:false,authority_granted:false,provider_effect:false
},null,2));
