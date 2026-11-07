import crypto from 'node:crypto';

export const ADDRESSABLE_TRANSACTION_SCHEMA='xiio.addressable-transaction/v1';
export const ADDRESSABLE_TRANSACTION_RESULT_SCHEMA='xiio.addressable-transaction-result/v1';

const required=(value,key)=>{
  const text=String(value??'').trim();
  if(!text) throw new Error(key+'_REQUIRED');
  return text;
};
const optional=value=>{
  const text=String(value??'').trim();
  return text||null;
};
const stable=value=>Array.isArray(value)
  ? value.map(stable)
  : value&&typeof value==='object'
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))
    : value;
const digest=value=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export function compileImmutableSelection(input={}){
  const selection=Object.freeze({
    workspace_ref:required(input.workspace_ref,'WORKSPACE_REF'),
    matter_ref:required(input.matter_ref,'MATTER_REF'),
    artifact_ref:required(input.artifact_ref,'ARTIFACT_REF'),
    original_ref:required(input.original_ref,'ORIGINAL_REF'),
    document_ref:required(input.document_ref,'DOCUMENT_REF'),
    revision:required(input.revision,'REVISION'),
    source_generation:required(input.source_generation,'SOURCE_GENERATION'),
    record_ref:optional(input.record_ref),
    proposition_ref:optional(input.proposition_ref),
  });
  return Object.freeze({
    ...selection,
    selection_digest:digest(selection),
    authority_granted:false,
    provider_effect:false,
  });
}

export function compareImmutableSelection(expected,observed={}){
  const keys=['workspace_ref','matter_ref','artifact_ref','original_ref','document_ref','revision','source_generation','record_ref','proposition_ref'];
  const drift=keys.filter(key=>(expected?.[key]??null)!==(observed?.[key]??null));
  return Object.freeze({
    match:drift.length===0,
    drift:Object.freeze(drift),
    first_red:drift.length?('SELECTION_DRIFT_'+drift[0].toUpperCase()):null,
    authority_granted:false,
    provider_effect:false,
  });
}

export function reduceRevisionRead(selection,observation={}){
  const requested=required(selection?.revision,'REQUESTED_REVISION');
  const state=String(observation.state??'').trim().toUpperCase();
  if(state==='UNAVAILABLE'){
    const identity=compareImmutableSelection(selection,{...observation,revision:requested});
    return Object.freeze({
      schema:'xiio.revision-read-result/v1',
      state:identity.match?'UNAVAILABLE':'REFUSED',
      requested_revision:requested,
      returned_revision:null,
      current_substitution:false,
      selection_match:identity.match,
      first_red:identity.match?'REQUESTED_REVISION_UNAVAILABLE':identity.first_red,
      authority_granted:false,
      provider_effect:false,
    });
  }
  const returned=required(observation.revision,'RETURNED_REVISION');
  const identity=compareImmutableSelection(selection,{...observation,revision:returned});
  const exact=returned===requested&&identity.match;
  return Object.freeze({
    schema:'xiio.revision-read-result/v1',
    state:exact?'EXACT':'REFUSED',
    requested_revision:requested,
    returned_revision:returned,
    current_substitution:returned!==requested,
    first_red:exact?null:(returned!==requested?'CURRENT_REVISION_SUBSTITUTION_FORBIDDEN':identity.first_red),
    authority_granted:false,
    provider_effect:false,
  });
}

export function compileAddressableTransaction(input={}){
  const selection=compileImmutableSelection(input.selection||{});
  const expected_revision=required(input.expected_revision??selection.revision,'EXPECTED_REVISION');
  const expected_generation=required(input.expected_generation??selection.source_generation,'EXPECTED_GENERATION');
  const expected_post_revision=required(input.expected_post_revision,'EXPECTED_POST_REVISION');
  const expected_post_generation=required(input.expected_post_generation,'EXPECTED_POST_GENERATION');
  return Object.freeze({
    schema:ADDRESSABLE_TRANSACTION_SCHEMA,
    transaction_ref:required(input.transaction_ref,'TRANSACTION_REF'),
    selection,
    expected_revision,
    expected_generation,
    expected_post_revision,
    expected_post_generation,
    dirty_buffer_ref:optional(input.dirty_buffer_ref),
    admitted_effect_ref:optional(input.admitted_effect_ref),
    assignment_ref:optional(input.assignment_ref),
    attempt_ref:optional(input.attempt_ref),
    ward_admission_ref:optional(input.ward_admission_ref),
    lease_ref:optional(input.lease_ref),
    typed_ack_ref:optional(input.typed_ack_ref),
    effect_authority:0,
    authority_granted:false,
    provider_effect:false,
    hard:Object.freeze([
      'DISPLAYED_SELECTION!=ACTIVE_WORKSPACE',
      'REQUESTED_REVISION!=CURRENT_REVISION',
      'UNAVAILABLE_REVISION!=CURRENT_SUBSTITUTION',
      'DIRTY_BUFFER!=MUTATION_ELIGIBLE',
      'PREIMAGE_DRIFT!=WRITE',
      'WRITE_ACK!=READBACK',
      'READBACK_MISMATCH!=PASS',
      'RETURN_WRITTEN!=RETURN_CONSUMED',
      'RETURN_CONSUMED!=N_PLUS_1_WITHOUT_WAKE',
    ]),
  });
}

export function reduceAddressableTransaction(plan,observation={}){
  if(plan?.schema!==ADDRESSABLE_TRANSACTION_SCHEMA) throw new Error('ADDRESSABLE_TRANSACTION_PLAN_REQUIRED');
  const selection=compareImmutableSelection(plan.selection,observation.selection||{});
  const dirty=observation.dirty_buffer===true||Boolean(plan.dirty_buffer_ref);
  const preimageRevision=optional(observation.preimage_revision);
  const preimageGeneration=optional(observation.preimage_generation);
  const preimageMatch=preimageRevision===plan.expected_revision&&preimageGeneration===plan.expected_generation;
  const admission=[
    plan.admitted_effect_ref,plan.assignment_ref,plan.attempt_ref,plan.ward_admission_ref,plan.lease_ref,plan.typed_ack_ref
  ].every(Boolean)&&observation.hold===false&&['OPEN','OPEN_FOR_OPERATION'].includes(String(observation.fuse_state??'').trim().toUpperCase());
  const writeAttempted=observation.write_attempted===true;
  const writeAccepted=observation.write_accepted===true;
  const readbackIndependent=observation.readback_independent===true;
  const expectedPostSelection=Object.freeze({
    ...plan.selection,
    revision:plan.expected_post_revision,
    source_generation:plan.expected_post_generation,
  });
  const readbackSelection=compareImmutableSelection(expectedPostSelection,observation.readback_selection||{});
  const readbackMatch=readbackIndependent&&readbackSelection.match&&observation.readback_matches_intended===true;
  const rollbackRequired=writeAccepted&&!readbackMatch;
  const rollbackVerified=rollbackRequired?observation.rollback_verified===true:true;
  const returnWritten=Boolean(observation.return_ref);
  const applyReturn=Boolean(observation.apply_return_ref);
  const returnConsumed=Boolean(observation.return_consumed_ref);
  const nPlusOne=Boolean(observation.next_input_ref)&&observation.wake_acknowledged===true;

  let first_red=null;
  if(!selection.match) first_red=selection.first_red;
  else if(dirty) first_red='DIRTY_BUFFER_BLOCKS_MUTATION';
  else if(!preimageMatch) first_red='PREIMAGE_CAS_MISMATCH';
  else if(!admission) first_red='ADMITTED_EFFECT_EVIDENCE_INCOMPLETE';
  else if(!writeAttempted) first_red='WRITE_NOT_ATTEMPTED';
  else if(!writeAccepted) first_red='WRITE_NOT_ACCEPTED';
  else if(!readbackIndependent) first_red='INDEPENDENT_READBACK_REQUIRED';
  else if(!readbackSelection.match) first_red=readbackSelection.first_red;
  else if(observation.readback_matches_intended!==true) first_red='READBACK_MISMATCH';
  else if(!rollbackVerified) first_red='ROLLBACK_UNVERIFIED';
  else if(!returnWritten) first_red='RETURN_NOT_WRITTEN';
  else if(!applyReturn) first_red='APPLY_RETURN_MISSING';
  else if(!returnConsumed) first_red='RETURN_NOT_CONSUMED';
  else if(!nPlusOne) first_red='N_PLUS_1_NOT_ACKNOWLEDGED';

  return Object.freeze({
    schema:ADDRESSABLE_TRANSACTION_RESULT_SCHEMA,
    transaction_ref:plan.transaction_ref,
    state:first_red?'OPEN':'PASS',
    first_red,
    selection_match:selection.match,
    dirty_buffer:dirty,
    preimage_match:preimageMatch,
    admitted_effect_complete:admission,
    write_attempted:writeAttempted,
    write_accepted:writeAccepted,
    independent_readback:readbackIndependent,
    readback_match:readbackMatch,
    rollback_required:rollbackRequired,
    rollback_verified:rollbackVerified,
    return_written:returnWritten,
    apply_return:applyReturn,
    return_consumed:returnConsumed,
    n_plus_1_acknowledged:nPlusOne,
    effect_authority:0,
    authority_granted:false,
    provider_effect:false,
  });
}
