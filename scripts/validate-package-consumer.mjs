#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'xiio-sdk-consumer-'));
const consumer = path.join(tmp, 'consumer');
mkdirSync(consumer, { recursive: true });

try {
  const packed = execFileSync('npm', ['pack', '--silent', '--pack-destination', tmp], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split(/\r?\n/).filter(Boolean).at(-1);
  assert(packed, 'npm pack did not return a tarball');

  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'xiio-sdk-clean-consumer-canary',
    private: true,
    type: 'module',
    dependencies: {
      '@xi-io/sdk': `file:../${packed}`,
    },
  }, null, 2));

  writeFileSync(path.join(consumer, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { renderProgressiveDisclosure } from '@xi-io/sdk/progressive-disclosure';
import { renderProgressiveRouteCard } from '@xi-io/sdk/patterns/progressive-route';

const disclosure = renderProgressiveDisclosure({ summary: 'More', bodyHtml: '<p>detail</p>' });
assert(disclosure.includes('data-xiui="progressive-disclosure"'));

const html = renderProgressiveRouteCard({
  root: 'CONSUMER-CANARY-001',
  work: 'Consume SDK package',
  role: 'clean external app',
  generation: 'packed candidate',
  affectedReason: 'Prove public exports work without repository-relative imports.',
  next: 'Return package-consumer proof.',
  proof: 'package install + public import + render',
  returnTo: 'SDK PR qualification',
  wake: 'SDK candidate generation changes',
  status: { label: 'CANDIDATE', tone: 'warning' },
});
assert(html.includes('Consume SDK package'));
assert(html.includes('data-xiui="progressive-disclosure"'));
assert(html.includes('data-xiui="next-action-strip"'));
console.log('XIIO_SDK_CLEAN_CONSUMER PASS');
`);

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = execFileSync(process.execPath, ['consumer.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(output, /XIIO_SDK_CLEAN_CONSUMER PASS/);
  console.log('XIIO_SDK_PACKAGE_CONSUMER PASS source=package public_imports=2 repo_relative_imports=0');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
