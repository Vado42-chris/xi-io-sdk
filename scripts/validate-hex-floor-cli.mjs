#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = {
  schema: 'xiio.hex.floor/v1',
  state: 'PASS_WITH_REDS',
  engine: 'HEX_FLOOR',
  engine_generation: 'HEX-RC-TEST',
  floor_generation: 'floor-test',
  denominator_hash: 'abc123',
  denominator_count: 2,
  cells: [{ id: 'A', state: 'PASS' }, { id: 'B', state: 'FAIL' }],
  missing_punchcards: ['B'],
  missing_scorecards: [],
  first_red: 'B',
  effect_authority: 0,
};

const server = http.createServer((req, res) => {
  if (req.url !== '/floor') { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(fixture));
});

await new Promise((resolve, reject) => server.listen(8798, '127.0.0.1', (error) => error ? reject(error) : resolve()));
try {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin/xi.mjs', 'hex', 'floor'], { cwd: root, env: { ...process.env, XIIO_INVOKED_AS: 'xi-io' } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.schema, 'xiio.hex.floor/v1');
  assert.equal(body.denominator_hash, 'abc123');
  assert.equal(body.first_red, 'B');
  assert.equal(body.transport, 'CLI_TO_HEX_8798');
  assert.equal(body.effect_authority, 0);
  console.log(JSON.stringify({ schema: 'xiio.sdk.hex-floor-cli-test/v1', state: 'PASS', assertions: 6 }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
