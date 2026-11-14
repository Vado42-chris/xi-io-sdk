import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileImmutableSelection,
  compareImmutableSelection,
  reduceRevisionRead,
  compileAddressableTransaction,
  reduceAddressableTransaction,
} from '../src/mutation/addressable-transaction.mjs';

const selection=()=>({
  workspace_ref:'workspace:one',
  matter_ref:'matter:one',
  artifact_ref:'artifact:one',
  original_ref:'original:one',
  document_ref:'document:one',
  revision:'2',
  source_generation:'source:g1',
  record_ref:'evidence:one',
  proposition_ref:'proposition:one',
});
const plan=()=>compileAddressableTransaction({
  transaction_ref:'tx:one',
  selection:selection(),
  admitted_effect_ref:'effect:one',
  assignment_ref:'assignment:one',
  attempt_ref:'attempt:one',
  ward_admission_ref:'ward:one',
  lease_ref:'lease:one',
  typed_ack_ref:'ack:one',
  expected_post_revision:'3',
  expected_post_generation:'source:g2',
});
const baseObservation=()=>({
  selection:selection(),
  preimage_revision:'2',
  preimage_generation:'source:g1',
  hold:false,
  fuse_state:'OPEN_FOR_OPERATION',
  write_attempted:true,
  write_accepted:true,
  readback_independent:true,
  readback_selection:{...selection(),revision:'3',source_generation:'source:g2'},
  readback_matches_intended:true,
  return_ref:'return:one',
  apply_return_ref:'apply:return:one',
  return_consumed_ref:'consume:return:one',
  next_input_ref:'work:next',
  wake_acknowledged:true,
});

test('transaction preimage must be the selected revision and generation',()=>{
  for(const override of [
    {expected_revision:'other-revision'},
    {expected_generation:'other-generation'},
  ]) {
    assert.throws(()=>compileAddressableTransaction({
      transaction_ref:'tx:drift',
      selection:selection(),
      expected_post_revision:'3',
      expected_post_generation:'source:g2',
      ...override,
    }),/SELECTION_PREIMAGE_MISMATCH/);
  }
});

test('immutable selection rejects stale proposition, matter, workspace, original and document',()=>{
  const expected=compileImmutableSelection(selection());
  for(const key of ['proposition_ref','matter_ref','workspace_ref','original_ref','document_ref']){
    const observed={...selection(),[key]:key+':changed'};
    const result=compareImmutableSelection(expected,observed);
    assert.equal(result.match,false,key);
    assert.equal(result.drift.includes(key),true,key);
  }
});

test('historical read is exact or unavailable, never current substitution',()=>{
  const expected=compileImmutableSelection(selection());
  assert.equal(reduceRevisionRead(expected,{...selection(),state:'FOUND'}).state,'EXACT');
  const substituted=reduceRevisionRead(expected,{...selection(),revision:'49',state:'FOUND'});
  assert.equal(substituted.state,'REFUSED');
  assert.equal(substituted.first_red,'CURRENT_REVISION_SUBSTITUTION_FORBIDDEN');
  const unavailable=reduceRevisionRead(expected,{...selection(),state:'UNAVAILABLE'});
  assert.equal(unavailable.state,'UNAVAILABLE');
  assert.equal(unavailable.returned_revision,null);
  const wrongMatterUnavailable=reduceRevisionRead(expected,{...selection(),matter_ref:'matter:other',state:'UNAVAILABLE'});
  assert.equal(wrongMatterUnavailable.state,'REFUSED');
  assert.equal(wrongMatterUnavailable.first_red,'SELECTION_DRIFT_MATTER_REF');
});

test('dirty unsaved buffer blocks mutation before write',()=>{
  const result=reduceAddressableTransaction(plan(),{...baseObservation(),dirty_buffer:true,write_attempted:false,write_accepted:false});
  assert.equal(result.first_red,'DIRTY_BUFFER_BLOCKS_MUTATION');
  assert.equal(result.write_accepted,false);
});

test('CAS rejects revision or generation drift',()=>{
  for(const patch of [{preimage_revision:'3'},{preimage_generation:'source:g2'}]){
    const result=reduceAddressableTransaction(plan(),{...baseObservation(),...patch,write_attempted:false,write_accepted:false});
    assert.equal(result.first_red,'PREIMAGE_CAS_MISMATCH');
  }
});

test('missing admitted effect evidence cannot reach write pass',()=>{
  const p=compileAddressableTransaction({
    transaction_ref:'tx:no-ack',
    selection:selection(),
    expected_post_revision:'3',
    expected_post_generation:'source:g2',
  });
  const result=reduceAddressableTransaction(p,{...baseObservation(),write_attempted:false,write_accepted:false});
  assert.equal(result.first_red,'ADMITTED_EFFECT_EVIDENCE_INCOMPLETE');
});

test('post-write readback mismatch requires rollback and never passes',()=>{
  const result=reduceAddressableTransaction(plan(),{...baseObservation(),readback_matches_intended:false,rollback_verified:false});
  assert.equal(result.first_red,'READBACK_MISMATCH');
  assert.equal(result.rollback_required,true);
  assert.equal(result.state,'OPEN');
});

test('return written is not consumed return',()=>{
  const result=reduceAddressableTransaction(plan(),{
    ...baseObservation(),
    apply_return_ref:null,
    return_consumed_ref:null,
    next_input_ref:null,
    wake_acknowledged:false,
  });
  assert.equal(result.return_written,true);
  assert.equal(result.return_consumed,false);
  assert.equal(result.first_red,'APPLY_RETURN_MISSING');
});

test('apply return still does not mean consumed',()=>{
  const result=reduceAddressableTransaction(plan(),{
    ...baseObservation(),
    return_consumed_ref:null,
    next_input_ref:null,
    wake_acknowledged:false,
  });
  assert.equal(result.apply_return,true);
  assert.equal(result.return_consumed,false);
  assert.equal(result.first_red,'RETURN_NOT_CONSUMED');
});

test('consumed return still requires acknowledged N+1',()=>{
  const result=reduceAddressableTransaction(plan(),{
    ...baseObservation(),
    next_input_ref:null,
    wake_acknowledged:false,
  });
  assert.equal(result.return_consumed,true);
  assert.equal(result.first_red,'N_PLUS_1_NOT_ACKNOWLEDGED');
});

test('exact full lifecycle passes without granting authority',()=>{
  const result=reduceAddressableTransaction(plan(),baseObservation());
  assert.equal(result.state,'PASS');
  assert.equal(result.first_red,null);
  assert.equal(result.effect_authority,0);
  assert.equal(result.authority_granted,false);
  assert.equal(result.provider_effect,false);
});

test('successful version advance validates expected postimage rather than preimage revision',()=>{
  const result=reduceAddressableTransaction(plan(),baseObservation());
  assert.equal(result.state,'PASS');
  assert.equal(result.readback_match,true);
});

test('wrong postimage revision or generation is readback drift and requires rollback',()=>{
  for(const patch of [
    {readback_selection:{...selection(),revision:'4',source_generation:'source:g2'}},
    {readback_selection:{...selection(),revision:'3',source_generation:'source:g3'}},
  ]){
    const result=reduceAddressableTransaction(plan(),{...baseObservation(),...patch,rollback_verified:false});
    assert.equal(result.state,'OPEN');
    assert.equal(result.rollback_required,true);
    assert.match(result.first_red,/SELECTION_DRIFT_(REVISION|SOURCE_GENERATION)/);
  }
});

test('selection identity refuses object coercion and non-string revision tokens',()=>{
 const input=selection();
 assert.throws(()=>compileImmutableSelection({...input,matter_ref:{toString:()=>input.matter_ref}}),/MATTER_REF_REQUIRED/);
 assert.throws(()=>compileImmutableSelection({...input,record_ref:{toString:()=>input.record_ref}}),/INVALID_OPTIONAL_REFERENCE/);
 assert.throws(()=>compileImmutableSelection({...input,revision:2}),/REVISION_REQUIRED/);
});

test('historical read refuses failure or missing provider state, even with matching revision',()=>{
 const selected=compileImmutableSelection(selection());
 for(const state of [undefined,'ERROR','DENIED','STALE']){
   const result=reduceRevisionRead(selected,{...selection(),state});
   assert.equal(result.state,'REFUSED',String(state));
   assert.equal(result.first_red,'REVISION_READ_STATE_UNVERIFIED');
 }
});

test('lifecycle refuses coerced receipt objects as return and next-work evidence',()=>{
 for(const [key,reason] of [
   ['return_ref','RETURN_NOT_WRITTEN'],
   ['apply_return_ref','APPLY_RETURN_MISSING'],
   ['return_consumed_ref','RETURN_NOT_CONSUMED'],
   ['next_input_ref','N_PLUS_1_NOT_ACKNOWLEDGED'],
 ]){
   const result=reduceAddressableTransaction(plan(),{...baseObservation(),[key]:{toString:()=>key+':fake'}});
   assert.equal(result.state,'OPEN',key);
   assert.equal(result.first_red,reason,key);
 }
});

test('lifecycle refuses a coerced fuse state',()=>{
 const fakeFuse={toString:()=> 'OPEN_FOR_OPERATION'};
 const result=reduceAddressableTransaction(plan(),{...baseObservation(),fuse_state:fakeFuse});
 assert.equal(result.state,'OPEN');
 assert.equal(result.first_red,'ADMITTED_EFFECT_EVIDENCE_INCOMPLETE');
});


test('equal missing or malformed identities do not establish exact selection',()=>{
 for(const field of ['workspace_ref','matter_ref','artifact_ref','original_ref','document_ref','revision','source_generation']) {
  for(const value of [undefined,null,'', '   ',42]) {
   const malformed={...selection(),[field]:value};
   assert.equal(compareImmutableSelection(malformed,malformed).match,false,field+':'+value);
  }
 }
 assert.equal(compareImmutableSelection({},{}).match,false);
});
test('revision alone cannot establish an exact or unavailable historical selection',()=>{
 for(const state of ['FOUND','EXACT','UNAVAILABLE']) {
  const result=reduceRevisionRead({revision:'2'},{revision:'2',state});
  assert.equal(result.state,'REFUSED',state);
  assert.equal(result.authority_granted,false);
 }
});
test('malformed optional identities are refused without disallowing variable references',()=>{
 for(const field of ['record_ref','proposition_ref']) {
  const malformed={...selection(),[field]:42};
  assert.equal(compareImmutableSelection(malformed,malformed).match,false);
 }
 const variable={...selection(),workspace_ref:'tenant-defined/α',matter_ref:'custom:project',record_ref:null,proposition_ref:null};
 assert.equal(compareImmutableSelection(variable,variable).match,true);
});
