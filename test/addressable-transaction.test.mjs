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
  readback_selection:selection(),
  readback_matches_intended:true,
  return_ref:'return:one',
  apply_return_ref:'apply:return:one',
  return_consumed_ref:'consume:return:one',
  next_input_ref:'work:next',
  wake_acknowledged:true,
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
  const unavailable=reduceRevisionRead(expected,{state:'UNAVAILABLE'});
  assert.equal(unavailable.state,'UNAVAILABLE');
  assert.equal(unavailable.returned_revision,null);
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
  const p=compileAddressableTransaction({transaction_ref:'tx:no-ack',selection:selection()});
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
