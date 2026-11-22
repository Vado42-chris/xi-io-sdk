import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTruncation3x3x3, CELL_IDS } from '../src/diagnostics/truncation-3x3x3.mjs';

const all = (state = 'PASS') =>
  Object.fromEntries(CELL_IDS.map((id) => [id, { state, evidence: 'receipt:' + id, owner: 'o', next_action: 'n' }]));

test('27 cells in deterministic A×B×C order', () => {
  assert.equal(CELL_IDS.length, 27);
  assert.equal(CELL_IDS[0], 'A1B1C1');
  assert.equal(CELL_IDS[26], 'A3B3C3');
});

test('all explicit PASS with evidence yields ACCOUNTED, never CLOSED', () => {
  const out = evaluateTruncation3x3x3(all('PASS'));
  assert.equal(out.state, 'ACCOUNTED');
  assert.equal(out.closed, false);
  assert.equal(out.first_red, null);
});

test('a missing cell is RED, not inferred from another cell', () => {
  const cells = all('PASS');
  delete cells.A1B2C1;
  const out = evaluateTruncation3x3x3(cells);
  assert.equal(out.state, 'RED');
  assert.equal(out.first_red.cell, 'A1B2C1');
  assert.equal(out.first_red.reason, 'CELL_NOT_SUPPLIED');
});

test('PASS without evidence is RED', () => {
  const cells = all('PASS');
  cells.A2B1C3.evidence = '';
  assert.equal(evaluateTruncation3x3x3(cells).first_red.reason, 'PASS_WITHOUT_EVIDENCE');
});

test('N_A without evidence is RED', () => {
  const cells = all('PASS');
  cells.A1B3C2 = { state: 'N_A_WITH_EVIDENCE', evidence: '' };
  assert.equal(evaluateTruncation3x3x3(cells).first_red.cell, 'A1B3C2');
});

test('FIRST_RED is the earliest red cell with owner and exact next action', () => {
  const cells = all('PASS');
  cells.A3B1C2 = { state: 'RED', reason: 'APPLY_RETURN_NOT_READ_BACK', owner: 'ibal-lane', next_action: 'run runtime return' };
  cells.A1B1C2 = { state: 'RED', reason: 'GENERATION_NOT_BOUND', owner: 'sam-lane', next_action: 'bind generation' };
  const out = evaluateTruncation3x3x3(cells);
  assert.equal(out.first_red.cell, 'A1B1C2');
  assert.equal(out.first_red.owner_bound, true);
  assert.equal(out.counts.RED, 2);
});

test('a red cell with no owner is reported as unbound', () => {
  const cells = all('PASS');
  cells.A2B3C1 = { state: 'RED', reason: 'BINS_NOT_BOUND' };
  assert.equal(evaluateTruncation3x3x3(cells).first_red.owner_bound, false);
});

test('unknown state is RED', () => {
  const cells = all('PASS');
  cells.A1B1C2 = { state: 'MAYBE', evidence: 'x' };
  assert.equal(evaluateTruncation3x3x3(cells).first_red.reason, 'CELL_STATE_INVALID');
});

import { composeTruncation3x3x3 } from '../src/diagnostics/truncation-3x3x3.mjs';
const coordsAllPass = () => Object.fromEntries(['A1','A2','A3','B1','B2','B3','C1','C2','C3'].map(k => [k, { state: 'PASS', evidence: 'e:' + k, owner: 'o', next_action: 'n' }]));

test('composition: all nine coordinates PASS gives ACCOUNTED with 27 cells', () => {
  const out = composeTruncation3x3x3(coordsAllPass());
  assert.equal(out.state, 'ACCOUNTED');
  assert.equal(out.cells.length, 27);
});

test('composition: one red coordinate reds exactly the nine cells that contain it', () => {
  const c = coordsAllPass();
  c.A2 = { state: 'RED', reason: 'PREVIOUS_CANDIDATE_NOT_PRESERVED', owner: 'sam', next_action: 'preserve candidate' };
  const out = composeTruncation3x3x3(c);
  assert.equal(out.counts.RED, 9);
  assert.equal(out.first_red.cell, 'A2B1C1');
  assert.equal(out.first_red.owner_bound, true);
});

test('composition: missing coordinate is RED, not inferred', () => {
  const c = coordsAllPass();
  delete c.C3;
  const out = composeTruncation3x3x3(c);
  assert.equal(out.counts.RED, 9);
  assert.equal(out.first_red.reason, 'COORDINATE_NOT_ACCOUNTED');
});
