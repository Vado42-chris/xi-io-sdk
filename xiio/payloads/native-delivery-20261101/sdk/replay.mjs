import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
for (const [rel, row] of Object.entries(source.base_sources)) {
  const bytes = fs.readFileSync(path.join(root, 'base', rel));
  assert.equal(digest(bytes), row.sha256, rel + ' SHA256');
  assert.equal(gitBlob(bytes), row.blob, rel + ' pinned Git blob');
}
for (const [rel, row] of Object.entries(source.patches)) {
  const bytes = fs.readFileSync(path.join(root, 'patches', rel));
  assert.equal(digest(bytes), row.sha256, rel + ' SHA256');
  assert.equal(gitBlob(bytes), row.git_blob, rel + ' Git blob');
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
for (const [rel, row] of Object.entries(manifest.files)) {
  const bytes = fs.readFileSync(path.join(root, rel));
  assert.equal(bytes.length, row.bytes, rel + ' size');
  assert.equal(digest(bytes), row.sha256, rel + ' manifest SHA256');
  assert.equal(gitBlob(bytes), row.git_blob, rel + ' manifest Git blob');
}

// Every source import happens in a child with this private fixture environment.
const fixture = fs.mkdtempSync(path.join(root, '.replay-'));
const home = path.join(fixture, 'home');
const tmp = path.join(fixture, 'tmp');
fs.mkdirSync(home); fs.mkdirSync(tmp);
const emptyConfig = path.join(fixture, 'empty-git-config');
fs.writeFileSync(emptyConfig, '');
const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
  XDG_STATE_HOME: path.join(home, '.local/state'), XDG_CONFIG_HOME: path.join(home, '.config'),
  XDG_CACHE_HOME: path.join(home, '.cache'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig };
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG', 'GIT_CONFIG_COUNT']) delete env[key];
function run(cmd, args, cwd, expected = 0) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, expected, [cmd, ...args].join(' ') + '\n' + result.stdout + '\n' + result.stderr);
  return result;
}
function copyBase(name) {
  const dir = path.join(fixture, name);
  fs.cpSync(path.join(root, 'base'), dir, { recursive: true });
  fs.mkdirSync(path.join(dir, '.qualification'));
  fs.copyFileSync(path.join(root, 'qualification/common-exports.mjs'), path.join(dir, '.qualification/common-exports.mjs'));
  return dir;
}
let receipt;
try {
  const base = copyBase('baseline');
  const baseline = run(process.execPath, ['.qualification/common-exports.mjs'], base, 1);
  assert.match(baseline.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  assert.match(baseline.stderr, /worker\/connection/);
  const candidate = copyBase('candidate');
  const patch = path.join(root, 'patches/sdk205-current-main-join.patch');
  run('git', ['apply', '--check', patch], candidate);
  run('git', ['apply', patch], candidate);
  for (const [rel, row] of Object.entries(source.candidate_expected)) {
    const bytes = fs.readFileSync(path.join(candidate, rel));
    assert.equal(digest(bytes), row.sha256, rel + ' candidate SHA256');
    assert.equal(gitBlob(bytes), row.git_blob, rel + ' candidate Git blob');
  }
  for (const [rel, row] of Object.entries(source.base_sources)) {
    if (rel !== 'package.json') assert.equal(gitBlob(fs.readFileSync(path.join(candidate, rel))), row.blob, rel + ' accepted source unchanged');
  }
  for (const [rel, row] of Object.entries(source.donor_sources)) {
    assert.equal(gitBlob(fs.readFileSync(path.join(candidate, rel))), row.blob, rel + ' exact donor source');
  }
  const originalPackage = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  const additivePackage = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
  assert.equal(additivePackage.exports['./worker/connection'], './src/worker/connection.mjs');
  assert.equal(additivePackage.scripts['check:worker-connection'], 'node --test scripts/test-worker-connection.mjs');
  assert.equal(additivePackage.scripts.check, originalPackage.scripts.check + ' && npm run check:worker-connection');
  delete additivePackage.exports['./worker/connection'];
  delete additivePackage.scripts['check:worker-connection'];
  additivePackage.scripts.check = originalPackage.scripts.check;
  assert.deepEqual(additivePackage, originalPackage, 'all existing package fields/check gates preserved');
  const publicExports = JSON.parse(run(process.execPath, ['.qualification/common-exports.mjs'], candidate).stdout);
  const connection = run(process.execPath, ['--test', '--test-reporter=tap', 'scripts/test-worker-connection.mjs'], candidate).stdout;
  assert.match(connection, /# tests 54\b/); assert.match(connection, /# pass 54\b/); assert.match(connection, /# fail 0\b/);
  const lifecycle = JSON.parse(run(process.execPath, ['scripts/validate-worker-lifecycle-kit.mjs'], candidate).stdout);
  const tailJson = text => JSON.parse(text.trim().split('\n').at(-1));
  const babysit = tailJson(run(process.execPath, ['scripts/validate-babysit-host.mjs'], candidate).stdout);
  const selfDrive = tailJson(run(process.execPath, ['scripts/validate-self-drive-continuation.mjs'], candidate).stdout);
  assert.equal(lifecycle.state, 'PASS');
  assert.equal(babysit.status, 'PASS'); assert.equal(babysit.cases, 13);
  assert.equal(selfDrive.status, 'PASS'); assert.equal(selfDrive.cases, 15);
  receipt = {
    schema: 'xiio.portable-sdk-source-replay/v1', state: 'PASS', repository: source.repository,
    base_ref: source.base_ref, donor_ref: source.donor_ref, node_version: process.version,
    exact_source_and_patch_hashes_verified: true, clean_patch_apply: true,
    accepted_package_fields_and_gates_preserved: true,
    fail_first: 'Accepted main ERR_PACKAGE_PATH_NOT_EXPORTED: worker/connection',
    connection_owner_tests: { tests: 54, pass: 54, fail: 0 },
    accepted_lifecycle: lifecycle, accepted_babysit: babysit, accepted_self_drive: selfDrive,
    public_export_join: publicExports,
    source_only: true, full_upstream_tree: false, accepted_generation: false, installed: false,
    authority_granted: false, provider_effect: false,
    remaining: ['Existing SDK owner adoption and accepted source-generation pin',
      'Full SDK checks/archive qualification and full CLI/Ibal/Zed affected consumer qualification',
      'Installed Ward/session/BINS/Switchboard ports and independent real worker readback']
  };
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
receipt.fixture_removed = !fs.existsSync(fixture);
console.log(JSON.stringify(receipt, null, 2));
