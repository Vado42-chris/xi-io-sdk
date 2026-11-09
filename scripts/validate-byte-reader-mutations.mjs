import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/io/byte-reader.mjs'), 'utf8');
const tests = fs.readFileSync(path.join(root, 'scripts/validate-isolated-byte-reader.mjs'), 'utf8');
const base = process.env.XI_WORKSPACE_TEMP || os.tmpdir();
const stage = fs.mkdtempSync(path.join(base, 'xi-byte-mutations-'));
const mutations = [
  {
    name: 'invert-binary-equality',
    source,
    test: tests.replace(
      'assert.equal(Buffer.compare(actual.bytes, expected), 0);',
      'assert.notEqual(Buffer.compare(actual.bytes, expected), 0);'
    ),
  },
  {
    name: 'remove-nonblocking-fifo-open',
    source: source.replace(' | fs.constants.O_NONBLOCK', ''),
    test: tests,
  },
  {
    name: 'suppress-descriptor-close',
    source: source.replace('io.closeSync(descriptor);', '/* MUTATION: CLOSE SUPPRESSED */'),
    test: tests,
  },
  {
    name: 'fail-cleanup',
    source,
    test: tests.replace(
      'fs.rmSync(root, { recursive: true });',
      "throw Object.assign(new Error('injected cleanup failure'), { code: 'EACCES' });"
    ),
  },
];
const records = [];
let stageClean = false;
try {
  for (const item of mutations) {
    assert.notEqual(item.source + item.test, source + tests, 'mutation must change source or test');
    const dir = fs.mkdtempSync(path.join(stage, 'case-'));
    fs.mkdirSync(path.join(dir, 'src/io'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(dir, 'src/io/byte-reader.mjs'), item.source);
    fs.writeFileSync(path.join(dir, 'scripts/validate-isolated-byte-reader.mjs'), item.test);
    const run = spawnSync(process.execPath, ['scripts/validate-isolated-byte-reader.mjs'], {
      cwd: dir, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      env: { ...process.env, XI_WORKSPACE_TEMP: dir },
    });
    records.push({
      mutation: item.name,
      detected: Number.isInteger(run.status) && run.status !== 0,
      exit_code: run.status,
      timed_out: run.error?.code === 'ETIMEDOUT',
    });
  }
} finally {
  fs.rmSync(stage, { recursive: true });
  stageClean = !fs.existsSync(stage);
}
const pass = stageClean && records.length === mutations.length && records.every(x => x.detected && !x.timed_out);
console.log(JSON.stringify({ schema: 'xiio.sdk.byte-reader-mutations/v1', pass, stage_clean: stageClean, records }));
if (!pass) process.exitCode = 1;
