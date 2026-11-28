import test from 'node:test';
import assert from 'node:assert/strict';

// Public contract: DataForge and other consumers import these through the package name, not by copying files.
// Falsifier: removing either exports entry from package.json makes the matching import below throw ERR_PACKAGE_PATH_NOT_EXPORTED.

test('identity/account-binding is a public export with its contract names', async () => {
  const m = await import('@xi-io/sdk/identity/account-binding');
  for (const name of ['ACCOUNT_BINDING_SCHEMA', 'assertCredentialFreeRecord', 'observeAccount', 'chooseAccount', 'bindOwner']) {
    assert.notEqual(m[name], undefined, `missing export ${name}`);
  }
});

test('worker/execution-route is a public export with its contract names', async () => {
  const m = await import('@xi-io/sdk/worker/execution-route');
  for (const name of [
    'WORKER_EXECUTION_ROUTE_SCHEMA', 'WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA', 'WORKER_EXECUTION_ROUTE_READBACK_SCHEMA',
    'MAX_WORKER_EXECUTION_ROUTE_AGE_MS', 'compileWorkerExecutionRouteObservation', 'createWorkerExecutionRouteQualifier',
    'inspectQualifiedWorkerExecutionRoute', 'qualifyWorkerExecutionRoute',
  ]) {
    assert.notEqual(m[name], undefined, `missing export ${name}`);
  }
});
