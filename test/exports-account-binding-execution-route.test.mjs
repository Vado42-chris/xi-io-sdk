import test from 'node:test';
import assert from 'node:assert/strict';

// Public contract: DataForge and other consumers import these through the package name, not by copying files.
// Falsifier: removing either exports entry from package.json makes the matching import below throw ERR_PACKAGE_PATH_NOT_EXPORTED.
// Each name is checked for its kind (schema string, numeric bound, or function), not just for presence.

test('identity/account-binding is a public export with its contract names', async () => {
  const m = await import('@xi-io/sdk/identity/account-binding');
  assert.equal(typeof m.ACCOUNT_BINDING_SCHEMA, 'string', 'ACCOUNT_BINDING_SCHEMA must be a string');
  for (const name of ['assertCredentialFreeRecord', 'observeAccount', 'chooseAccount', 'bindOwner']) {
    assert.equal(typeof m[name], 'function', `${name} must be a function`);
  }
});

test('worker/execution-route is a public export with its contract names', async () => {
  const m = await import('@xi-io/sdk/worker/execution-route');
  for (const name of [
    'WORKER_EXECUTION_ROUTE_SCHEMA', 'WORKER_EXECUTION_ROUTE_OBSERVATION_SCHEMA', 'WORKER_EXECUTION_ROUTE_READBACK_SCHEMA',
  ]) {
    assert.equal(typeof m[name], 'string', `${name} must be a string`);
  }
  assert.equal(typeof m.MAX_WORKER_EXECUTION_ROUTE_AGE_MS, 'number', 'MAX_WORKER_EXECUTION_ROUTE_AGE_MS must be a number');
  for (const name of [
    'compileWorkerExecutionRouteObservation', 'createWorkerExecutionRouteQualifier',
    'inspectQualifiedWorkerExecutionRoute', 'qualifyWorkerExecutionRoute',
  ]) {
    assert.equal(typeof m[name], 'function', `${name} must be a function`);
  }
});
