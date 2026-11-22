// 27-cell truncation diagnostic (Framework #956). Cells are A×B×C:
// A source/currentness, B legal/work conversion, C return/orchestration; each axis has
// three ordered cells (1..3). Every cell must be explicitly PASS, RED or N_A_WITH_EVIDENCE.
// A missing cell is RED, never inferred from another cell. Output state is at most
// ACCOUNTED: it never reports CLOSED, because 3X3X3_ACCOUNTED != 3X3X3_CLOSED.
// The diagnostic creates no external effect authority.

export const TRUNCATION_3X3X3_SCHEMA = 'xiio.diagnostic.truncation-3x3x3/v1';
export const CELL_STATES = Object.freeze(['PASS', 'RED', 'N_A_WITH_EVIDENCE']);

// 27 cells = A×B×C, each axis value 1..3, id like A1B2C3 (A first, then B, then C).
export const CELL_IDS = Object.freeze(
  [1, 2, 3].flatMap((a) => [1, 2, 3].flatMap((b) => [1, 2, 3].map((c) => `A${a}B${b}C${c}`))),
);

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function evaluateTruncation3x3x3(cells = {}) {
  const rows = CELL_IDS.map((id) => {
    const c = cells[id];
    if (!c || typeof c !== 'object') return { cell: id, state: 'RED', reason: 'CELL_NOT_SUPPLIED', owner: null, next_action: null };
    if (!CELL_STATES.includes(c.state)) return { cell: id, state: 'RED', reason: 'CELL_STATE_INVALID', owner: c.owner ?? null, next_action: c.next_action ?? null };
    if (c.state === 'PASS' && !nonEmpty(c.evidence)) return { cell: id, state: 'RED', reason: 'PASS_WITHOUT_EVIDENCE', owner: c.owner ?? null, next_action: c.next_action ?? null };
    if (c.state === 'N_A_WITH_EVIDENCE' && !nonEmpty(c.evidence)) return { cell: id, state: 'RED', reason: 'N_A_WITHOUT_EVIDENCE', owner: c.owner ?? null, next_action: c.next_action ?? null };
    if (c.state === 'RED') return { cell: id, state: 'RED', reason: nonEmpty(c.reason) ? c.reason : 'CELL_RED', owner: c.owner ?? null, next_action: c.next_action ?? null };
    return { cell: id, state: c.state, reason: null, owner: null, next_action: null };
  });

  const counts = { PASS: 0, RED: 0, N_A_WITH_EVIDENCE: 0 };
  for (const r of rows) counts[r.state] += 1;

  const firstRed = rows.find((r) => r.state === 'RED') ?? null;
  const state = firstRed ? 'RED' : 'ACCOUNTED';
  return Object.freeze({
    schema: TRUNCATION_3X3X3_SCHEMA,
    state,
    counts: Object.freeze(counts),
    first_red: firstRed
      ? Object.freeze({
          cell: firstRed.cell,
          reason: firstRed.reason,
          owner: firstRed.owner,
          next_action: firstRed.next_action,
          owner_bound: nonEmpty(firstRed.owner) && nonEmpty(firstRed.next_action),
        })
      : null,
    cells: Object.freeze(rows),
    closed: false,
  });
}

// Derive the 27 cells from 9 coordinate states (A1..A3, B1..B3, C1..C3). A cell is PASS
// or N_A only when all three of its own coordinates are PASS or N_A with evidence; otherwise
// it is RED with the failing coordinate named. Cells are never inferred from one another:
// each cell is a pure function of its own three coordinates.
export function composeTruncation3x3x3(coords = {}) {
  const axisIds = { A: [1, 2, 3], B: [1, 2, 3], C: [1, 2, 3] };
  const cells = {};
  for (const a of axisIds.A) for (const b of axisIds.B) for (const c of axisIds.C) {
    const id = `A${a}B${b}C${c}`;
    const parts = [`A${a}`, `B${b}`, `C${c}`].map((k) => ({ k, v: coords[k] ?? null }));
    const bad = parts.find(({ v }) => !v || !CELL_STATES.includes(v.state) || (v.state === 'PASS' && !nonEmpty(v.evidence)) || (v.state === 'N_A_WITH_EVIDENCE' && !nonEmpty(v.evidence)) || v.state === 'RED');
    if (bad) {
      cells[id] = { state: 'RED', reason: bad.v?.state === 'RED' ? (bad.v.reason || 'COORDINATE_RED') : 'COORDINATE_NOT_ACCOUNTED', owner: bad.v?.owner ?? null, next_action: bad.v?.next_action ?? null, coordinate: bad.k };
    } else {
      cells[id] = { state: parts.every(({ v }) => v.state === 'N_A_WITH_EVIDENCE') ? 'N_A_WITH_EVIDENCE' : 'PASS', evidence: parts.map(({ v }) => v.evidence).join(' | ') };
    }
  }
  return evaluateTruncation3x3x3(cells);
}
