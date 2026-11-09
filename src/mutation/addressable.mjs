import crypto from 'node:crypto';

export const ADDRESSABLE_MUTATION_SCHEMA='xiio.addressable-mutation/v1';
export const ADDRESSABLE_MUTATION_RESULT_SCHEMA='xiio.addressable-mutation-result/v1';
export const ADDRESSABLE_MUTATION_CELLS=Object.freeze([
'INTENT_RESOLVED','WORKSPACE_DISCOVERED','WORKSPACE_BOUNDARY_VERIFIED','TARGET_ARTIFACT_RESOLVED','TARGET_PATH_RESOLVED',
'REQUIRED_CAPABILITY_RESOLVED','WRITE_CAPABILITY_DISCOVERED','WRITE_TOOL_NAME_RESOLVED','WRITE_TOOL_SCHEMA_RESOLVED','WRITE_AUTHORITY_VERIFIED',
'WRITE_ARGUMENTS_BOUND','WRITE_NATIVE_CALL_INVOKED','WRITE_CALL_ACCEPTED','WRITE_RECEIPT_CAPTURED','WRITE_EFFECT_IDENTITY_CAPTURED',
'READ_CAPABILITY_DISCOVERED','READ_TOOL_NAME_RESOLVED','READ_TOOL_SCHEMA_RESOLVED','READ_AUTHORITY_VERIFIED','READ_ARGUMENTS_BOUND',
'READ_NATIVE_CALL_INVOKED','READ_RECEIPT_CAPTURED','READBACK_VALUE_CAPTURED','EXPECTED_VALUE_CAPTURED','EXPECTED_ACTUAL_COMPARE',
'BYTE_MATCH','PATH_MATCH','WORKSPACE_MATCH','ARTIFACT_IDENTITY_PRESERVED','VERSION_LINEAGE_PRESERVED',
'NO_UNINTENDED_SIBLING_MUTATION','NO_UNINTENDED_PARENT_MUTATION','NO_UNINTENDED_METADATA_MUTATION','NO_UNINTENDED_PERMISSION_MUTATION','NO_UNINTENDED_PROVIDER_MUTATION',
'RESULT_CLASSIFIED','FIRST_RED_IDENTIFIED','RETURN_SERIALIZED','RETURN_READABLE_BY_NEXT_AGENT','REAP_ELIGIBILITY_RESOLVED'
]);

const text=(v,k)=>{const s=String(v??'').trim();if(!s)throw new Error(k+'_REQUIRED');return s};
const digest=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const bool=v=>v===true;

export function compileAddressableMutation(input={}){
  const mutation_ref=text(input.mutation_ref,'MUTATION_REF');
  const artifact_id=text(input.artifact_id,'ARTIFACT_ID');
  const workspace_id=text(input.workspace_id,'WORKSPACE_ID');
  const logical_path=text(input.logical_path,'LOGICAL_PATH');
  const write=input.write||{}, read=input.read||{};
  const writeProvider=text(write.provider_ref,'WRITE_PROVIDER_REF');
  const readProvider=text(read.provider_ref,'READ_PROVIDER_REF');
  const writeOperation=text(write.operation_ref,'WRITE_OPERATION_REF');
  const readOperation=text(read.operation_ref,'READ_OPERATION_REF');
  if(writeProvider===readProvider && writeOperation===readOperation) throw new Error('WRITE_AND_READ_OPERATION_MUST_BE_INDEPENDENT');
  return Object.freeze({
    schema:ADDRESSABLE_MUTATION_SCHEMA,
    mutation_ref, artifact_id, workspace_id, logical_path,
    parent_operation_id:input.parent_operation_id||null,
    previous_version:input.previous_version??null,
    previous_digest:input.previous_digest??null,
    intent_ref:text(input.intent_ref,'INTENT_REF'),
    capability_ref:text(input.capability_ref,'CAPABILITY_REF'),
    write:Object.freeze({
      capability_ref:text(write.capability_ref||input.capability_ref,'WRITE_CAPABILITY_REF'),
      provider_ref:writeProvider,
      tool_name:text(write.tool_name,'WRITE_TOOL_NAME'),
      tool_schema_ref:text(write.tool_schema_ref,'WRITE_TOOL_SCHEMA_REF'),
      operation_ref:writeOperation,
      authority_ref:text(write.authority_ref,'WRITE_AUTHORITY_REF')
    }),
    read:Object.freeze({
      capability_ref:text(read.capability_ref,'READ_CAPABILITY_REF'),
      provider_ref:readProvider,
      tool_name:text(read.tool_name,'READ_TOOL_NAME'),
      tool_schema_ref:text(read.tool_schema_ref,'READ_TOOL_SCHEMA_REF'),
      operation_ref:readOperation,
      authority_ref:text(read.authority_ref,'READ_AUTHORITY_REF')
    }),
    expected:Object.freeze({
      value_ref:input.expected?.value_ref||null,
      digest:input.expected?.digest||null,
      path:logical_path,
      workspace_id,
      artifact_id
    }),
    hard:Object.freeze([
      'WRITE_PROVIDER!=READBACK_AUTHORITY_OR_WRITE_OPERATION!=READ_OPERATION',
      'WRITE_RECEIPT!=READBACK_RECEIPT',
      'EFFECT!=CORRECTNESS',
      'MATCH!=CLEAN_SUCCESS_WITHOUT_IDENTITY_AND_COLLATERAL_CHECKS',
      'SUCCESS!=PROMOTION_WITHOUT_REPLAYABLE_RETURN'
    ]),
    effect_authority:0
  });
}

export function reduceAddressableMutation(plan, observation={}){
  if(plan?.schema!==ADDRESSABLE_MUTATION_SCHEMA) throw new Error('ADDRESSABLE_MUTATION_PLAN_REQUIRED');
  const cells={};
  for(const c of ADDRESSABLE_MUTATION_CELLS) cells[c]=false;
  const set=(c,v=true)=>{cells[c]=v===true};

  set('INTENT_RESOLVED',!!plan.intent_ref);
  set('WORKSPACE_DISCOVERED',!!plan.workspace_id);
  set('WORKSPACE_BOUNDARY_VERIFIED',bool(observation.workspace_boundary_verified));
  set('TARGET_ARTIFACT_RESOLVED',!!plan.artifact_id);
  set('TARGET_PATH_RESOLVED',!!plan.logical_path);
  set('REQUIRED_CAPABILITY_RESOLVED',!!plan.capability_ref);
  set('WRITE_CAPABILITY_DISCOVERED',!!plan.write?.capability_ref);
  set('WRITE_TOOL_NAME_RESOLVED',!!plan.write?.tool_name);
  set('WRITE_TOOL_SCHEMA_RESOLVED',!!plan.write?.tool_schema_ref);
  set('WRITE_AUTHORITY_VERIFIED',bool(observation.write_authority_verified));
  set('WRITE_ARGUMENTS_BOUND',bool(observation.write_arguments_bound));
  set('WRITE_NATIVE_CALL_INVOKED',bool(observation.write_invoked));
  set('WRITE_CALL_ACCEPTED',bool(observation.write_accepted));
  set('WRITE_RECEIPT_CAPTURED',!!observation.write_receipt_ref);
  set('WRITE_EFFECT_IDENTITY_CAPTURED',!!observation.effect_identity_ref);
  set('READ_CAPABILITY_DISCOVERED',!!plan.read?.capability_ref);
  set('READ_TOOL_NAME_RESOLVED',!!plan.read?.tool_name);
  set('READ_TOOL_SCHEMA_RESOLVED',!!plan.read?.tool_schema_ref);
  set('READ_AUTHORITY_VERIFIED',bool(observation.read_authority_verified));
  set('READ_ARGUMENTS_BOUND',bool(observation.read_arguments_bound));
  set('READ_NATIVE_CALL_INVOKED',bool(observation.read_invoked));
  set('READ_RECEIPT_CAPTURED',!!observation.read_receipt_ref);
  set('READBACK_VALUE_CAPTURED',observation.actual_value!==undefined||!!observation.actual_digest);
  set('EXPECTED_VALUE_CAPTURED',plan.expected?.value_ref!==null||!!plan.expected?.digest);
  set('EXPECTED_ACTUAL_COMPARE',bool(observation.expected_actual_compare));
  set('BYTE_MATCH',bool(observation.byte_match));
  set('PATH_MATCH',observation.actual_path===plan.logical_path);
  set('WORKSPACE_MATCH',observation.actual_workspace_id===plan.workspace_id);
  set('ARTIFACT_IDENTITY_PRESERVED',observation.actual_artifact_id===plan.artifact_id);
  set('VERSION_LINEAGE_PRESERVED',bool(observation.version_lineage_preserved));
  set('NO_UNINTENDED_SIBLING_MUTATION',observation.unintended_sibling_mutation===false);
  set('NO_UNINTENDED_PARENT_MUTATION',observation.unintended_parent_mutation===false);
  set('NO_UNINTENDED_METADATA_MUTATION',observation.unintended_metadata_mutation===false);
  set('NO_UNINTENDED_PERMISSION_MUTATION',observation.unintended_permission_mutation===false);
  set('NO_UNINTENDED_PROVIDER_MUTATION',observation.unintended_provider_mutation===false);

  const first_red=ADDRESSABLE_MUTATION_CELLS.find(c=>!cells[c])||null;
  set('FIRST_RED_IDENTIFIED',first_red!==null || ADDRESSABLE_MUTATION_CELLS.slice(0,36).every(c=>cells[c]));
  const corePass=ADDRESSABLE_MUTATION_CELLS.slice(0,35).every(c=>cells[c]);
  set('RESULT_CLASSIFIED',observation.result_classification==='PASS' ? corePass : !!observation.result_classification);
  set('RETURN_SERIALIZED',!!observation.return_ref);
  set('RETURN_READABLE_BY_NEXT_AGENT',bool(observation.return_readback_verified));
  set('REAP_ELIGIBILITY_RESOLVED',observation.reap_eligible===true||observation.reap_eligible===false);

  const pass=ADDRESSABLE_MUTATION_CELLS.every(c=>cells[c]);
  return Object.freeze({
    schema:ADDRESSABLE_MUTATION_RESULT_SCHEMA,
    mutation_ref:plan.mutation_ref,
    artifact_id:plan.artifact_id,
    workspace_id:plan.workspace_id,
    logical_path:plan.logical_path,
    cells:Object.freeze(cells),
    passed_cell_count:Object.values(cells).filter(Boolean).length,
    denominator:ADDRESSABLE_MUTATION_CELLS.length,
    first_red:pass?null:(ADDRESSABLE_MUTATION_CELLS.find(c=>!cells[c])||'UNKNOWN_RED'),
    result:pass?'PASS':'FAIL_CURRENT',
    write_receipt_ref:observation.write_receipt_ref||null,
    readback_receipt_ref:observation.read_receipt_ref||null,
    new_version:observation.new_version??null,
    new_digest:observation.actual_digest||null,
    return_ref:observation.return_ref||null,
    replay_digest:digest({plan,observation}),
    effect_authority:0
  });
}
