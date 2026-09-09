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
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim().split(/\r?\n/).filter(Boolean).at(-1);
  assert(packed, 'npm pack did not return a tarball');

  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'xiio-sdk-clean-consumer-canary', private: true, type: 'module',
    dependencies: { '@xi-io/sdk': `file:../${packed}` },
  }, null, 2));

  writeFileSync(path.join(consumer, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import catalog from '@xi-io/sdk/catalog' with { type: 'json' };
import { resolveCallable } from '@xi-io/sdk/callables';
import { derivePrimitiveAdoptionPlan } from '@xi-io/sdk/adoption';
import { compileImpactFormation } from '@xi-io/sdk/ibal/impact-formation';
import { compileContinuationCycle } from '@xi-io/sdk/cadence';
import { resolveLexiconCommand } from '@xi-io/sdk/command-lexicon/resolve';

const routeRecord = catalog.primitives.find((item) => item.id === 'progressive-route-card');
assert(routeRecord, 'catalog route primitive missing');
const resolved = resolveCallable(catalog, routeRecord.callable_uuid);
assert.equal(resolved.id, 'progressive-route-card');
assert.equal(resolved.specifier, '@xi-io/sdk/patterns/progressive-route');
const moduleFromCatalog = await import(resolved.specifier);
assert.equal(typeof moduleFromCatalog[resolved.export], 'function');
for (const styleSpecifier of resolved.styles) assert(existsSync(fileURLToPath(import.meta.resolve(styleSpecifier))));

const plan = derivePrimitiveAdoptionPlan({ catalog, requiredPrimitiveIds: ['panel', 'progressive-route-card'], observedPrimitiveIds: ['panel'] });
assert.equal(plan.state, 'MISSING_REQUIRED');
assert.deepEqual(plan.missing.map((item) => item.id), ['progressive-route-card']);
const missing = plan.missing[0];
const missingModule = await import(missing.specifier);
const html = missingModule[missing.export]({
  root: 'CONSUMER-CANARY-001', work: 'Consume SDK package', role: 'clean external app', generation: 'packed candidate',
  affectedReason: 'Controlled omission must be rediscovered through public catalog data.', next: 'Return package-consumer proof.',
  proof: 'package install + UUID resolve + public specifier import + style resolution + omission recovery', returnTo: 'SDK PR qualification',
  wake: 'SDK candidate generation changes', status: { label: 'CANDIDATE', tone: 'warning' },
});
assert(html.includes('Consume SDK package'));
assert(html.includes('data-xiui="progressive-disclosure"'));
assert(html.includes('data-xiui="next-action-strip"'));

const impact = compileImpactFormation({
  schema: 'xiio.sdk.impact-formation/v1',
  root: { root_ref: 'root:package-canary', generation: 'g1', golden_priority_ref: 'golden:package-canary', formation_profile_ref: 'formation:TRINITY_V1' },
  nodes: [{
    ref: 'subject:package-canary', direction: 'CURRENT', state: 'AFFECTED', currentness: 'CURRENT', priority: 'P1',
    risk: 1, user_impact: 1, time_pressure: 1, fanout: 1, cognitive_load: 1,
    human_facing: true, independent_review_required: true, ux_review_required: true,
    parallel_safe: true, runnable: true, dependencies: [],
  }],
});
assert.equal(impact.detonation_denominator, 3);
assert.equal(impact.semantic_cube.denominator, 27);
assert.equal(impact.exact_materializable_principal_count, null);

const continuation = compileContinuationCycle({
  root_ref: 'root:package-canary', worker_ref: 'worker:package-canary', subject_generation: 'g1', current_generation: 'g1',
  phase_event: 'POST_RESULT', pass_state: 'PASS', four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
  backlog: [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }], returns: [], residue: [], occurrences: [],
  worker_inbox: { ref: 'inbox:worker/package-canary', current: true, actionable_count: 0 },
});
assert.equal(continuation.disposition, 'CONTINUE_WORK');
assert.equal(continuation.terminal, false);
assert.equal(resolveLexiconCommand('overnight burn').command.id, 'baseline.burn');
assert.equal(resolveLexiconCommand('/babysit').command.id, 'cadence.continue');
console.log('XIIO_SDK_CLEAN_CONSUMER PASS');
`);

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const output = execFileSync(process.execPath, ['consumer.mjs'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(output, /XIIO_SDK_CLEAN_CONSUMER PASS/);
  const cli = path.join(consumer, 'node_modules', '.bin', 'xi-io');
  const discovery = JSON.parse(execFileSync(cli, ['sdk', 'commands'], { cwd: consumer, encoding: 'utf8' }));
  assert.equal(discovery.commands.length, 12);
  assert(discovery.commands.some((entry) => entry.command === 'compileImpactFormation'));
  assert(discovery.commands.some((entry) => entry.command === 'compileContinuationCycle'));
  assert(discovery.commands.some((entry) => entry.command === 'resolveLexiconCommand'));
  const cliResult = JSON.parse(execFileSync(cli, ['sdk', 'call', 'resolveLexiconCommand'], {
    cwd: consumer, encoding: 'utf8', input: JSON.stringify({ args: ['#babysit'] }),
  }));
  assert.equal(cliResult.result.command.id, 'cadence.continue');
  assert.equal(cliResult.authority_granted, false);
  console.log('XIIO_SDK_PACKAGE_CONSUMER PASS source=package catalog_driven_imports=1 withheld_primitive_recovered=1 impact_formation=1 cadence_continuation=1 lexicon_resolution=1 installed_cli_executed=1 repo_relative_imports=0');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
