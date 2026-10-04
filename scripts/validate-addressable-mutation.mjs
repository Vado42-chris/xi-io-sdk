import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDRESSABLE_MUTATION_CELLS,compileAddressableMutation,reduceAddressableMutation} from '../src/mutation/addressable.mjs';

const plan=compileAddressableMutation({
  mutation_ref:'mutation:canary:001',
  intent_ref:'intent:write-canary',
  artifact_id:'artifact:canary',
  workspace_id:'workspace:aries',
  logical_path:'.xiio/acp-canary.txt',
  capability_ref:'filesystem.write',
  previous_version:'v1',
  previous_digest:'old',
  write:{provider_ref:'remote-desktop',capability_ref:'filesystem.write',tool_name:'write_file',tool_schema_ref:'remote-desktop.write_file/v1',operation_ref:'write:001',authority_ref:'workspace-boundary:aries'},
  read:{provider_ref:'remote-desktop',capability_ref:'filesystem.read',tool_name:'read_file',tool_schema_ref:'remote-desktop.read_file/v1',operation_ref:'read:001',authority_ref:'workspace-boundary:aries'},
  expected:{value_ref:'literal:XIIO_ACP_CANARY_001',digest:'expected-digest'}
});

test('addressable mutation requires independent write/read operation identity',()=>{
  assert.throws(()=>compileAddressableMutation({
    mutation_ref:'m',intent_ref:'i',artifact_id:'a',workspace_id:'w',logical_path:'p',capability_ref:'filesystem.write',
    write:{provider_ref:'same',capability_ref:'filesystem.write',tool_name:'write',tool_schema_ref:'w',operation_ref:'same-op',authority_ref:'auth'},
    read:{provider_ref:'same',capability_ref:'filesystem.read',tool_name:'read',tool_schema_ref:'r',operation_ref:'same-op',authority_ref:'auth'}
  }),/WRITE_AND_READ_OPERATION_MUST_BE_INDEPENDENT/);
});

test('40-cell canary only passes with independent readback, identity, collateral, return and reap',()=>{
  assert.equal(ADDRESSABLE_MUTATION_CELLS.length,40);
  const observation={
    workspace_boundary_verified:true,write_authority_verified:true,write_arguments_bound:true,write_invoked:true,write_accepted:true,
    write_receipt_ref:'receipt:write:001',effect_identity_ref:'effect:001',
    read_authority_verified:true,read_arguments_bound:true,read_invoked:true,read_receipt_ref:'receipt:read:001',
    actual_value:'XIIO_ACP_CANARY_001',actual_digest:'expected-digest',expected_actual_compare:true,byte_match:true,
    actual_path:plan.logical_path,actual_workspace_id:plan.workspace_id,actual_artifact_id:plan.artifact_id,version_lineage_preserved:true,
    unintended_sibling_mutation:false,unintended_parent_mutation:false,unintended_metadata_mutation:false,
    unintended_permission_mutation:false,unintended_provider_mutation:false,
    result_classification:'PASS',return_ref:'return:001',return_readback_verified:true,reap_eligible:true,new_version:'v2'
  };
  const result=reduceAddressableMutation(plan,observation);
  assert.equal(result.denominator,40);
  assert.equal(result.result,'PASS');
  assert.equal(result.first_red,null);
});

test('write receipt without readback cannot pass',()=>{
  const result=reduceAddressableMutation(plan,{
    workspace_boundary_verified:true,write_authority_verified:true,write_arguments_bound:true,write_invoked:true,write_accepted:true,
    write_receipt_ref:'receipt:write:001',effect_identity_ref:'effect:001'
  });
  assert.equal(result.result,'FAIL_CURRENT');
  assert.equal(result.first_red,'READ_AUTHORITY_VERIFIED');
});
