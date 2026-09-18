#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileAckItemTrinity } from '../src/acks/item-trinity.mjs';
import { compileChecklistOnboardingPreflight } from '../src/acks/checklist-onboarding-preflight.mjs';

const ackItem = (id) => ({
  item_id:id,
  path_ref:'ack.items.' + id,
  label:'ACK item ' + id,
  applicable_bit:1,
  required_bit:1,
  material_bit:1,
  owner_ref:'owner:' + id,
  work_ref:'work:' + id,
  declared_state:'PASS',
  evidence_refs:['evidence:' + id],
  hex_qualification:{state:'QUALIFIED',receipt_ref:'hex:' + id},
  currentness:{state:'CURRENT',evidence_ref:'current:' + id},
  result_ref:'result:' + id,
  return_ref:'return:' + id,
  apply_return_ref:'apply:' + id,
  reap_state:'DONE',
});

const ackTrinity = () => compileAckItemTrinity({
  schema:'xiio.sdk.ack-item-trinity-input/v1',
  root_ref:'studio:root',
  root_generation:'root:g1',
  studio_root_ref:'studio:suite:current',
  ack_sources:[{
    ack_ref:'ack:portfolio',
    ack_generation:'ack:g1',
    root_generation:'root:g1',
    items:Array.from({length:9},(_,i)=>ackItem('I' + (i + 1))),
  }],
});

const cell = (cell_id, axis, subject_ref, equivalence_ref, overrides={}) => ({
  cell_id,
  axis,
  subject_ref,
  equivalence_ref,
  required_bit:1,
  material_bit:0,
  expected_bit:1,
  observed_known_bit:1,
  observed_value_bit:1,
  evidence_refs:['evidence:' + cell_id],
  ...overrides,
});

const controls = () => [
  cell('TOOL-GITHUB-READ','TOOL','provider.github.read','TOOL_OPERABILITY'),
  cell('TOOL-GITHUB-WRITE','TOOL','provider.github.write','TOOL_OPERABILITY'),
  cell('TOOL-SKILL-REGISTRY','TOOL','skill.registry','TOOL_OPERABILITY'),
  cell('SKILL-SOCRATIC','SKILL','framework.socratic_binary','SKILL_HYDRATION'),
  cell('SKILL-DATA-QUALITY','SKILL','data-analytics.analyze-data-quality','SKILL_HYDRATION'),
  cell('SKILL-VALIDATE-DATA','SKILL','data-analytics.validate-data','SKILL_HYDRATION'),
  cell('LESSON-TRINITY','LESSON','ACK_ITEM_TO_PUNCH_SCORE_CHECKLIST','LESSON_CONSUMED'),
  cell('LESSON-100S','LESSON','CHECKLIST_100S_WAKES_UX_TRIAGE','LESSON_CONSUMED'),
  cell('LESSON-QUANTIZE','LESSON','QUANTIZE_BEFORE_FRACTALIZE','LESSON_CONSUMED'),
  cell('LESSON-OLLAMA','LESSON','BINARY_ATOMS_SIM_ALL_IN_OLLAMA','LESSON_CONSUMED'),
  cell('LESSON-FRACTAL','LESSON','FRACTALIZE_ONLY_DISTINCT_RED_UNKNOWN','LESSON_CONSUMED'),
  cell('WAKE-A','WAKE_TEAM','wake:execute-resolve','WAKE_ROLE_QUALIFICATION',{role:'EXECUTE_RESOLVE'}),
  cell('WAKE-B','WAKE_TEAM','wake:discover-hostile','WAKE_ROLE_QUALIFICATION',{role:'DISCOVER_HOSTILE'}),
  cell('WAKE-C','WAKE_TEAM','wake:ux-qual-quant','WAKE_ROLE_QUALIFICATION',{role:'UX_QUAL_QUANT'}),
  cell('WAKE-O','WAKE_TEAM','wake:observer-rejoin','WAKE_ROLE_QUALIFICATION',{role:'OBSERVER_REJOIN'}),
];

const base = () => ({
  schema:'xiio.sdk.checklist-onboarding-preflight-input/v1',
  root_ref:'ibal:onboarding',
  root_generation:'root:g1',
  registry_ref:'bins:brain-projection:g1',
  ack_trinity:ackTrinity(),
  control_cells:controls(),
  selected_material_cell_refs:Array.from({length:9},(_,i)=>'ACK_TRINITY:ack:portfolio#I' + (i + 1)),
});

let checks = 0;

{
  const out = compileChecklistOnboardingPreflight(base());
  assert.equal(out.checklist_100s,true, JSON.stringify({coverage_score:out.coverage_score, required_denominator:out.required_denominator, pass_count:out.pass_count, nonpass:out.cells.filter((row)=>row.required_bit===1&&row.state!=='PASS').map((row)=>({cell_id:row.cell_id,state:row.state,equivalence_ref:row.equivalence_ref}))})); checks++;
  assert.equal(out.coverage_score,100); checks++;
  assert.equal(out.verification.wake,'DISPATCH_INDEPENDENT_UX_TRIAGE_VERIFICATION'); checks++;
  assert.equal(out.verification.verified_complete,false); checks++;
  assert.equal(out.verification.independent_verifier_required,true); checks++;
  assert.equal(out.formation.active_logical_seat_count,27); checks++;
  assert.equal(out.formation.observer_rejoin_seat_count,9); checks++;
  assert.equal(out.ollama_binary_simulation_plan.exhaustive_atomic_classes,true); checks++;
  assert.equal(out.ollama_binary_simulation_plan.runtime_credit,false); checks++;
  assert.equal(out.provider_effect,false); checks++;
  assert.equal(out.authority_granted,false); checks++;
  assert(out.quantization.compression > 0); checks++;
  assert(out.quantization.quantized_denominator < out.quantization.raw_denominator); checks++;
  assert.equal(out.fractal_wakes.length,0); checks++;
}

{
  const x = base();
  const lesson = x.control_cells.find((row)=>row.cell_id==='LESSON-FRACTAL');
  lesson.observed_value_bit = 0;
  lesson.subproblem_ref = 'subproblem:fractal-rule';
  const out = compileChecklistOnboardingPreflight(x);
  assert.equal(out.checklist_100s,false); checks++;
  assert(out.coverage_score < 100); checks++;
  assert.equal(out.verification.wake,'WAIT_CHECKLIST_100S'); checks++;
  const wake = out.fractal_wakes.find((row)=>row.equivalence_ref==='LESSON_CONSUMED');
  assert.equal(wake.state,'FAIL'); checks++;
  assert.equal(wake.action,'FRACTALIZE_DISTINCT_SUBPROBLEMS'); checks++;
  assert(wake.subproblem_refs.includes('subproblem:fractal-rule')); checks++;
}

{
  const x = base();
  const skill = x.control_cells.find((row)=>row.cell_id==='SKILL-VALIDATE-DATA');
  skill.observed_known_bit = 0;
  skill.observed_value_bit = 0;
  skill.evidence_refs = [];
  const out = compileChecklistOnboardingPreflight(x);
  const skillClass = out.quantization.classes.find((row)=>row.equivalence_ref==='SKILL_HYDRATION');
  assert.equal(skillClass.state,'UNKNOWN'); checks++;
  const wake = out.fractal_wakes.find((row)=>row.equivalence_ref==='SKILL_HYDRATION');
  assert.equal(wake.action,'HOLD_AT_ATOMIC_RED'); checks++;
}

{
  const x = base();
  x.ack_trinity = structuredClone(x.ack_trinity);
  const stillOpen = x.ack_trinity.trinity[0].item_ref;
  assert.equal(x.ack_trinity.trinity[0].checklist.supplied_complete,true); checks++;
  x.ack_trinity.open_item_refs = [stillOpen];
  const out = compileChecklistOnboardingPreflight(x);
  assert.equal(out.checklist_100s,false); checks++;
  const ackCell = out.cells.find((row)=>row.subject_ref===stillOpen);
  assert.equal(ackCell.state,'FAIL'); checks++;
  assert(out.fractal_wakes.some((row)=>row.equivalence_ref==='ACK_TRINITY_ITEM')); checks++;
}

{
  const x = base();
  x.control_cells = x.control_cells.filter((row)=>row.role!=='OBSERVER_REJOIN');
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/missing wake role: OBSERVER_REJOIN/); checks++;
}

{
  const x = base();
  x.selected_material_cell_refs[8] = x.selected_material_cell_refs[0];
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/must be unique/); checks++;
}

{
  const x = base();
  x.selected_material_cell_refs[0] = 'TOOL-GITHUB-READ';
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/selected material cell is non-material/); checks++;
}

{
  const x = base();
  const extras = Array.from({length:19976},(_,i)=>cell(
    'ROUND-' + i,
    'TOOL',
    'rounding:tool:' + i,
    'ROUNDING_GUARD'
  ));
  extras[extras.length - 1].observed_value_bit = 0;
  extras[extras.length - 1].subproblem_ref = 'subproblem:one-open-cell';
  x.control_cells.push(...extras);
  const out = compileChecklistOnboardingPreflight(x);
  assert.equal(out.required_denominator,20000); checks++;
  assert.equal(out.pass_count,19999); checks++;
  assert.equal(out.coverage_score,100); checks++;
  assert.equal(out.checklist_100s,false); checks++;
  assert.equal(out.verification.wake,'WAIT_CHECKLIST_100S'); checks++;
}

{
  const x = base();
  x.control_cells[0].observed_known_bit = 0;
  x.control_cells[0].observed_value_bit = 1;
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/unknown encoding invalid/); checks++;
}

{
  const x = base();
  x.control_cells[0].evidence_refs = [];
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/known control cell requires evidence/); checks++;
}

{
  const x = base();
  x.ack_trinity = structuredClone(x.ack_trinity);
  x.ack_trinity.silent_remainder = 1;
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/ack_trinity accounting incomplete/); checks++;
}

{
  const x = base();
  x.root_generation = 'root:g2';
  assert.throws(()=>compileChecklistOnboardingPreflight(x),/ack_trinity root_generation mismatch/); checks++;
}

console.log(JSON.stringify({
  schema:'xiio.sdk.checklist-onboarding-preflight-validation/v1',
  result:'PASS',
  checks,
  axes:5,
  selected_material_cells:9,
  active_logical_seats:27,
  observer_rejoin_seats:9,
  checklist_100s_wakes_independent_ux_triage:true,
  quantize_before_fractalize:true,
  exhaustive_ollama_binary_plan:true,
  provider_effect:false,
  authority_granted:false
}));
