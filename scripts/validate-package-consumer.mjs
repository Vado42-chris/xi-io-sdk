#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
import { compileFlapHarvest } from '@xi-io/sdk/transport/flap-harvest';
import { evaluateApiBlackholeClaim } from '@xi-io/sdk/evaluation/api-blackhole-proof-envelope';
import { compileYar, YAR_SCHEMA } from '@xi-io/sdk/acks/yar-return';
import { snap55 } from '@xi-io/sdk/evaluation/hallbergmaths-snap55';
import { compileBlankTestBed, serializeTestArtifact, parseTestArtifact } from '@xi-io/sdk/artifacts/test';

// Package import itself must expose offline Hallberg SNAP, without a workspace login.
const knownAt=Date.UTC(2026,9,13);
const knownPacket={questions:[{id:'a',pillar:'autism'},{id:'b',pillar:'adhd'}],
  responses:{a:0,b:4},nowMs:knownAt,journal:[{timestamp:knownAt-3600000,sensoryEntropy:20}]};
const knownSnap=snap55(knownPacket);
const knownBaseline=32/84, knownR=0.25*knownBaseline+0.65*0.2+0.005;
assert.equal(knownSnap.state,'SOURCE_BOUND_NUMERIC');
assert(Math.abs(knownSnap.baseline-knownBaseline)<1e-14);
assert(Math.abs(knownSnap.R-knownR)<1e-14);
assert.equal(knownSnap.effect_authority,0);

const blank = compileBlankTestBed({ artifact_id: 'bed:clean-package', generation: 'g1' });
assert.deepEqual(parseTestArtifact(serializeTestArtifact(blank)), blank);
assert.equal(blank.authority.live_runtime, false);

const yar = compileYar({ schema: YAR_SCHEMA, ack_ref: 'ack:package-only' });
assert.equal(yar.complete, false);
assert.equal(yar.state, 'FAIL_CLOSED');
assert.equal(yar.effect_authority, 0);

const blackhole = evaluateApiBlackholeClaim({claim_kind:'PROSE',proof_scope:'SYNTHETIC_FIXTURE',source_generation:'package:g1'});
assert.equal(blackhole.promotion_allowed,false);
assert.equal(blackhole.authority_granted,false);
assert.equal(blackhole.provider_effect,false);
const flapItem={occurrence_ref:'occ:packaged',canonical_identity:'identity:package',generation:'G1',
  content_sha256:'a'.repeat(64),content_bytes:1};
const flapDecision=compileFlapHarvest({occurrences:[flapItem],current_generation:'G1'});
assert.equal(flapDecision.resume.state,'AWAIT_EXECUTION_ADMISSION');
assert.equal(flapDecision.resume.repeat_effect,false);
assert.equal(flapDecision.runtime_complete,false);
assert.equal(flapDecision.provider_effect,false);
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
  assert.equal(discovery.commands.length, 28);
  assert(discovery.commands.some((entry) => entry.command === 'snap55' && entry.specifier === '@xi-io/sdk/evaluation/hallbergmaths-snap55'));
  for (const command of ['compileFlatplaneCube','compileFlatpackPatch','compileSpinSet','detonateLogicGates','compileBlastwaveImpact','compileAftercareCard','compileReapDebtMeter','compileOwnerCogLedger','compileProjectionRebaseGate','compileCubeCoordinate']) {
    assert(discovery.commands.some((entry) => entry.command === command && entry.specifier === '@xi-io/sdk/flatpack'), `packaged Flatpack registry missing ${command}`);
  }
  // Installed tarball, not repo-relative import: execute the actual public CLI offline.
  const snapNow=Date.UTC(2026,9,13);
  const snapInput={args:[{questions:[{id:'a',pillar:'autism'},{id:'b',pillar:'adhd'}],
    responses:{a:0,b:4},nowMs:snapNow,journal:[{timestamp:snapNow-3600000,sensoryEntropy:20}]}]};
  const snapWire=JSON.stringify(snapInput);
  const snapOptions={cwd:consumer,encoding:'utf8',input:snapWire,stdio:['pipe','pipe','pipe']};
  const snapRaw=execFileSync(cli,['sdk','call','snap55'],snapOptions);
  const installedSnap=JSON.parse(snapRaw);
  assert.equal(installedSnap.status,'COMPUTED');
  assert.equal(installedSnap.callable,'@xi-io/sdk/evaluation/hallbergmaths-snap55#snap55');
  assert.equal(installedSnap.result.state,'SOURCE_BOUND_NUMERIC');
  assert(Math.abs(installedSnap.result.baseline-(32/84))<1e-14);
  assert(Math.abs(installedSnap.result.R-(0.25*(32/84)+0.65*0.2+0.005))<1e-14);
  assert.equal(installedSnap.authority_granted,false);
  assert.equal(installedSnap.provider_effect,false);
  assert.equal(snapRaw,execFileSync(cli,['sdk','call','snap55'],snapOptions),'installed SNAP replay must be byte identical');

  const noTimestamp=spawnSync(cli,['sdk','call','snap55'],{
    ...snapOptions,input:JSON.stringify({args:[{questions:snapInput.args[0].questions,responses:{a:0,b:4}}]})
  });
  assert.equal(noTimestamp.status,2);
  assert.equal(JSON.parse(noTimestamp.stdout).status,'REJECTED');
  const roundedNowWire=snapWire.replace('"nowMs":'+snapNow,'"nowMs":'+snapNow+'.0001');
  assert.notEqual(roundedNowWire,snapWire);
  assert.equal(JSON.parse(roundedNowWire).args[0].nowMs,snapNow,'raw hostile must silently round if parser lacks source guard');
  const roundedNow=spawnSync(cli,['sdk','call','snap55'],{...snapOptions,input:roundedNowWire});
  assert.equal(roundedNow.status,2);
  assert.equal(JSON.parse(roundedNow.stdout).status,'REJECTED');
  const journalAt=snapNow-3600000;
  const roundedJournalWire=snapWire.replace('"timestamp":'+journalAt,'"timestamp":'+journalAt+'.0001');
  assert.notEqual(roundedJournalWire,snapWire);
  const journalUnknown=JSON.parse(execFileSync(cli,['sdk','call','snap55'],{...snapOptions,input:roundedJournalWire}));
  assert.equal(journalUnknown.result.state,'UNKNOWN_JOURNAL_DATA');
  assert.equal(journalUnknown.result.R,null);
  assert.equal(journalUnknown.provider_effect,false);
  const reapMeter = JSON.parse(execFileSync(cli, ['sdk', 'call', 'compileReapDebtMeter'], {
    cwd: consumer, encoding: 'utf8', input: JSON.stringify({ args: [{ opened_units: 1, reaped_stew: 10, ratio: 10 }] }),
  }));
  assert.equal(reapMeter.status, 'COMPUTED');
  assert.equal(reapMeter.result.admitted, true);
  assert.equal(reapMeter.authority_granted, false);
  assert.equal(reapMeter.provider_effect, false);
  assert(discovery.commands.some((entry) => entry.command === 'compileImpactFormation'));
  assert(discovery.commands.some((entry) => entry.command === 'compileContinuationCycle'));
  assert(discovery.commands.some((entry) => entry.command === 'compileContinuationDirective'));
  assert(discovery.commands.some((entry) => entry.command === 'compileContinuationLoop'));
  assert(discovery.commands.some((entry) => entry.command === 'compileRejoinSeams'));
  assert(discovery.commands.some((entry) => entry.command === 'resolveLexiconCommand'));
  const cliResult = JSON.parse(execFileSync(cli, ['sdk', 'call', 'resolveLexiconCommand'], {
    cwd: consumer, encoding: 'utf8', input: JSON.stringify({ args: ['#babysit'] }),
  }));
  assert.equal(cliResult.result.command.id, 'cadence.continue');
  assert.equal(cliResult.authority_granted, false);

  const selfDriveInput = {
    root_ref: 'root:package-canary', worker_ref: 'worker:package-canary', subject_generation: 'g1', current_generation: 'g1',
    phase_event: 'POST_RESULT', pass_state: 'PASS', four_scale: { MICRO: '100', MESO: '100', MACRO: '100', META: '100' },
    backlog: [{ id: 'work:next', state: 'RUNNABLE', priority: 1 }], returns: [], residue: [], occurrences: [],
    worker_inbox: { ref: 'inbox:worker/package-canary', current: true, actionable_count: 0 }, owner_heartbeat_count: 0,
  };
  const selfDrive = JSON.parse(execFileSync(cli, ['sdk', 'call', 'compileContinuationDirective'], {
    cwd: consumer, encoding: 'utf8', input: JSON.stringify({ args: [selfDriveInput] }),
  }));
  assert.equal(selfDrive.status, 'COMPUTED');
  assert.equal(selfDrive.provider_effect, false);
  assert.equal(selfDrive.authority_granted, false);
  assert.equal(selfDrive.result.stop_class, 'CONTINUE');
  assert.equal(selfDrive.result.yield_allowed, false);
  assert.equal(selfDrive.result.next_packet.work_ref, 'work:next');
  assert.equal(selfDrive.result.next_packet.owner_ingress_required, false);

  const rejoinInput = {
    ...selfDriveInput,
    phase_event: 'POST_EFFECT_READBACK',
    backlog: [{ id: 'SEAM_ONE', state: 'TRUE_WAIT', priority: 1, wake_when: 'receipt:seam-one' }],
    seams: [{ seam_ref: 'SEAM_ONE', kind: 'ACK', state: 'TRUE_WAIT', priority: 1, wake_receipt_ref: 'receipt:seam-one' }],
    seam_receipts: [{
      receipt_ref: 'receipt:seam-one', seam_ref: 'SEAM_ONE', root_ref: selfDriveInput.root_ref,
      subject_generation: selfDriveInput.subject_generation, current_generation: selfDriveInput.current_generation,
      authenticated: true, verified: true, provider_readback: true,
    }],
  };
  const rejoin = JSON.parse(execFileSync(cli, ['sdk', 'call', 'compileRejoinSeams'], {
    cwd: consumer, encoding: 'utf8', input: JSON.stringify({ args: [rejoinInput] }),
  }));
  assert.equal(rejoin.status, 'COMPUTED');
  assert.equal(rejoin.result.next_action.action, 'COMPILE_RETURN');
  assert.equal(rejoin.result.authority_granted, false);
  assert.equal(rejoin.result.provider_effect, false);

  console.log('XIIO_SDK_PACKAGE_CONSUMER PASS source=package catalog_driven_imports=1 withheld_primitive_recovered=1 impact_formation=1 cadence_continuation=1 self_drive=1 rejoin_cli=1 lexicon_resolution=1 installed_cli_executed=1 installed_snap55=1 snap55_replay_precise=1 repo_relative_imports=0');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
