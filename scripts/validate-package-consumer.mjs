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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import catalog from '@xi-io/sdk/catalog' with { type: 'json' };
import { resolveCallable } from '@xi-io/sdk/callables';
import { derivePrimitiveAdoptionPlan } from '@xi-io/sdk/adoption';

const routeRecord = catalog.primitives.find((item) => item.id === 'progressive-route-card');
assert(routeRecord, 'catalog route primitive missing');
const resolved = resolveCallable(catalog, routeRecord.callable_uuid);
assert.equal(resolved.id, 'progressive-route-card');
assert.equal(resolved.specifier, '@xi-io/sdk/patterns/progressive-route');

const moduleFromCatalog = await import(resolved.specifier);
assert.equal(typeof moduleFromCatalog[resolved.export], 'function');
for (const styleSpecifier of resolved.styles) {
  const styleUrl = import.meta.resolve(styleSpecifier);
  assert(existsSync(fileURLToPath(styleUrl)), 'catalog style dependency must resolve from packed package');
}

const plan = derivePrimitiveAdoptionPlan({
  catalog,
  requiredPrimitiveIds: ['panel', 'progressive-route-card'],
  observedPrimitiveIds: ['panel'],
});
assert.equal(plan.state, 'MISSING_REQUIRED');
assert.deepEqual(plan.missing.map((item) => item.id), ['progressive-route-card']);
const missing = plan.missing[0];
const missingModule = await import(missing.specifier);
const html = missingModule[missing.export]({
  root: 'CONSUMER-CANARY-001',
  work: 'Consume SDK package',
  role: 'clean external app',
  generation: 'packed candidate',
  affectedReason: 'Controlled omission must be rediscovered through public catalog data.',
  next: 'Return package-consumer proof.',
  proof: 'package install + UUID resolve + public specifier import + style resolution + omission recovery',
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
  console.log('XIIO_SDK_PACKAGE_CONSUMER PASS source=package catalog_driven_imports=1 withheld_primitive_recovered=1 repo_relative_imports=0');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
