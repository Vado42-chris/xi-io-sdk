// Disposable real SDK process and HTTP consumer; provider IO is intercepted.
// A temporary sdk.path checks path identity only, not installation/authority.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'xiio-http-consumer-'));
const home = path.join(fixture, 'home');
const state = path.join(fixture, 'state');
const recorded = path.join(fixture, 'provider-requests.jsonl');
const workspace = path.join(fixture, 'workspace');
let child, exited;
try {
  await fs.mkdir(workspace);
  await fs.mkdir(path.join(home, '.local/share/xi-io/cli'), { recursive: true });
  await fs.writeFile(path.join(home, '.local/share/xi-io/cli/sdk.path'), root + '\n');
  const session = path.join(state, 'xi-io/cli', 'session-' + createHash('sha256').update(workspace).digest('hex').slice(0, 16) + '.json');
  await fs.mkdir(path.dirname(session), { recursive: true });
  const legacy = JSON.stringify({ messages: [{ role: 'user', content: 'FIXTURE_LEGACY_MUST_NOT_LEAK' }] });
  await fs.writeFile(session, legacy);
  const preload = path.join(fixture, 'provider-fixture.mjs');
  await fs.writeFile(preload, `import fs from 'node:fs/promises';
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  if (parsed.origin !== 'http://127.0.0.1:11434') throw Error('EXTERNAL_IO_REFUSED_BY_FIXTURE');
  if (parsed.pathname === '/api/tags') return {ok:true,json:async()=>({models:[{name:'fixture-only'}]})};
  if (parsed.pathname !== '/api/chat' || options.method !== 'POST') throw Error('UNKNOWN_IO_REFUSED_BY_FIXTURE');
  const request = JSON.parse(options.body);
  await fs.appendFile(${JSON.stringify(recorded)}, JSON.stringify(request) + '\\n');
  return {ok:true,json:async()=>({message:{role:'assistant',content:'Fixture reply'}})};
};\n`);
  const probe = http.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, ['--import', preload, path.join(root, 'bin/xi-local-agent.mjs'), '--serve', '--port', String(port)], {
    cwd: workspace,
    env: { ...process.env, HOME: home, XDG_STATE_HOME: state, XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XIIO_OLLAMA_MODEL: 'fixture-only', NODE_OPTIONS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  exited = once(child, 'exit');
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  let timer;
  try {
    await Promise.race([
      new Promise(resolve => child.stdout.on('data', data => { output += data; if (output.includes('local agent door:')) resolve(); })),
      exited.then(([code]) => { throw Error(`SDK exited ${code}: ${errors}`); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('SDK_START_TIMEOUT ' + errors)), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
  function request(method, route, body) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: route, method, agent: false,
        headers: body ? { 'content-type': 'application/json' } : {} }, res => {
        let text = ''; res.on('data', data => { text += data; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      });
      req.setTimeout(4000, () => req.destroy(Error('HTTP_FIXTURE_TIMEOUT')));
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  const status = await request('GET', '/v1/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.conversation_context_supported, true);
  assert.equal(status.body.execution, 'PREVIEW');
  for (const label of ['A', 'B']) {
    const reply = await request('POST', '/v1/turn', { message: `Current ${label}`, conversation_ref: `thread:fixture-${label}`, context: [{role:'user',content:`Prior ${label}`}] });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.reply, 'Fixture reply');
    assert.equal(await fs.readFile(session, 'utf8'), legacy, 'bound conversations do not overwrite legacy cache');
  }
  const calls = (await fs.readFile(recorded, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 2);
  for (const [index, label] of ['A', 'B'].entries()) {
    assert.equal(calls[index].model, 'fixture-only');
    assert.deepEqual(calls[index].messages.map(m => m.role), ['system', 'user', 'user']);
    assert.deepEqual(calls[index].messages.slice(1), [{ role:'user',content:`Prior ${label}` }, { role:'user',content:`Current ${label}` }]);
    assert.ok(!JSON.stringify(calls[index]).includes('FIXTURE_LEGACY_MUST_NOT_LEAK'));
  }
  const malformed = await request('POST', '/v1/turn', {message:'Rejected',conversation_ref:'thread:bad',context:[{role:'system',content:'not allowed'}]});
  assert.equal(malformed.status, 400);
  assert.equal((await fs.readFile(recorded, 'utf8')).trim().split('\n').length, 2);
  const ordinary = await request('POST', '/v1/turn', {message:'Ordinary fixture'});
  assert.equal(ordinary.status, 200);
  assert.ok((await fs.readFile(session, 'utf8')).includes('Ordinary fixture'), 'legacy unscoped persistence is retained');
  console.log('HTTP_CONSUMER_PASS: two actual scoped turns, isolated history, unchanged legacy cache, refused invalid context, ordinary persistence; provider mocked, no installation credit');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
  await fs.rm(fixture, { recursive: true, force: true });
}
