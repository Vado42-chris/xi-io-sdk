export const CHECKLIST_PREFLIGHT_INPUT_SCHEMA = 'xiio.sdk.checklist-onboarding-preflight-input/v1';
export const CHECKLIST_PREFLIGHT_SCHEMA = 'xiio.sdk.checklist-onboarding-preflight/v1';

const AXES = new Set(['TOOL','SKILL','LESSON','WAKE_TEAM']);
const AXIS_EQUIVALENCE = Object.freeze({
  TOOL:'TOOL_OPERABILITY',
  SKILL:'SKILL_HYDRATION',
  LESSON:'LESSON_CONSUMED',
  WAKE_TEAM:'WAKE_ROLE_QUALIFICATION',
});
const WAKE_ROLES = Object.freeze(['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT','OBSERVER_REJOIN']);

const bounded = (value, max = 512) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

function bit(value, label) {
  if (value !== 0 && value !== 1) throw new TypeError(label + ' must be 0|1');
  return value;
}

function refs(value, label) {
  if (!Array.isArray(value)) throw new TypeError(label + ' must be an array');
  const out = value.map((item) => {
    if (!bounded(item)) throw new TypeError(label + ' contains invalid ref');
    return item;
  });
  return [...new Set(out)].sort();
}

function stateOf(cell) {
  if (cell.observed_known_bit === 0) return 'UNKNOWN';
  return cell.observed_value_bit === cell.expected_bit ? 'PASS' : 'FAIL';
}

function normalizeControlCell(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('control cell invalid');
  for (const field of ['cell_id','axis','subject_ref','equivalence_ref']) {
    if (!bounded(raw[field])) throw new TypeError(field + ' required');
  }
  if (!AXES.has(raw.axis)) throw new TypeError('axis invalid: ' + raw.cell_id);
  if (raw.equivalence_ref !== AXIS_EQUIVALENCE[raw.axis]) throw new TypeError('axis equivalence invalid: ' + raw.cell_id);

  const required = bit(raw.required_bit, raw.cell_id + '.required_bit');
  const material = bit(raw.material_bit, raw.cell_id + '.material_bit');
  const expected = bit(raw.expected_bit, raw.cell_id + '.expected_bit');
  if (expected !== 1) throw new TypeError('qualification expected_bit must be 1: ' + raw.cell_id);
  const known = bit(raw.observed_known_bit, raw.cell_id + '.observed_known_bit');
  const value = bit(raw.observed_value_bit, raw.cell_id + '.observed_value_bit');
  if (known === 0 && value === 1) throw new TypeError('unknown encoding invalid: ' + raw.cell_id);

  const evidenceRefs = refs(raw.evidence_refs ?? [], raw.cell_id + '.evidence_refs');
  if (known === 1 && evidenceRefs.length === 0) throw new TypeError('known control cell requires evidence: ' + raw.cell_id);

  let role = null;
  if (raw.axis === 'WAKE_TEAM') {
    if (!bounded(raw.role) || !WAKE_ROLES.includes(raw.role)) throw new TypeError('wake role invalid: ' + raw.cell_id);
    role = raw.role;
  }

  return {
    cell_id: raw.cell_id,
    axis: raw.axis,
    subject_ref: raw.subject_ref,
    equivalence_ref: raw.equivalence_ref,
    required_bit: required,
    material_bit: material,
    expected_bit: expected,
    observed_known_bit: known,
    observed_value_bit: value,
    evidence_refs: evidenceRefs,
    subproblem_ref: bounded(raw.subproblem_ref) ? raw.subproblem_ref : null,
    role,
  };
}

function validateAckTrinity(trinity) {
  if (!trinity || typeof trinity !== 'object' || Array.isArray(trinity)) throw new TypeError('ack_trinity required');
  if (trinity.schema !== 'xiio.sdk.ack-item-trinity/v1') throw new TypeError('ack_trinity schema invalid');
  if (trinity.trinity_accounting_100 !== true || trinity.silent_remainder !== 0) {
    throw new TypeError('ack_trinity accounting incomplete');
  }
  if (!Array.isArray(trinity.trinity) || trinity.trinity.length !== trinity.ack_item_count) {
    throw new TypeError('ack_trinity denominator mismatch');
  }
}

function ackCells(trinity) {
  if (!Array.isArray(trinity.open_item_refs)) throw new TypeError('ack_trinity open_item_refs required');
  const derivedOpen = trinity.trinity.filter((entry) => entry.checklist?.supplied_complete !== true || entry.punch_card?.next === 'RESOLVE_ACK_ITEM').map((entry) => entry.item_ref).sort();
  const suppliedOpen = [...new Set(trinity.open_item_refs)].sort();
  if (JSON.stringify(derivedOpen) !== JSON.stringify(suppliedOpen)) throw new TypeError('ack_trinity open_item_refs mismatch');
  const openRefs = new Set(suppliedOpen);
  return trinity.trinity.map((entry) => {
    if (!bounded(entry.item_ref)) throw new TypeError('ack trinity item_ref invalid');
    const checklistRef = entry.checklist?.checklist_ref;
    const punchRef = entry.punch_card?.card_ref;
    const scoreRef = entry.score_card?.score_ref;
    for (const ref of [checklistRef,punchRef,scoreRef]) {
      if (!bounded(ref)) throw new TypeError('ack trinity projection ref invalid: ' + entry.item_ref);
    }
    const complete = entry.checklist?.supplied_complete === true && !openRefs.has(entry.item_ref) ? 1 : 0;
    return {
      cell_id: 'ACK_TRINITY:' + entry.item_ref,
      axis: 'ACK',
      subject_ref: entry.item_ref,
      equivalence_ref: 'ACK_TRINITY_ITEM',
      required_bit: 1,
      material_bit: entry.punch_card?.material === true ? 1 : 0,
      expected_bit: 1,
      observed_known_bit: 1,
      observed_value_bit: complete,
      evidence_refs: [checklistRef,punchRef,scoreRef].sort(),
      subproblem_ref: complete === 1 ? null : entry.item_ref,
      role: null,
    };
  });
}

function quantize(cells) {
  const groups = new Map();
  for (const cell of cells) {
    if (!groups.has(cell.equivalence_ref)) groups.set(cell.equivalence_ref, []);
    groups.get(cell.equivalence_ref).push(cell);
  }
  return [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([equivalence_ref,members]) => {
    const required = members.filter((member) => member.required_bit === 1);
    const rawStates = members.map((member) => ({ member, state: stateOf(member) }));
    const state = rawStates.some((row) => row.state === 'FAIL')
      ? 'FAIL'
      : rawStates.some((row) => row.state === 'UNKNOWN')
        ? 'UNKNOWN'
        : 'PASS';
    const redMembers = rawStates.filter((row) => row.state === 'FAIL' || row.state === 'UNKNOWN').map((row) => row.member);
    return {
      equivalence_ref,
      state,
      raw_member_count: members.length,
      required_member_count: required.length,
      member_refs: members.map((member) => member.cell_id).sort(),
      red_member_refs: redMembers.map((member) => member.cell_id).sort(),
      subproblem_refs: [...new Set(redMembers.map((member) => member.subproblem_ref).filter(Boolean))].sort(),
    };
  });
}

export function compileChecklistOnboardingPreflight(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  if (input.schema !== CHECKLIST_PREFLIGHT_INPUT_SCHEMA) throw new TypeError('input schema mismatch');
  for (const field of ['root_ref','root_generation','registry_ref']) {
    if (!bounded(input[field])) throw new TypeError(field + ' required');
  }

  validateAckTrinity(input.ack_trinity);
  if (input.ack_trinity.root_generation !== input.root_generation) throw new TypeError('ack_trinity root_generation mismatch');
  if (!Array.isArray(input.control_cells) || input.control_cells.length === 0) throw new TypeError('control_cells required');

  const controls = input.control_cells.map(normalizeControlCell);
  for (const axis of ['TOOL','SKILL','LESSON']) {
    if (!controls.some((cell) => cell.axis === axis && cell.required_bit === 1)) throw new TypeError('missing required qualification axis: ' + axis);
  }
  const seen = new Set();
  for (const cell of controls) {
    if (seen.has(cell.cell_id)) throw new TypeError('duplicate control cell: ' + cell.cell_id);
    seen.add(cell.cell_id);
  }

  const roleMap = new Map();
  for (const cell of controls.filter((cell) => cell.axis === 'WAKE_TEAM')) {
    if (roleMap.has(cell.role)) throw new TypeError('duplicate wake role: ' + cell.role);
    roleMap.set(cell.role, cell);
  }
  for (const role of WAKE_ROLES) {
    if (!roleMap.has(role)) throw new TypeError('missing wake role: ' + role);
    if (roleMap.get(role).required_bit !== 1) throw new TypeError('wake role must be required: ' + role);
  }

  const cells = [...ackCells(input.ack_trinity), ...controls];
  const cellById = new Map(cells.map((cell) => [cell.cell_id,cell]));
  if (cellById.size !== cells.length) throw new TypeError('cell identity collision');

  if (!Array.isArray(input.selected_material_cell_refs) || input.selected_material_cell_refs.length !== 9) {
    throw new TypeError('exactly 9 selected material cell refs required');
  }
  const selected = [...new Set(input.selected_material_cell_refs)];
  if (selected.length !== 9) throw new TypeError('selected material cell refs must be unique');
  for (const ref of selected) {
    const selectedCell = cellById.get(ref);
    if (!selectedCell) throw new TypeError('selected material cell unknown: ' + ref);
    if (selectedCell.material_bit !== 1) throw new TypeError('selected material cell is non-material: ' + ref);
  }

  const required = cells.filter((cell) => cell.required_bit === 1);
  const pass = required.filter((cell) => stateOf(cell) === 'PASS');
  const coverageScore = required.length === 0 ? 0 : Math.round((10000 * pass.length) / required.length) / 100;
  const coverage100 = required.length > 0 && pass.length === required.length;

  const quantized = quantize(cells);
  const ollama = quantized.map((row) => ({
    scenario_ref: 'OLLAMA_SIM:' + row.equivalence_ref,
    equivalence_ref: row.equivalence_ref,
    exhaustive_binary_inputs: [0,1],
    current_state: row.state,
    effect_ceiling: 'NO_EFFECT',
  }));

  const fractal = quantized
    .filter((row) => row.state === 'FAIL' || row.state === 'UNKNOWN')
    .map((row) => ({
      equivalence_ref: row.equivalence_ref,
      state: row.state,
      subproblem_refs: row.subproblem_refs,
      action: row.subproblem_refs.length > 0 ? 'FRACTALIZE_DISTINCT_SUBPROBLEMS' : 'HOLD_AT_ATOMIC_RED',
    }));

  const activeRoles = ['EXECUTE_RESOLVE','DISCOVER_HOSTILE','UX_QUAL_QUANT'];
  const activeSeats = selected.flatMap((cellRef) => activeRoles.map((role) => ({
    seat_ref: cellRef + ':' + role,
    cell_ref: cellRef,
    role,
    authority: 'NO_EFFECT',
  })));
  const observers = selected.map((cellRef) => ({
    seat_ref: cellRef + ':OBSERVER_REJOIN',
    cell_ref: cellRef,
    role: 'OBSERVER_REJOIN',
    mutation_authority: false,
  }));

  return Object.freeze({
    schema: CHECKLIST_PREFLIGHT_SCHEMA,
    root_ref: input.root_ref,
    root_generation: input.root_generation,
    registry_ref: input.registry_ref,
    axes: ['ACK','TOOL','SKILL','LESSON','WAKE_TEAM'],
    raw_denominator: cells.length,
    required_denominator: required.length,
    pass_count: pass.length,
    coverage_score: coverageScore,
    checklist_100s: coverage100,
    cells: cells.map((cell) => ({...cell,state:stateOf(cell)})),
    quantization: {
      raw_denominator: cells.length,
      quantized_denominator: quantized.length,
      compression: cells.length - quantized.length,
      classes: quantized,
    },
    ollama_binary_simulation_plan: {
      exhaustive_atomic_classes: true,
      scenario_denominator: ollama.length,
      scenarios: ollama,
      simulation_credit_only: true,
      runtime_credit: false,
      provider_effect: false,
    },
    fractal_wakes: fractal,
    formation: {
      selected_material_cell_count: selected.length,
      active_logical_seat_count: activeSeats.length,
      observer_rejoin_seat_count: observers.length,
      active_seats: activeSeats,
      observer_rejoin_seats: observers,
    },
    verification: {
      wake: coverage100 ? 'DISPATCH_INDEPENDENT_UX_TRIAGE_VERIFICATION' : 'WAIT_CHECKLIST_100S',
      lead_role: 'UX_QUAL_QUANT',
      independent_verifier_required: true,
      verification_receipt_ref: null,
      verified_complete: false,
      state: coverage100 ? 'WAIT_INDEPENDENT_UX_TRIAGE_READBACK' : 'INCOMPLETE',
    },
    provider_effect: false,
    authority_granted: false,
    hard: [
      'ACK_TRINITY!=ACK_CLOSURE',
      'ACK_BINDINGS_COMPLETE + ACK_ITEM_OPEN != CHECKLIST_PASS',
      'CHECKLIST_100S!=VERIFIED_COMPLETE',
      'DISPLAY_SCORE_100!=EXACT_COMPLETION_100',
      'SELECTED_MATERIAL_CELL!=ANY_EXISTING_CELL',
      'CHECKLIST_100S->INDEPENDENT_UX_TRIAGE_WAKE',
      'QUANTIZE!=FRACTALIZE',
      'QUANTIZE_BEFORE_FRACTALIZE',
      'BINARY_ATOMIC_CLASSES->EXHAUSTIVE_OLLAMA_SIM_PLAN',
      'OLLAMA_SIMULATION!=RUNTIME_PROOF',
      'PASS!=RECURSE',
      'FRACTALIZE_ONLY_DISTINCT_RED_UNKNOWN_SUBPROBLEMS',
      'TOOL_VISIBLE!=TOOL_OPERABLE',
      'SKILL_VISIBLE!=SKILL_HYDRATED',
      'LESSON_PRESENT!=LESSON_CONSUMED',
      'WAKE_ROLE_NAMED!=WAKE_ROLE_QUALIFIED',
      'FORMATION_27!=27_PROVIDER_ATTEMPTS',
      'OBSERVER_REJOIN!=MUTATOR',
      'RESULT!=RETURN!=APPLY_RETURN',
    ],
  });
}
