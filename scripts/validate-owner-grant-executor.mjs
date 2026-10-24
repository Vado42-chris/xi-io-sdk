#!/usr/bin/env node
// Owner grant + isolated executor, end to end through the real local-agent entry.
// Synthetic loopback model only; every effect happens in disposable temp dirs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { composeGrant, saveGrant, revokeGrant, defaultGrantDir } from '../src/worker/owner-grant.mjs';
import { runIsolated, executorAvailable } from '../src/worker/isolated-executor.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const agent = path.join(repo, 'bin/xi-local-agent.mjs');
const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const tmp = (p) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const observed = { provider: 'github', observed_via: 'provider_api_readback', subject_id: 4242, login: 'owner', observed_at: new Date().toISOString() };
const cells = [];
const t = async (name, fn) => { await fn(); cells.push(name); };
if (!executorAvailable()) { console.log(JSON.stringify({ check:'OWNER_GRANT_ISOLATED_EXECUTOR', status:'FAIL', first_red:'EXECUTOR_UNAVAILABLE_ON_THIS_HOST_INSTALL_BUBBLEWRAP' })); process.exit(1); }

function grantFor(grantDir, project, { operations = ['edit', 'test'], hours = 1, generation = head } = {}) {
  const g = composeGrant({ observed, chosen: 'owner', project, operations, hours, now: new Date().toISOString(), source_generation: generation });
  saveGrant(grantDir, g); return g;
}

/* Run the real agent once. `plan` is the sequence of tool calls the fake model makes;
   an item {revokeBefore:true} has the OWNER revoke all grants before that call. */
function runAgent({ ws, grantDir, plan, extraEnv = {} }) {
  const home = tmp('xiio-home-'); const stateHome = tmp('xiio-xdg-');
  const preload = path.join(home, 'fake-ollama.mjs');
  fs.writeFileSync(preload, `
import fs from 'node:fs'; import path from 'node:path';
const plan=${JSON.stringify(plan)}; const grantDir=${JSON.stringify(grantDir)};
globalThis.fetch=async(url,{body}={})=>{
  const u=new URL(String(url)); if(u.hostname!=='127.0.0.1'||u.port!=='11434') throw Error('ALL_EXTERNAL_NETWORK_DENIED_BY_TEST');
  const req=JSON.parse(body||'{}'); const done=req.messages.filter(m=>m?.role==='tool');
  const step=plan[done.length];
  if(!step) return {ok:true,json:async()=>({message:{role:'assistant',content:JSON.stringify(done.map(m=>m.content))}})};
  if(step.revokeBefore){ for(const f of fs.readdirSync(grantDir).filter(f=>f.endsWith('.json'))){ fs.mkdirSync(path.join(grantDir,'revoked'),{recursive:true}); fs.writeFileSync(path.join(grantDir,'revoked',f.slice(0,-5)),'owner\\n'); } }
  return {ok:true,json:async()=>({message:{role:'assistant',tool_calls:[{function:{name:step.name,arguments:step.args}}]}})};
};`);
  const run = spawnSync(process.execPath, [agent, '--execute', '--once'], {
    cwd: ws, input: 'do the task', encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: home, XDG_STATE_HOME: stateHome, XIIO_GRANT_DIR: grantDir, XIIO_OOR_STATE_PATH: path.join(stateHome, 'no-oor.json'), XIIO_OLLAMA_MODEL: 'test', NODE_OPTIONS: `--import=${preload}`, ...extraEnv },
  });
  const outp = JSON.parse(run.stdout);
  let results = []; try { results = JSON.parse(outp.result || '[]').map((c) => { try { return JSON.parse(c); } catch { return c; } }); } catch {}
  return { out: outp, results };
}
const edit = (p, text) => ({ name: 'edit_workspace_text_file', args: { path: p, operation: 'create', new_text: text } });
const testRun = (file) => ({ name: 'run_workspace_command', args: { command: 'node', args: [file] } });
const project = () => { const ws = tmp('xiio-proj-'); fs.writeFileSync(path.join(ws, 'check.mjs'), "import fs from 'node:fs'; const v=fs.readFileSync('value.txt','utf8').trim(); if(v!=='42'){console.error('FAIL',v);process.exit(1)} console.log('TEST_PASS value='+v);\n"); return ws; };

await t('authorized: edit a project file, run its test in the isolated executor, read the result back', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws);
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n'), testRun('check.mjs')] });
  assert.equal(results[0].ok, true);
  assert.equal(fs.readFileSync(path.join(ws, 'value.txt'), 'utf8'), '42\n');
  assert.equal(results[1].isolated, true); assert.equal(results[1].ok, true); assert.match(results[1].output, /TEST_PASS value=42/);
  assert.match(fs.readFileSync(path.join(gd, 'audit.jsonl'), 'utf8'), /EFFECT_ADMITTED/);
});
await t('no grant: edit refused, nothing written', () => {
  const ws = project(); const gd = tmp('xiio-grants-');
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].reason, 'OWNER_GRANT_REQUIRED'); assert.equal(fs.existsSync(path.join(ws, 'value.txt')), false);
});
await t('expired grant refused', async () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws, { hours: 0.0003 });
  await new Promise((r) => setTimeout(r, 1500));
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].reason, 'OWNER_GRANT_REQUIRED'); assert.equal(fs.existsSync(path.join(ws, 'value.txt')), false);
});
await t('revoked grant refused', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); const g = grantFor(gd, ws); revokeGrant(gd, g.grant_id);
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].first_red, 'OWNER_GRANT_REVOKED'); assert.equal(fs.existsSync(path.join(ws, 'value.txt')), false);
});
await t('grant for another project refused', () => {
  const ws = project(); const other = project(); const gd = tmp('xiio-grants-'); grantFor(gd, other);
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].reason, 'OWNER_GRANT_REQUIRED'); assert.equal(fs.existsSync(path.join(ws, 'value.txt')), false);
});
await t('operation not granted (edit-only grant) refuses tests', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws, { operations: ['edit'] });
  const { results } = runAgent({ ws, grantDir: gd, plan: [testRun('check.mjs')] });
  assert.equal(results[0].first_red, 'O8_OPERATION_NOT_GRANTED:test');
});
await t('generation drift: a grant for another SDK generation refused', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws, { generation: 'sdk:other' });
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].first_red, 'O0_SOURCE_GENERATION_DRIFT');
});
await t('post-cancellation: owner revokes mid-session, the next effect is refused', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws);
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('a.txt', 'one\n'), { ...edit('b.txt', 'two\n'), revokeBefore: true }] });
  assert.equal(results[0].ok, true); assert.equal(results[1].first_red, 'OWNER_GRANT_REVOKED');
  assert.equal(fs.existsSync(path.join(ws, 'a.txt')), true); assert.equal(fs.existsSync(path.join(ws, 'b.txt')), false);
});
await t('self-authorization: the model cannot run `xi grant` or admission writers through its CLI tool', () => {
  const ws = project(); const gd = tmp('xiio-grants-');
  const { results } = runAgent({ ws, grantDir: gd, plan: [
    { name: 'run_xiio_cli_command', args: { args: ['grant', 'create', '--project', ws] } },
    { name: 'run_xiio_cli_command', args: { args: ['ack', '--input', 'x', 'order', 'advance'] } },
  ] });
  for (const r of results) assert.match(JSON.stringify(r), /DENIED|OWNER_ONLY|FAMILY/);
  assert.deepEqual(fs.readdirSync(gd).filter((f) => f.endsWith('.json')), []);
});
await t('self-authorization: code run in the executor cannot see or write the grant store', async () => {
  const ws = project(); const gd = tmp('xiio-grants-'); const g = grantFor(gd, ws);
  fs.writeFileSync(path.join(ws, 'forge.mjs'), `import fs from 'node:fs'; const d=${JSON.stringify(gd)}; let seen='NONE'; try{seen=JSON.stringify(fs.readdirSync(d))}catch(e){seen='ERR_'+e.code} console.log('SEES='+seen); try{fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+'/forged.json','{}');console.log('WROTE_IN_SANDBOX_SCRATCH')}catch(e){console.log('WRITE_ERR_'+e.code)}\n`);
  const r = await runIsolated({ workspace: ws, command: 'node', args: ['forge.mjs'], hide: [gd, defaultGrantDir()] });
  assert.doesNotMatch(r.output, new RegExp(g.grant_id), 'grant id never visible inside');
  assert.equal(fs.existsSync(path.join(gd, 'forged.json')), false, 'host grant store untouched');
});
await t('confidentiality: a host file outside the project (non-hidden mount) is unreadable inside', async () => {
  const sentinelDir = fs.mkdtempSync('/var/tmp/xiio-sentinel-'); const sentinel = path.join(sentinelDir, 'secret.txt');
  fs.writeFileSync(sentinel, 'SENTINEL_BYTES_DO_NOT_LEAK');
  const ws = project();
  fs.writeFileSync(path.join(ws, 'peek.mjs'), `import fs from 'node:fs'; try{console.log('READ='+fs.readFileSync(${JSON.stringify(sentinel)},'utf8'))}catch(e){console.log('READ_ERR_'+e.code)}\n`);
  const r = await runIsolated({ workspace: ws, command: 'node', args: ['peek.mjs'] });
  fs.rmSync(sentinelDir, { recursive: true, force: true });
  assert.doesNotMatch(r.output, /SENTINEL_BYTES_DO_NOT_LEAK/); assert.match(r.output, /READ_ERR_ENOENT/);
});
await t('a test-only grant cannot mutate the project (tests run read-only)', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws, { operations: ['test'] });
  fs.writeFileSync(path.join(ws, 'value.txt'), '42\n');
  fs.writeFileSync(path.join(ws, 'mutate.mjs'), "import fs from 'node:fs'; try{fs.writeFileSync('value.txt','HACKED');fs.unlinkSync('check.mjs');console.log('MUTATED')}catch(e){console.log('MUTATE_ERR_'+e.code)}\n");
  const { results } = runAgent({ ws, grantDir: gd, plan: [testRun('mutate.mjs'), testRun('check.mjs')] });
  assert.match(results[0].output, /MUTATE_ERR_EROFS/);
  assert.equal(fs.readFileSync(path.join(ws, 'value.txt'), 'utf8'), '42\n'); assert.equal(fs.existsSync(path.join(ws, 'check.mjs')), true);
  assert.match(results[1].output, /TEST_PASS value=42/, 'positive control: a read-only test still runs and passes');
});
await t('audit is part of admission: unwritable audit refuses the effect', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws);
  fs.rmSync(path.join(gd, 'audit.jsonl')); fs.mkdirSync(path.join(gd, 'audit.jsonl'));
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('value.txt', '42\n')] });
  assert.equal(results[0].reason, 'OWNER_GRANT_AUDIT_UNAVAILABLE'); assert.equal(fs.existsSync(path.join(ws, 'value.txt')), false);
});
await t('path escape: ../ and a symlink out of the project are refused', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws); const outside = tmp('xiio-outside-');
  fs.symlinkSync(outside, path.join(ws, 'link'));
  const { results } = runAgent({ ws, grantDir: gd, plan: [edit('../escape.txt', 'x'), edit('link/escape.txt', 'x')] });
  assert.match(JSON.stringify(results[0]), /PATH_DENIED/);
  assert.equal(fs.existsSync(path.join(outside, 'escape.txt')), false, 'symlink escape blocked');
});
await t('persistence: from a home-dir session the model cannot rewrite launchers, sdk.path, shell rc or systemd units', () => {
  const home = tmp('xiio-home-persist-');
  for (const d of ['.local/share/xi-io/cli', '.local/bin', '.config/systemd/user']) fs.mkdirSync(path.join(home, d), { recursive: true });
  const code = `const m=await import(${JSON.stringify('file://'+agent)});const r=p=>{try{m.resolveWorkspacePath(p);return 'WRITABLE'}catch(e){return e.message}};process.stdout.write(JSON.stringify(['.local/share/xi-io/cli/sdk.path','.local/bin/xi-io','.bashrc','.config/systemd/user/x.service','notes.txt'].map(r)))`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: home, encoding: 'utf8', env: { ...process.env, HOME: home } });
  const res = JSON.parse(run.stdout);
  assert.deepEqual(res.slice(0, 4), Array(4).fill('PATH_DENIED_HOME_PERSISTENCE')); assert.equal(res[4], 'WRITABLE', 'positive control: an ordinary file still works');
  const devCheckout = path.join(home, '.local/share/xi-io/repos/proj'); fs.mkdirSync(devCheckout, { recursive: true });
  const run2 = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify('file://'+agent)});try{m.resolveWorkspacePath('src/a.mjs');process.stdout.write('OK')}catch(e){process.stdout.write(e.message)}`], { cwd: devCheckout, encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run2.stdout, 'OK', 'positive control: a project inside ~/.local stays editable');
});
await t('executor unavailable: tests refused, never run on the host', () => {
  const ws = project(); const gd = tmp('xiio-grants-'); grantFor(gd, ws);
  const { results } = runAgent({ ws, grantDir: gd, plan: [testRun('check.mjs')], extraEnv: { XIIO_BWRAP_BIN: '/nonexistent/bwrap' } });
  assert.equal(results[0].reason, 'EXECUTOR_ISOLATION_UNAVAILABLE');
});
await t('no network inside the executor', async () => {
  const ws = project();
  fs.writeFileSync(path.join(ws, 'net.mjs'), "import net from 'node:net'; const s=net.connect(443,'1.1.1.1'); s.on('connect',()=>{console.log('NET_OPEN');process.exit(0)}); s.on('error',e=>{console.log('NET_BLOCKED '+e.code);process.exit(0)}); setTimeout(()=>{console.log('NET_BLOCKED timeout');process.exit(0)},3000);\n");
  const r = await runIsolated({ workspace: ws, command: 'node', args: ['net.mjs'] });
  assert.match(r.output, /NET_BLOCKED/);
});
await t('elevated effects stay outside any grant (recover --execute needs full lifecycle admission)', async () => {
  const { checkGrant } = await import('../src/worker/owner-grant.mjs');
  const ws = project(); const gd = tmp('xiio-grants-'); const g = grantFor(gd, ws);
  for (const op of ['publish', 'credentials', 'service_admin', 'network', 'recover']) {
    assert.equal(checkGrant(g, { operation: op, workspace: ws, now: new Date().toISOString(), source_generation: head }).first_red, 'OPERATION_ELEVATED_OUTSIDE_GRANT');
  }
  assert.throws(() => composeGrant({ observed, chosen: 'owner', project: ws, operations: ['publish'], hours: 1, now: new Date().toISOString(), source_generation: head }), /NOT_GRANTABLE/);
  assert.throws(() => composeGrant({ observed, chosen: 'owner', project: os.homedir(), operations: ['edit'], hours: 1, now: new Date().toISOString(), source_generation: head }), /TOO_BROAD/);
});
await t('a yes never marks lifecycle steps complete', async () => {
  const { checkGrant } = await import('../src/worker/owner-grant.mjs');
  const ws = project(); const gd = tmp('xiio-grants-'); const g = grantFor(gd, ws);
  const d = checkGrant(g, { operation: 'edit', workspace: ws, now: new Date().toISOString(), source_generation: head });
  assert.deepEqual(Object.keys(d.lifecycle.executed), ['O0', 'O1', 'O8']); assert.deepEqual([...d.lifecycle.not_complete], ['O2', 'O11']);
  assert.equal(fs.existsSync(path.join(gd, '..', 'no-oor.json')), false);
});
console.log(JSON.stringify({ check: 'OWNER_GRANT_ISOLATED_EXECUTOR', status: 'PASS', source_generation: head, cases: cells.length, provider_effects: 0 }));
