#!/usr/bin/env node
/**
 * Hostile + happy path for xi-io quorum (afg-19).
 * Hard: OLLAMA != EFFECT_AUTHORITY · DISPATCH_DRY_RUN != EXECUTE · GATE_SIMULATION_RESULT != NATIVE_CALL
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runQuorumCli } from '../src/quorum/cube-quorum-cli.mjs';

const CUBE = process.env.XIIO_CUBE_ROOT
  || '/media/chrishallberg/Storage 22/001_Flatpack_installs/xi-io-studio/workspaces';

assert.ok(fs.existsSync(path.join(CUBE, 'CUBE.bugs.business-canary.20261012.json')), 'bugs ledger must exist');

const status = await runQuorumCli({ action: 'status', flags: { cube: CUBE } });
assert.equal(status.state, 'PASS', 'status PASS');
assert.equal(status.effect_authority, 0);
assert.equal(status.authority_granted, false);
assert.ok(status.bug_count >= 11, `expected >=11 bugs, got ${status.bug_count}`);

const bugs = await runQuorumCli({ action: 'bugs', flags: { cube: CUBE } });
assert.equal(bugs.state, 'PASS');
const ids = bugs.bugs.map((b) => b.bug_uuid);
assert.ok(ids.includes('bug-afg19-quorum-control-surface'));
assert.ok(ids.includes('bug-canary-01-free-as-revenue'));
assert.equal(new Set(ids).size, ids.length, 'bug uuids unique');

const dispatchBlocked = await runQuorumCli({
  action: 'dispatch',
  target: 'bug-canary-01-free-as-revenue',
  flags: { cube: CUBE },
});
assert.equal(dispatchBlocked.state, 'BLOCKED');
assert.equal(dispatchBlocked.first_red, 'DISPATCH_REQUIRES_DRY_RUN');

const dispatchDry = await runQuorumCli({
  action: 'dispatch',
  target: 'bug-canary-01-free-as-revenue',
  flags: { cube: CUBE, 'dry-run': true },
});
assert.equal(dispatchDry.state, 'PASS');
assert.equal(dispatchDry.mode, 'DRY_RUN');
assert.equal(dispatchDry.effect_authority, 0);
assert.equal(dispatchDry.ward_admission.owed, true);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-quorum-'));
const simPath = path.join(tmp, 'sim.txt');
fs.writeFileSync(simPath, "I've simulated the gate — 6 of 8 checks passed.\n");
const simReview = await runQuorumCli({
  action: 'review',
  target: 'bug-canary-01-free-as-revenue',
  flags: { cube: CUBE, local: true, assessment: simPath },
});
assert.equal(simReview.state, 'BLOCKED', 'gate-simulation prose must not become a vote');
assert.equal(simReview.vote.gate_pass, false);
assert.equal(simReview.wrote_to_ledger, false);

const cleanPath = path.join(tmp, 'clean.txt');
fs.writeFileSync(cleanPath, 'BLOCKED=MISSING_FUNNEL; NEXT=WAIT_OWNER_ARPU_SCOPE\n');
const cleanReview = await runQuorumCli({
  action: 'review',
  target: 'bug-canary-01-free-as-revenue',
  flags: { cube: CUBE, local: true, assessment: cleanPath },
});
assert.equal(cleanReview.state, 'PASS');
assert.equal(cleanReview.vote.gate_pass, true);
assert.equal(cleanReview.effect_authority, 0);
assert.equal(cleanReview.authority_granted, false);

const votes = await runQuorumCli({
  action: 'votes',
  target: 'bug-canary-01-free-as-revenue',
  flags: { cube: CUBE },
});
assert.equal(votes.state, 'PASS');
assert.equal(votes.votes_admitted_count, 0, 'without --write, no ledger mutation');

const ret = await runQuorumCli({
  action: 'return',
  target: 'afg-17',
  flags: { cube: CUBE },
});
assert.ok(['PASS', 'TRUE_WAIT'].includes(ret.state));
assert.equal(ret.effect_authority, 0);

process.stdout.write('validate-cube-quorum-cli: PASS\n');
