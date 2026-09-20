import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileGraduationPreflight, GRADUATION_PROFILES, profileCatalog } from '../src/preflight/graduation.mjs';

function goodInput(profile) {
  return {
    profile,
    subject_ref: `fixture:${profile.toLowerCase()}`,
    source_generation: 'fixture:g1',
    cells: Object.fromEntries(GRADUATION_PROFILES[profile].map(([id]) => [id, {
      state: 'PASS',
      reason: 'KNOWN_ANSWER',
      evidence_refs: [`fixture:evidence:${profile}:${id}`],
      blockers: [],
    }])),
  };
}

let checks = 0;
const catalog = profileCatalog();
assert.equal(catalog.profiles.length, 6); checks += 1;
assert.deepEqual(catalog.profiles.map((p) => p.denominator), [14,14,10,14,16,10]); checks += 1;

let omissionHostiles = 0;
for (const profile of Object.keys(GRADUATION_PROFILES)) {
  const input = goodInput(profile);
  const clean = compileGraduationPreflight(input);
  assert.equal(clean.accounting_100, true);
  assert.equal(clean.release_eligible, true);
  assert.equal(clean.first_red, null);
  assert.equal(clean.graduated_through, GRADUATION_PROFILES[profile].at(-1)[0]);
  checks += 4;

  for (const [id] of GRADUATION_PROFILES[profile]) {
    const sample = structuredClone(input);
    delete sample.cells[id];
    const out = compileGraduationPreflight(sample);
    assert.equal(out.release_eligible, false, `${profile}/${id} omission must block`);
    assert.equal(out.first_red.cell, id, `${profile}/${id} must be first red when earlier cells clean`);
    checks += 2;
    omissionHostiles += 1;
  }
}
assert.equal(omissionHostiles, 78); checks += 1;

{
  const sample = goodInput('TEMPLATE_L1_L10');
  sample.cells.L3 = { state: 'PASS', reason: 'NO_EVIDENCE', evidence_refs: [] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.cells.find((c) => c.id === 'L3').state, 'UNKNOWN');
  assert.equal(out.cells.find((c) => c.id === 'L3').defect, 'PASS_WITHOUT_EVIDENCE');
  assert.equal(out.release_eligible, false);
  checks += 3;
}

{
  const sample = goodInput('TEMPLATE_L1_L10');
  sample.cells.L4 = { state: 'N_A_WITH_REASON', reason: '', evidence_refs: [] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.cells.find((c) => c.id === 'L4').state, 'UNKNOWN');
  assert.equal(out.release_eligible, false);
  checks += 2;
}

{
  const sample = goodInput('RELEASE_P0_P13');
  sample.cells.P7 = { state: 'WAIT', reason: 'RUNNER_CAPACITY', evidence_refs: ['fixture:queue'], blockers: [] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.cells.find((c) => c.id === 'P7').defect, 'WAIT_WITHOUT_REASON_AND_WAKE_BLOCKER');
  assert.equal(out.release_eligible, false);
  checks += 2;
}

{
  const sample = goodInput('WORK_0_15');
  sample.cells.W3 = { state: 'FAIL', reason: 'READINESS_RED', evidence_refs: ['fixture:red'], blockers: ['blocker:w3'] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.first_red.cell, 'W3');
  assert.equal(out.graduated_through, 'W2');
  assert.equal(out.cells.at(-1).state, 'PASS');
  assert.equal(out.release_eligible, false);
  checks += 4;
}

{
  const sample = goodInput('WARD_E0_E9');
  sample.cells.E2 = { state: 'FAIL', reason: 'WARD_GUARD_STALE', evidence_refs: ['ward:policy:g1'], blockers: ['wake:ward-current'] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.first_red.cell, 'E2');
  assert.equal(out.graduated_through, 'E1');
  assert.equal(out.cells.find((c) => c.id === 'E7').state, 'PASS');
  assert.equal(out.release_eligible, false);
  checks += 4;
}

{
  const sample = goodInput('WARD_E0_E9');
  sample.cells.E5 = { state: 'N_A_WITH_REASON', reason: 'NO_CONSEQUENTIAL_EFFECT_IN_THIS_FIXTURE', evidence_refs: ['fixture:no-effect'] };
  const out = compileGraduationPreflight(sample);
  assert.equal(out.cells.find((c) => c.id === 'E5').state, 'N_A_WITH_REASON');
  assert.equal(out.release_eligible, true);
  checks += 2;
}

assert.throws(() => compileGraduationPreflight({ ...goodInput('TEMPLATE_L1_L10'), profile: 'NOPE' }), /unknown graduation profile/); checks += 1;
const extra = goodInput('TEMPLATE_L1_L10');
extra.cells.EXTRA = { state: 'PASS', evidence_refs: ['fixture:x'] };
assert.throws(() => compileGraduationPreflight(extra), /unknown graduation cells/); checks += 1;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xiio-preflight-'));
const inputPath = path.join(tmp, 'preflight.json');
fs.writeFileSync(inputPath, JSON.stringify(goodInput('TEMPLATE_L1_L10')));
const cliPath = new URL('../bin/xi.mjs', import.meta.url).pathname;
const cli = spawnSync(process.execPath, [cliPath, 'preflight', 'compile', '--input', inputPath], { encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr); checks += 1;
assert.equal(JSON.parse(cli.stdout).release_eligible, true); checks += 1;
const profiles = spawnSync(process.execPath, [cliPath, 'preflight', 'profiles'], { encoding: 'utf8' });
assert.equal(profiles.status, 0, profiles.stderr); checks += 1;
assert.equal(JSON.parse(profiles.stdout).profiles.length, 6); checks += 1;
fs.rmSync(tmp, { recursive: true, force: true });

console.log(JSON.stringify({ mode:'GRADUATION_PREFLIGHT', profiles:6, omission_hostiles:78, checks, result:'PASS', effects:0, ward_profile:'WARD_E0_E9' }));
