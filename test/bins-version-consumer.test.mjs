import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {prepareBinsVersionRead,checkBinsVersionReadReturn,readBinsVersionWithWorker}
  from '../src/worker/bins-version-consumer.mjs';

const content=Buffer.from('example');
const sha=createHash('sha256').update(content).digest('hex');
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
    contentBase64:content.toString('base64'),
    authority_granted:false,apply_return_verified:false,
  };
  const matched=checkBinsVersionReadReturn(prepared,read);
  assert.equal(matched.state,'RECEIVER_SCOPE_MATCHED_UNVERIFIED');
  assert.equal(matched.apply_return_verified,false);
  for(const patch of [
    {resource_ref:'wrong'},{version_ref:'wrong'},{bytes:6},
    {sha256:'b'.repeat(64)},{apply_return_verified:true},
    {contentBase64:undefined},{contentBase64:Buffer.from('EXAMPLE').toString('base64')},
    {contentBase64:content.toString('base64')+'!'},
  ]) assert.throws(()=>checkBinsVersionReadReturn(prepared,{...read,...patch}));
});

test('existing worker readFile invoked once with exact BINS scope and matched bytes',async()=>{
  const prepared=make();
  const binding=Object.freeze({worker_ref:'worker:bound'});
  let calls=0;
  const worker={readFile:async(actualBinding,scope)=>{
    calls++;
    assert.strictEqual(actualBinding,binding);
    assert.strictEqual(scope,prepared.scope);
    return {
      schema:'xiio.sdk.worker-connection/v1',state:'REQUESTER_FILE_BYTES_MATCHED',
      ...scope,bytes:content.length,sha256:sha,contentBase64:content.toString('base64'),
      readback_ref:'readback:1',authority_granted:false,apply_return_verified:false,
    };
  }};
  const out=await readBinsVersionWithWorker({prepared,worker,binding});
  assert.equal(calls,1);
  assert.equal(out.state,'RECEIVER_SCOPE_MATCHED_UNVERIFIED');
  assert.equal(out.authority_granted,false);
  assert.equal(out.apply_return_verified,false);
});
test('blocked Ward/broker worker returns typed refusal without retry or false readiness',async()=>{
  const prepared=make();
  let calls=0;
  const worker={readFile:async()=>{calls++;return {
    schema:'xiio.sdk.worker-connection/v1',state:'BLOCKED',
    first_red:'WARD_ADMISSION_UNAVAILABLE',authority_granted:false,
  };}};
  const out=await readBinsVersionWithWorker({prepared,worker,binding:{}});
  assert.equal(calls,1);
  assert.equal(out.state,'BLOCKED');
  assert.equal(out.first_red,'WARD_ADMISSION_UNAVAILABLE');
  assert.equal(out.authority_granted,false);
  assert.equal(out.apply_return_verified,false);
});
test('unbound worker and forged empty metadata-only result fail',async()=>{
  const prepared=make();
  await assert.rejects(readBinsVersionWithWorker({prepared}),/WORKER_UNBOUND/);
  await assert.rejects(readBinsVersionWithWorker({
    prepared,worker:{readFile:async()=>({
      schema:'xiio.sdk.worker-connection/v1',state:'REQUESTER_FILE_BYTES_MATCHED',
      ...prepared.scope,bytes:7,sha256:sha,readback_ref:'readback:1',
      authority_granted:false,apply_return_verified:false
    })}
  }),/RETURN_BYTES_MISSING/);
});

test('optional BINS parent version accepts null or a bounded version reference',()=>{
  assert.equal(make({...event,bins:{...event.bins,parent_version_ref:null}}).parent_version_ref,null);
  assert.equal(make({...event,bins:{...event.bins,parent_version_ref:undefined}}).parent_version_ref,null);
  assert.equal(make().parent_version_ref,'version:0');
});
test('hostile BINS parent version cannot escape bounded metadata projection',()=>{
  for(const parent_version_ref of [
    {path:'/private/legal/record',secret:'internal'}, ['/private/legal/record'],
    '', ' ', 'version with spaces', '/private/legal/record',
    'v'.repeat(193), 42, true,
  ]){
    const e={...event,bins:{...event.bins,parent_version_ref}};
    assert.throws(()=>make(e),{message:'BINS_VERSION_CONSUMER_PARENT_VERSION_INVALID'});
  }
});

const successfulRead=scope=>({schema:'xiio.sdk.worker-connection/v1',
  state:'REQUESTER_FILE_BYTES_MATCHED',...scope,bytes:7,sha256:sha,
  contentBase64:content.toString('base64'),readback_ref:'readback:1',
  authority_granted:false,apply_return_verified:false});

test('async scope replacement cannot substitute a different returned version',async()=>{
  const original=make();
  const prepared={...original};
  const replacement=Object.freeze({...original.scope,version_ref:'version:other'});
  let calls=0;
  await assert.rejects(readBinsVersionWithWorker({prepared,worker:{readFile:async(_binding,scope)=>{
    calls++;
    assert.strictEqual(scope,original.scope);
    await Promise.resolve();
    prepared.scope=replacement;
    return successfulRead(replacement);
  }}}),/READBACK_IDENTITY_MISMATCH/);
  assert.equal(calls,1);
});

test('async parent replacement does not reject correct bytes or misattribute refusal',async()=>{
  for(const blocked of [false,true]){
    const original=make();
    const prepared={...original};
    const result=await readBinsVersionWithWorker({prepared,worker:{readFile:async(_binding,scope)=>{
      await Promise.resolve();
      prepared.scope=Object.freeze({...scope,work_ref:'work:other',resource_ref:'resource:other',version_ref:'version:other'});
      return blocked ? {state:'BLOCKED',first_red:'WARD_ADMISSION_UNAVAILABLE'} : successfulRead(scope);
    }}});
    assert.equal(result.resource_ref,original.scope.resource_ref);
    assert.equal(result.version_ref,original.scope.version_ref);
    if(blocked)assert.equal(result.work_ref,original.scope.work_ref);
    assert.equal(result.authority_granted,false);
  }
});

test('prepared scope accessor is captured once before invoking worker',async()=>{
  const original=make();
  let reads=0;
  const prepared=Object.freeze({...original,get scope(){
    return ++reads===1 ? original.scope : Object.freeze({...original.scope,version_ref:'version:other'});
  }});
  const result=await readBinsVersionWithWorker({prepared,worker:{readFile:async(_binding,scope)=>successfulRead(scope)}});
  assert.equal(reads,1);
  assert.equal(result.version_ref,original.scope.version_ref);
});

test('frozen scope accessors and malformed reconstructed coordinates refuse before IO',async()=>{
  const original=make();
  let calls=0,getters=0;
  for(const scope of [
    Object.freeze({...original.scope,get version_ref(){getters++;return 'version:1';}}),
    Object.freeze({...original.scope,expected_bytes:16385}),
    Object.freeze({...original.scope,expected_sha256:'not-a-digest'}),
    Object.freeze({...original.scope,version_ref:'/private/path'}),
    Object.freeze({...original.scope,extra:'unscoped'}),
  ])await assert.rejects(readBinsVersionWithWorker({prepared:{...original,scope},worker:{readFile:async()=>{calls++;}}}));
  assert.equal(calls,0);
  assert.equal(getters,0);
});
