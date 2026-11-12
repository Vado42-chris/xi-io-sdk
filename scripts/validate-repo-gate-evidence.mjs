#!/usr/bin/env node
// Qualify the existing SDK reusable gate's optional product-evidence return.
// No product list, deployment authority, provider effect or runner is created.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/xiio-repo-gate.yml', import.meta.url), 'utf8');
const section = workflow.split('      - name: Validate product evidence scope\n')[1];
assert.ok(section, 'EVIDENCE_SCOPE_STEP_MISSING');
const script = section.split('        run: |\n')[1]
  ?.split('      - name: Upload product evidence from existing gate\n')[0]
  ?.replace(/^          /gm, '').trim();
assert.ok(script, 'EVIDENCE_SCOPE_EXECUTABLE_MISSING');
for (const name of ['evidence_dir:', 'evidence_name:', 'id: evidence_scope',
  'EVIDENCE_DIR_ESCAPE', 'EVIDENCE_ARTIFACT_NAME_INVALID', 'EVIDENCE_DIR_UNSAFE']) {
  assert.ok(workflow.includes(name), 'EVIDENCE_CONTRACT_MISSING:' + name);
}
const upload = workflow.split('      - name: Upload product evidence from existing gate\n')[1];
assert.ok(upload && upload.includes('if-no-files-found: error') &&
  upload.includes('steps.evidence_scope.outcome') &&
  upload.includes('inputs.working_directory') &&
  upload.includes('inputs.evidence_dir'), 'PRODUCT_EVIDENCE_UPLOAD_GATE_MISSING');
const dir = mkdtempSync(join(tmpdir(), 'xiio-sdk-gate-evidence-'));
try {
  mkdirSync(join(dir, 'artifacts', 'duel'), {recursive:true});
  mkdirSync(join(dir, 'outside'));
  writeFileSync(join(dir, 'artifacts', 'duel', 'result.json'), '{}');
  symlinkSync(join(dir, 'outside'), join(dir, 'artifacts', 'escape'));
  const cases = [
    ['artifacts/duel', 'duel-evidence', true],
    ['artifacts/duel', '', false],
    ['artifacts/duel', '../host', false],
    ['artifacts/escape', 'duel-evidence', false],
    ['artifacts/missing', 'duel-evidence', false],
    ['artifacts/../outside', 'duel-evidence', false],
    ['../outside', 'duel-evidence', false],
    ['artifacts/duel/*', 'duel-evidence', false],
    ['artifacts/duel', 'name/escape', false],
  ];
  for (const [evidenceDir, evidenceName, expected] of cases) {
    const result = spawnSync('bash', ['-c', script], {
      encoding:'utf8',
      env:{...process.env, GITHUB_WORKSPACE:dir, WORKING_DIR:'.',
        EVIDENCE_DIR:evidenceDir, EVIDENCE_NAME:evidenceName},
    });
    assert.equal(result.status === 0, expected,
      'EVIDENCE_SCOPE_WRONG_RESULT ' + JSON.stringify({evidenceDir,evidenceName,
        status:result.status,stdout:result.stdout,stderr:result.stderr}));
  }
  console.log('REPO_GATE_EVIDENCE_PASS cases=' + cases.length +
    ' scope=artifacts-only symlink_escape=DENY missing=DENY upload_fail_closed=true');
} finally {
  rmSync(dir, {recursive:true,force:true});
}
