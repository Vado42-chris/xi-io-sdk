import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBinsVersionRead,checkBinsVersionReadReturn}
  from '../src/worker/bins-version-consumer.mjs';

const sha='a'.repeat(64);
const event={
  schema:'xiio.dataforge.legal-evidence/v1',state:'BINS_CUSTODIED',
  case_ref:'matter:1',event_id:'event:1',
  destination_binding:{registry_ref:'registry:1',registry_generation:'gen:1',binding_ref:'registry-binding:1'},
  source:{sha256:sha,size_bytes:7},
  bins:{resource_ref:'resource:1',version_ref:'version:1',
    parent_version_ref:'version:0',binding_ref:'binding:1',
    custody_coordinate:{resource_ref:'resource:1',version_ref:'version:1',
      sha256:sha,byte_length:7}},
};
const work={work_ref:'work:1',work_generation:'workgen:1',matter_ref:'matter:1'};
const returned={work_ref:'work:1',work_generation:'workgen:1',return_ref:'return:1',
  resource_ref:'resource:1',version_ref:'version:1',storage_binding_ref:'binding:1'};
const make=(e=event,w=work,r=returned)=>
  prepareBinsVersionRead({event:e,work:w,returned:r});

test('exact BINS event produces worker.file-read scope without private paths',()=>{
  const result=make({...event,dataforge_event_ref:'/secret/private/case',
    bins:{...event.bins,source_path:'/private/secret'}});
  assert.deepEqual(Object.keys(result.scope),[
    'work_ref','work_generation','return_ref','resource_ref','version_ref',
    'storage_binding_ref','expected_sha256','expected_bytes']);
  assert.equal(result.scope.expected_bytes,7);
  assert.equal(result.scope.storage_binding_ref,'binding:1');
  assert.notEqual(event.destination_binding.binding_ref,result.scope.storage_binding_ref);
  assert.equal(result.parent_version_ref,'version:0');
  assert.equal(result.authority_granted,false);
  assert.equal(result.apply_return_verified,false);
  assert.doesNotMatch(JSON.stringify(result),/private|secret|previous_receipt/);
});
test('wrong matter, Work, generation, resource, version and binding refused',()=>{
  for(const [e,w,r] of [
    [event,{...work,matter_ref:'matter:other'},returned],
    [event,work,{...returned,work_ref:'work:other'}],
    [event,work,{...returned,work_generation:'workgen:other'}],
    [event,work,{...returned,resource_ref:'resource:other'}],
    [event,work,{...returned,version_ref:'version:other'}],
    [event,work,{...returned,storage_binding_ref:'binding:other'}],
    [{...event,bins:{...event.bins,binding_ref:'binding:other'}},work,returned],
  ]) assert.throws(()=>make(e,w,r),/MISMATCH/);
});
test('unqualified event, missing custody, digest drift and oversize refused',()=>{
  for(const e of [
    {...event,state:'PENDING_READBACK'},
    {...event,bins:{...event.bins,custody_coordinate:null}},
    {...event,bins:{...event.bins,custody_coordinate:{
      ...event.bins.custody_coordinate,sha256:'b'.repeat(64)}}},
    {...event,bins:{...event.bins,custody_coordinate:{
      ...event.bins.custody_coordinate,byte_length:16385}}},
  ]) assert.throws(()=>make(e));
});
test('exact worker return is matched but not promoted to APPLY_RETURN',()=>{
  const prepared=make();
  const read={
    schema:'xiio.sdk.worker-connection/v1',
    state:'REQUESTER_FILE_BYTES_MATCHED',
    ...prepared.scope,
    bytes:7,sha256:sha,readback_ref:'readback:1',
    authority_granted:false,apply_return_verified:false,
  };
  const matched=checkBinsVersionReadReturn(prepared,read);
  assert.equal(matched.state,'RECEIVER_SCOPE_MATCHED_UNVERIFIED');
  assert.equal(matched.apply_return_verified,false);
  for(const patch of [
    {resource_ref:'wrong'},{version_ref:'wrong'},{bytes:6},
    {sha256:'b'.repeat(64)},{apply_return_verified:true},
  ]) assert.throws(()=>checkBinsVersionReadReturn(prepared,{...read,...patch}));
});
