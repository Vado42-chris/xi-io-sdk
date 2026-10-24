#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { admitLocalRequest, startLocalAgentServer, MAX_TURN_BYTES } from '../src/cli/local-agent-http.mjs';

/* Pure admission: the rules that keep other websites out. */
const port = 3109;
const own = `http://127.0.0.1:${port}`;
const json = { 'content-type': 'application/json' };
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `127.0.0.1:${port}`, ...json } }, { port }).ok, true);
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `127.0.0.1:${port}`, origin: own, ...json } }, { port }).ok, true, 'own origin passes');
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `evil.example:${port}`, ...json } }, { port }).reason, 'HOST_NOT_LOOPBACK', 'DNS rebinding host refused');
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `127.0.0.1:${port}`, origin: 'https://evil.example', ...json } }, { port }).reason, 'FOREIGN_ORIGIN');
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `127.0.0.1:${port}`, 'content-type': 'text/plain' } }, { port }).reason, 'JSON_REQUIRED', 'a no-preflight simple POST is refused');
assert.equal(admitLocalRequest({ method: 'OPTIONS', url: '/v1/turn', headers: { host: `127.0.0.1:${port}` } }, { port }).reason, 'PREFLIGHT_REFUSED');
assert.equal(admitLocalRequest({ method: 'POST', url: '/v1/turn', headers: { host: `127.0.0.1:${port}`, 'content-length': String(MAX_TURN_BYTES + 1), ...json } }, { port }).reason, 'TURN_TOO_LARGE');
assert.equal(admitLocalRequest({ method: 'DELETE', url: '/v1/turn', headers: { host: `127.0.0.1:${port}` } }, { port }).reason, 'METHOD_NOT_ALLOWED');

/* Live door with a fake agent turn: no Ollama is called. */
const ui = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-door-ui-'));
fs.writeFileSync(path.join(ui, 'index.html'), '<!doctype html><title>theme</title>');
const turns = [];
let release;
const server = await startLocalAgentServer({
  port: 0,
  uiDir: ui,
  observeInstalledGeneration: () => ({ ok: true, first_red: null, sdk_root: '/fixture/sdk', agent: '/fixture/sdk/bin/xi-local-agent.mjs' }),
  status: async () => ({ model: 'fixture', execution: 'PREVIEW', ollama_state: 'NOT_CALLED' }),
  handleTurn: async (message) => {
    turns.push(message);
    if (message === 'hold') await new Promise((r) => { release = r; });
    return `echo:${message}`;
  },
});
const live = server.address().port;
assert.equal(server.address().address, '127.0.0.1', 'binds loopback only');

function request({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: live, method, path: url, headers: { host: `127.0.0.1:${live}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data, json: (() => { try { return JSON.parse(data); } catch { return null; } })() }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}
const turn = (message, headers = {}) => request({ method: 'POST', url: '/v1/turn', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ message }) });

try {
  const ok = await turn('hello');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.state, 'ANSWERED');
  assert.equal(ok.json.reply, 'echo:hello');
  assert.equal(ok.headers['access-control-allow-origin'], undefined, 'never sends CORS headers');

  const before = turns.length;
  const foreign = await turn('steal', { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  const rebind = await request({ method: 'POST', url: '/v1/turn', headers: { host: `evil.example:${live}`, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'steal' }) });
  assert.equal(rebind.status, 403);
  const simple = await request({ method: 'POST', url: '/v1/turn', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ message: 'steal' }) });
  assert.equal(simple.status, 415);
  const preflight = await request({ method: 'OPTIONS', url: '/v1/turn', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
  const big = await request({ method: 'POST', url: '/v1/turn', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(MAX_TURN_BYTES) }) });
  assert.equal(big.status, 413);
  const empty = await turn('   ');
  assert.equal(empty.status, 400);
  assert.equal(turns.length, before, 'no refused request reached the agent');

  const holding = turn('hold');
  await new Promise((r) => setTimeout(r, 50));
  const second = await turn('second');
  assert.equal(second.status, 409, 'one turn at a time');
  release();
  assert.equal((await holding).status, 200);

  const status = await request({ url: '/v1/status' });
  assert.equal(status.json.state, 'DEGRADED', 'fixture without local Ollama / not xi-local-agent process must not claim READY');
  assert.equal(status.json.runtime_verified, false);
  assert.equal(status.json.installed_sdk_generation_verified, true, 'verified fixture process is admitted at the runtime-identity boundary');
  assert.equal(status.json.native_receipt_state, 'INSTALLED_GENERATION_OK_MODEL_NOT_READY');
  assert.equal(status.json.first_red, 'OLLAMA_MODEL_NOT_READY');
  assert.equal(status.json.service_listener_observed, true);
  assert.equal(typeof status.json.service_process_pid, 'number');
  const page = await request({ url: '/' });
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>theme<\/title>/);
  const traversal = await request({ url: '/../../etc/passwd' });
  assert.notEqual(traversal.status, 200, 'UI cannot leave its folder');
  const encoded = await request({ url: '/%2e%2e/%2e%2e/etc/passwd' });
  assert.notEqual(encoded.status, 200, 'encoded traversal cannot leave its folder');
} finally {
  server.close();
  fs.rmSync(ui, { recursive: true, force: true });
}

/* Installed-generation boundary: status/UI stay diagnostic, but a stale or
   uninstalled process cannot send a turn into the agent at all. */
let unverifiedTurns = 0;
const unverifiedUi = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-door-unverified-ui-'));
fs.writeFileSync(path.join(unverifiedUi, 'index.html'), '<!doctype html><title>recovery</title>');
const unverified = await startLocalAgentServer({
  port: 0,
  uiDir: unverifiedUi,
  observeInstalledGeneration: () => ({ ok: false, first_red: 'PROCESS_NOT_FROM_INSTALLED_SDK' }),
  status: async () => ({ model: 'fixture', execution: 'BOUNDED', ollama_state: 'READY_MODEL_PRESENT' }),
  handleTurn: async (message) => { unverifiedTurns += 1; return `echo:${message}`; },
});
const unverifiedPort = unverified.address().port;
const unverifiedRequest = ({ method = 'GET', url = '/', body = null, headers = {} }) => new Promise((resolve, reject) => {
  const req = http.request({
    host: '127.0.0.1',
    port: unverifiedPort,
    method,
    path: url,
    headers: { host: `127.0.0.1:${unverifiedPort}`, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, text: data, json: (() => { try { return JSON.parse(data); } catch { return null; } })() }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});
try {
  const status = await unverifiedRequest({ url: '/v1/status' });
  assert.equal(status.status, 200, 'status remains available for diagnosis');
  assert.equal(status.json.state, 'DEGRADED');
  assert.equal(status.json.installed_sdk_generation_verified, false);
  assert.equal(status.json.first_red, 'PROCESS_NOT_FROM_INSTALLED_SDK');

  const page = await unverifiedRequest({ url: '/' });
  assert.equal(page.status, 200, 'static UI remains available for recovery');

  const blocked = await unverifiedRequest({ method: 'POST', url: '/v1/turn', body: JSON.stringify({ message: 'read workspace' }) });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.json.state, 'BLOCKED');
  assert.equal(blocked.json.reason, 'INSTALLED_GENERATION_REQUIRED');
  assert.equal(blocked.json.first_red, 'PROCESS_NOT_FROM_INSTALLED_SDK');
  assert.equal(blocked.json.provider_effect, false);
  assert.equal(blocked.json.authority_granted, false);
  assert.equal(unverifiedTurns, 0, 'unverified runtime never reaches handleTurn');
} finally {
  unverified.close();
  fs.rmSync(unverifiedUi, { recursive: true, force: true });
}

let observerFailureTurns = 0;
const observerFailure = await startLocalAgentServer({
  port: 0,
  observeInstalledGeneration: () => { throw new Error('fixture observer fault'); },
  status: async () => ({ model: 'fixture', execution: 'BOUNDED', ollama_state: 'READY_MODEL_PRESENT' }),
  handleTurn: async () => { observerFailureTurns += 1; return 'unexpected'; },
});
const observerFailurePort = observerFailure.address().port;
try {
  const denied = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ message: 'hello' });
    const req = http.request({
      host: '127.0.0.1',
      port: observerFailurePort,
      method: 'POST',
      path: '/v1/turn',
      headers: { host: `127.0.0.1:${observerFailurePort}`, 'content-type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  assert.equal(denied.status, 503, 'observer failure fails closed');
  assert.equal(denied.json.first_red, 'INSTALLED_GENERATION_OBSERVER_FAILED');
  assert.equal(observerFailureTurns, 0);
} finally {
  observerFailure.close();
}

/* Bounded time: a stuck turn is answered 504 and aborted, and the door stays
   busy until that turn has really stopped, so two turns never run at once. */
let sawAbort = false;
let settle;
const slow = await startLocalAgentServer({
  port: 0,
  turnTimeoutMs: 100,
  status: async () => ({ model: 'fixture' }),
  handleTurn: async (message, { signal } = {}) => {
    if (message !== 'stuck') return `echo:${message}`;
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    sawAbort = signal.aborted;
    await new Promise((resolve) => { settle = resolve; });
    return 'too late';
  },
});
const slowPort = slow.address().port;
const slowRequest = ({ method = 'GET', url = '/', body = null }) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: slowPort, method, path: url, headers: { host: `127.0.0.1:${slowPort}`, ...(body ? { 'content-type': 'application/json' } : {}) } }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(data); } catch { return null; } })() }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});
const slowTurn = (message) => slowRequest({ method: 'POST', url: '/v1/turn', body: JSON.stringify({ message }) });
try {
  const started = Date.now();
  const stuck = await slowTurn('stuck');
  assert.equal(stuck.status, 504, 'a stuck turn is answered, not left hanging');
  assert.equal(stuck.json.reason, 'TURN_TIMEOUT');
  assert.ok(Date.now() - started < 2000, 'answered near the timeout, not after the turn');
  assert.equal(sawAbort, true, 'the stuck turn was told to stop');
  assert.equal((await slowRequest({ url: '/v1/status' })).json.busy, true, 'still busy while the stuck turn is winding down');
  assert.equal((await slowTurn('second')).status, 409, 'no second turn beside a timed-out one');
  settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await slowRequest({ url: '/v1/status' })).json.busy, false, 'free once the stuck turn has stopped');
  const after = await slowTurn('after');
  assert.equal(after.status, 200);
  assert.equal(after.json.reply, 'echo:after');
} finally {
  slow.close();
}

console.log(JSON.stringify({
  schema: 'xiio.sdk.local-agent-http-check/v1',
  result: 'PASS',
  admission_cases: 8,
  live_cases: 13,
  timeout_cases: 7,
  installed_generation_cases: 9,
  hard: ['LOOPBACK_ONLY', 'HOST != FOREIGN', 'ORIGIN != FOREIGN', 'JSON_ONLY_TURNS', 'NO_CORS_HEADERS', 'ONE_TURN_AT_A_TIME', 'UI_CONTAINED', 'TURN_TIME_BOUNDED', 'TIMEOUT != SECOND_TURN', 'LOOPBACK != INSTALLED_GENERATION', 'UNVERIFIED_RUNTIME != AGENT_TURN'],
}, null, 2));
