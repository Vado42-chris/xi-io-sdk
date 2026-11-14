#!/usr/bin/env node
/** Portable, fail-closed quorum fixture. Physical dogfood roots are supplied by the operator. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runQuorumCli, resolveCubeRoot } from '../src/quorum/cube-quorum-cli.mjs';

const quorumSource = fs.readFileSync(new URL('../src/quorum/cube-quorum-cli.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(quorumSource, /\/media\/|Storage 22|chrishallberg|xi-io-studio/, 'reusable Cube reader must not embed one developer or project');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-quorum-'));
const prior = process.env.XIIO_CUBE_ROOT;
delete process.env.XIIO_CUBE_ROOT;
try {
  assert.equal(resolveCubeRoot({}, {}), null, 'no personal root fallback');
  const unbound = await runQuorumCli({ action: 'status' });
  assert.equal(unbound.state, 'TRUE_WAIT');
  assert.equal(unbound.first_red, 'CUBE_ROOT_UNCONFIGURED');
  assert.equal(unbound.project, null);
  assert.equal(unbound.effect_authority, 0);

  const cube = path.join(tmp, 'tenant-alpha');
  fs.mkdirSync(cube);
  const bugs = [
    { bug_uuid: 'bug-afg19-quorum-control-surface', state: 'OPEN', title: 'Quorum gate', n: 1 },
    { bug_uuid: 'bug-canary-01-free-as-revenue', state: 'OPEN', title: 'Revenue claim', n: 2, deliverable: 'Verify the measurement', votes: [] },
    ...Array.from({ length: 9 }, (_, i) => ({ bug_uuid: `tenant-bug-${i}`, title: `Task ${i}`, state: 'OPEN', n: i + 3 })),
  ];
  const ledger = path.join(cube, 'CUBE.bugs.tenant-alpha.json');
  fs.writeFileSync(ledger, JSON.stringify({ bugs, business_record: 'CUBE.business-record.tenant-alpha.json' }));
  fs.writeFileSync(path.join(cube, 'CUBE.business-record.tenant-alpha.json'), JSON.stringify({ project: 'tenant-alpha', monetization: null }));
  fs.writeFileSync(path.join(cube, 'RETURN.work-alpha.json'), JSON.stringify({ work_uuid: 'work-alpha' }));

  process.env.XIIO_CUBE_ROOT = tmp;
  assert.equal(resolveCubeRoot({ project: 'tenant-alpha' }), cube);
  assert.equal(resolveCubeRoot({ project: '../tenant-alpha' }), null, 'project must not escape the configured workspace root');
  const traversal = await runQuorumCli({ action: 'status', flags: { project: '../tenant-alpha' } });
  assert.equal(traversal.first_red, 'CUBE_PROJECT_REF_INVALID');
  const foreign = await runQuorumCli({ action: 'status', flags: { project: 'tenant-other' } });
  assert.equal(foreign.first_red, 'CUBE_ROOT_NOT_FOUND', 'missing project must never select a sibling');

  const flags = { project: 'tenant-alpha' };
  const status = await runQuorumCli({ action: 'status', flags });
  assert.equal(status.state, 'PASS');
  assert.equal(status.project, 'tenant-alpha');
  assert.equal(status.bug_count, 11);
  assert.equal(status.effect_authority, 0);
  assert.equal(status.authority_granted, false);
  const bugList = await runQuorumCli({ action: 'bugs', flags });
  assert.equal(bugList.state, 'PASS');
  assert.equal(new Set(bugList.bugs.map(b => b.bug_uuid)).size, 11);

  const blocked = await runQuorumCli({ action: 'dispatch', target: 'bug-canary-01-free-as-revenue', flags });
  assert.equal(blocked.first_red, 'DISPATCH_REQUIRES_DRY_RUN');
  const dry = await runQuorumCli({ action: 'dispatch', target: 'bug-canary-01-free-as-revenue', flags: { ...flags, 'dry-run': true } });
  assert.equal(dry.state, 'PASS');
  assert.equal(dry.effect_authority, 0);
  assert.equal(dry.ward_admission.owed, true);

  const simulatedText = path.join(tmp, 'simulated.txt');
  fs.writeFileSync(simulatedText, "I've simulated the gate — 6 of 8 checks passed.\n");
  const simulated = await runQuorumCli({ action: 'review', target: 'bug-canary-01-free-as-revenue', flags: { ...flags, local: true, assessment: simulatedText } });
  assert.equal(simulated.state, 'BLOCKED');
  assert.equal(simulated.vote.gate_pass, false);
  assert.equal(simulated.wrote_to_ledger, false);
  const assessment = path.join(tmp, 'review.txt');
  fs.writeFileSync(assessment, 'BLOCKED=MISSING_FUNNEL; NEXT=WAIT_OWNER_SCOPE\n');
  const review = await runQuorumCli({ action: 'review', target: 'bug-canary-01-free-as-revenue', flags: { ...flags, local: true, assessment } });
  assert.equal(review.state, 'PASS');
  assert.equal(review.effect_authority, 0);
  assert.equal(review.authority_granted, false);
  const ledgerBeforeWrite = fs.readFileSync(ledger, 'utf8');
  const attemptedWrite = await runQuorumCli({ action: 'review', target: 'bug-canary-01-free-as-revenue', flags: { ...flags, local: true, assessment, write: true } });
  assert.equal(attemptedWrite.state, 'BLOCKED');
  assert.equal(attemptedWrite.first_red, 'WARD_LEDGER_WRITE_ADMISSION_REQUIRED');
  assert.equal(attemptedWrite.wrote_to_ledger, false);
  assert.equal(fs.readFileSync(ledger, 'utf8'), ledgerBeforeWrite, 'SDK gate must not mutate Cube without Ward');
  const votes = await runQuorumCli({ action: 'votes', target: 'bug-canary-01-free-as-revenue', flags });
  assert.equal(votes.votes_admitted_count, 0);
  const returned = await runQuorumCli({ action: 'return', target: 'work-alpha', flags });
  assert.equal(returned.state, 'PASS');
  assert.equal(returned.receipts.length, 1);

  // A ledger must not smuggle a business record from another project.
  fs.writeFileSync(ledger, JSON.stringify({ bugs, business_record: '../tenant-other/private.json' }));
  const escaped = await runQuorumCli({ action: 'status', flags });
  assert.equal(escaped.state, 'TRUE_WAIT');
  assert.equal(escaped.first_red, 'CUBE_BUSINESS_RECORD_OUTSIDE_ROOT');

  // A symlink ledger is not a safe substitute for selected local custody.
  fs.symlinkSync(ledger, path.join(cube, 'CUBE.bugs.injected.json'));
  const stillSelected = await runQuorumCli({ action: 'bugs', flags });
  assert.equal(stillSelected.bugs.length, 11);
  console.log('validate-cube-quorum-cli: PASS');
} finally {
  if (prior === undefined) delete process.env.XIIO_CUBE_ROOT;
  else process.env.XIIO_CUBE_ROOT = prior;
  fs.rmSync(tmp, { recursive: true, force: true });
}
