#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileUserExperienceSocratic } from '../src/evaluation/user-experience-socratic.mjs';

const q = (id, parent=null, overrides={}) => ({
  question_id:id, node_kind:'QUESTION', parent_question_id:parent,
  owner_ref:`owner:${id}`, evidence_requirement_ref:`evidence-contract:${id}`,
  evidence_refs:[`evidence:${id}:1`], affected_consumer_refs:[`consumer:${id}`],
  required_bit:1, material_bit:1, atomic_bit:1,
  template_found_bit:0, primitive_found_bit:0, new_class_bit:0, user_choice_bit:0, selected_bit:0,
  expected_known_bit:1, expected_value_bit:1,
  observed_known_bit:1, observed_value_bit:1,
  ...overrides,
});
const g = (id, parent=null, overrides={}) => ({
  question_id:id, node_kind:'GROUP', parent_question_id:parent,
  owner_ref:null, evidence_requirement_ref:null, evidence_refs:[], affected_consumer_refs:[],
  required_bit:1, material_bit:1, atomic_bit:0,
  template_found_bit:0, primitive_found_bit:0, new_class_bit:0, user_choice_bit:0, selected_bit:0,
  expected_known_bit:0, expected_value_bit:0, observed_known_bit:0, observed_value_bit:0,
  ...overrides,
});
const base = () => ({
  root_ref:'root:ux', user_ref:'user:human', experience_ref:'experience:checkout', source_generation:'g1',
  questions:[g('ROOT'), q('SEE','ROOT'), q('UNDERSTAND','ROOT'), q('ACT','ROOT')],
});
let checks=0;

{
  const out=compileUserExperienceSocratic(base());
  assert.equal(out.root_state,'PASS'); assert.equal(out.terminal,true); assert.equal(out.denominator,3); assert.equal(out.next,null); checks+=4;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='UNDERSTAND'),{observed_known_bit:0,observed_value_bit:0,evidence_refs:[],selected_bit:1});
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'UNKNOWN'); assert.equal(out.first_red.question_id,'UNDERSTAND'); assert.equal(out.next.action,'OBSERVE_OR_HOLD_MISSING_BRIDGE'); checks+=3;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,selected_bit:1});
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'FAIL'); assert.equal(out.next.action,'HOT_PATCH_OR_COLLIDE_EXISTING_OWNER'); checks+=2;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,template_found_bit:1,selected_bit:1});
  assert.equal(compileUserExperienceSocratic(x).next.action,'ADOPT_VERIFY_EXISTING'); checks++;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,new_class_bit:1,selected_bit:1});
  assert.equal(compileUserExperienceSocratic(x).next.action,'HOT_PATCH_NEW_CLASS'); checks++;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_known_bit:0,observed_value_bit:0,evidence_refs:[],user_choice_bit:1,selected_bit:1});
  assert.equal(compileUserExperienceSocratic(x).next.action,'USER_CHOICE_REQUIRED'); checks++;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{evidence_refs:[],selected_bit:1});
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.first_red.question_id,'ACT'); assert.ok(out.defects.some(d=>d.question_id==='ACT'&&d.defect==='KNOWN_WITHOUT_EVIDENCE')); checks+=2;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_known_bit:0,observed_value_bit:1});
  assert.throws(()=>compileUserExperienceSocratic(x),/invalid observed unknown encoding/); checks++;
}
{
  const x=base(); x.questions=[g('ROOT'),g('ACTION','ROOT'),q('CLICK','ACTION',{observed_value_bit:0,selected_bit:1}),q('RECOVER','ACTION')];
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'FAIL'); assert.equal(out.cells.find(c=>c.question_id==='ACTION').disposition,'MISMATCH'); checks+=2;
}
{
  const x=base(); x.questions.push(q('DECORATIVE','ROOT',{required_bit:0,material_bit:0,evidence_refs:[]}));
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.denominator,3); assert.deepEqual(out.reap_question_ids,['DECORATIVE']); assert.equal(out.root_state,'PASS'); checks+=3;
}
{
  const x=base(); x.questions.push(q('BAD','ROOT',{required_bit:1,material_bit:0}));
  assert.throws(()=>compileUserExperienceSocratic(x),/required node cannot be non-material/); checks++;
}
{
  const x=base(); x.questions.push(q('ACT','ROOT'));
  assert.throws(()=>compileUserExperienceSocratic(x),/duplicate question_id/); checks++;
}
{
  const x=base(); x.questions.push(q('ORPHAN','MISSING'));
  assert.throws(()=>compileUserExperienceSocratic(x),/unknown parent/); checks++;
}
{
  const x=base(); x.questions=[g('EMPTY')];
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'UNKNOWN'); assert.ok(out.defects.some(d=>d.question_id==='EMPTY'&&d.defect==='NO_REQUIRED_MATERIAL_CHILDREN')); checks+=2;
}
{
  const x=base(); x.questions.push(q('OPTIONAL','ROOT',{required_bit:0,observed_value_bit:0}));
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'PASS'); assert.equal(out.terminal,true); checks+=2;
}
{
  const a=base(); Object.assign(a.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,selected_bit:1});
  const b=structuredClone(a); b.questions.reverse();
  const oa=compileUserExperienceSocratic(a), ob=compileUserExperienceSocratic(b);
  assert.equal(oa.root_state,ob.root_state); assert.equal(oa.first_red.question_id,ob.first_red.question_id); assert.deepEqual(oa.counts,ob.counts); checks+=3;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,new_class_bit:1,template_found_bit:1});
  assert.throws(()=>compileUserExperienceSocratic(x),/new_class conflicts/); checks++;
}
{
  const x=base(); x.questions[0].atomic_bit=1;
  assert.throws(()=>compileUserExperienceSocratic(x),/GROUP must have atomic_bit=0/); checks++;
}
{
  const x=base(); x.questions.find(n=>n.question_id==='ACT').atomic_bit=0;
  assert.throws(()=>compileUserExperienceSocratic(x),/QUESTION must have atomic_bit=1/); checks++;
}
{
  const x={root_ref:'root:x',user_ref:'user:x',experience_ref:'exp:x',source_generation:'g1',questions:[q('OPT',null,{required_bit:0,material_bit:1})]};
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.root_state,'UNKNOWN'); assert.equal(out.terminal,false); assert.ok(out.defects.some(d=>d.question_id==='__ROOT__')); checks+=3;
}
{
  const x={root_ref:'root:x',user_ref:'user:x',experience_ref:'exp:x',source_generation:'g1',questions:[g('A','B'),g('B','A')]};
  assert.throws(()=>compileUserExperienceSocratic(x),/parent cycle/); checks++;
}
{
  const x=base(); x.questions.find(n=>n.question_id==='ACT').node_kind='QUESTION'; x.questions.push(q('CHILD','ACT'));
  assert.throws(()=>compileUserExperienceSocratic(x),/QUESTION cannot have children/); checks++;
}
{
  const x={root_ref:'root:x',user_ref:'user:x',experience_ref:'exp:x',source_generation:'g1',questions:[
    g('ROOT'), g('FLOW','ROOT'), q('DEEP','FLOW',{observed_value_bit:0,selected_bit:1}), q('SHALLOW','ROOT',{observed_known_bit:0,observed_value_bit:0,evidence_refs:[]})
  ]};
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.first_red.question_id,'DEEP'); assert.equal(out.next.action,'HOT_PATCH_OR_COLLIDE_EXISTING_OWNER'); checks+=2;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='SEE'),{observed_known_bit:0,observed_value_bit:0,evidence_refs:[]}); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0});
  const out=compileUserExperienceSocratic(x);
  assert.equal(out.selection_state,'SELECTION_REQUIRED'); assert.equal(out.first_red,null); assert.equal(out.next,null); assert.equal(out.counts.unknown_questions,1); assert.equal(out.counts.mismatch_questions,1); assert.ok(out.defects.some(d=>d.defect==='NEXT_QUESTION_SELECTION_REQUIRED')); checks+=6;
}
{
  const x=base(); Object.assign(x.questions.find(n=>n.question_id==='SEE'),{observed_value_bit:0,selected_bit:1}); Object.assign(x.questions.find(n=>n.question_id==='ACT'),{observed_value_bit:0,selected_bit:1});
  assert.throws(()=>compileUserExperienceSocratic(x),/multiple unresolved questions selected/); checks++;
}
{
  const x=base(); x.questions.find(n=>n.question_id==='ACT').selected_bit=1;
  assert.throws(()=>compileUserExperienceSocratic(x),/selected question must be unresolved red/); checks++;
}

console.log(JSON.stringify({schema:'xiio.sdk.user-experience-socratic-hostiles/v1',result:'PASS',hostiles:26,checks,provider_effects:0,authority_granted:false}));
