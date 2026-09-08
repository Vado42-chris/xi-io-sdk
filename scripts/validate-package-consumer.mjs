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
import { compileContinuationCycle } from '@xi-io/sdk/cadence';

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

const continuation = compileContinuationCycle({
  root_ref: 'root:package-canary', worker_ref: 'worker:package-canary',
  subject_generation: 'g1', current_generation: 'g1', phase_event: 'POST_RESULT', pass_state: 'PASS',
  four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }],
  returns: [], residue: [], occurrences: [],
  worker_inbox: { ref: 'inbox:worker/package-canary', current: true, actionable_count: 0 },
});
assert.equal(continuation.disposition, 'CONTINUE_WORK');
assert.equal(continuation.terminal, false);
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
  const cli = path.join(consumer, 'node_modules', '.bin', 'xi-io');
  const discovery = JSON.parse(execFileSync(cli, ['sdk', 'commands'], { cwd: consumer, encoding: 'utf8' }));
  assert.equal(discovery.commands.length, 10);
  assert(discovery.commands.some((entry) => entry.command === 'compileContinuationCycle'));
  const cliResult = JSON.parse(execFileSync(cli, ['sdk', 'call', 'normalizeProviderFailure'], {
    cwd: consumer,
    encoding: 'utf8',
    input: JSON.stringify({ args: [{ provider: 'External consumer', http_status: 429 }] }),
  }));
  assert.equal(cliResult.result.operation_state, 'WAIT_PROVIDER_CAPACITY');
  assert.equal(cliResult.authority_granted, false);
  console.log('XIIO_SDK_PACKAGE_CONSUMER PASS source=package catalog_driven_imports=1 withheld_primitive_recovered=1 cadence_continuation=1 installed_cli_executed=1 repo_relative_imports=0');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
