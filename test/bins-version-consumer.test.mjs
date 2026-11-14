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
    assert.deepEqual(scope,prepared.scope);
    assert.equal(Object.isFrozen(scope),true);
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

test('async worker cannot rebind a prepared scope through a frozen getter',async()=>{
  const exact=make();
  const foreign=Object.freeze({...exact.scope,resource_ref:'resource:foreign',version_ref:'version:foreign'});
  let reads=0;
  const prepared=Object.freeze({schema:exact.schema,state:exact.state,
    get scope(){return ++reads===1?exact.scope:foreign;}});
  let seen;
  const result=await readBinsVersionWithWorker({prepared,worker:{readFile:async(_binding,scope)=>{
    seen=scope;
    await Promise.resolve();
    return {schema:'xiio.sdk.worker-connection/v1',state:'REQUESTER_FILE_BYTES_MATCHED',
      ...scope,bytes:content.length,sha256:sha,contentBase64:content.toString('base64'),
      readback_ref:'readback:1',authority_granted:false,apply_return_verified:false};
  }}});
  assert.equal(reads,1);
  assert.equal(seen.resource_ref,'resource:1');
  assert.equal(result.resource_ref,'resource:1');
});
test('rebound worker result is rejected against one pinned original scope',async()=>{
  const exact=make();
  const foreign=Object.freeze({...exact.scope,resource_ref:'resource:foreign'});
  let reads=0;
  const prepared=Object.freeze({schema:exact.schema,state:exact.state,
    get scope(){return ++reads===1?exact.scope:foreign;}});
  await assert.rejects(readBinsVersionWithWorker({prepared,worker:{readFile:async()=>({
    schema:'xiio.sdk.worker-connection/v1',state:'REQUESTER_FILE_BYTES_MATCHED',
    ...foreign,bytes:content.length,sha256:sha,contentBase64:content.toString('base64'),
    readback_ref:'readback:1',authority_granted:false,apply_return_verified:false,
  })}}),/READBACK_IDENTITY_MISMATCH/);
  assert.equal(reads,1);
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

test('continuation refuses foreign operation scope and strips noncontract payload',async()=>{
  const prepared=make();
  const refusal={schema:'xiio.sdk.worker-connection/v1',state:'BLOCKED',
    first_red:'DEVICE_RETURN_BINS_VERIFIER_UNBOUND',authority_granted:false,apply_return_verified:false,
    next_action:'REPAIR_AND_RESUME_ORIGINAL_WORK',
    blocked_operation:{operation:'worker.file-read',...prepared.scope},
    required_repair:{owner_ref:'EXISTING_SWITCHBOARD_RETURN_OWNER',action:'BIND_OR_REPAIR_REQUESTER_ONLY_RETURN_BYTES',owner_approval_needed:false},
    private_payload:'/private/case',credentials:'not-to-forward'};
  const run=value=>readBinsVersionWithWorker({prepared,worker:{readFile:async()=>value}});
  const matched=await run(refusal);
  assert.equal(matched.required_repair.owner_ref,'EXISTING_SWITCHBOARD_RETURN_OWNER');
  assert.doesNotMatch(JSON.stringify(matched),/private|credentials|not-to-forward/);
  for(const patch of [
    {blocked_operation:{...refusal.blocked_operation,version_ref:'version:other'}},
    {blocked_operation:{...refusal.blocked_operation,expected_sha256:'a'.repeat(64)}},
    {schema:'untrusted'}, {authority_granted:true},
    {required_repair:{...refusal.required_repair,owner_ref:'/private/owner'}},
    {required_repair:{...refusal.required_repair,owner_approval_needed:'true'}},
    {required_repair:{...refusal.required_repair,get owner_ref(){return 'EXISTING_WARD_RUNTIME_OWNER';}}},
    {blocked_operation:{...refusal.blocked_operation,get version_ref(){return prepared.scope.version_ref;}}},
  ])await assert.rejects(run({...refusal,...patch}),/BINS_VERSION_CONSUMER_/);
});

test('approval continuation rejects false approval and mismatched challenge identity',async()=>{
  const prepared=make();
  const approval={schema:'xiio.sdk.worker-connection/v1',state:'OWNER_APPROVAL_REQUIRED',
    first_red:'WARD_EXACT_OWNER_APPROVAL_REQUIRED',authority_granted:false,apply_return_verified:false,
    owner_approval_needed:true,next_action:'REVIEW_EXISTING_WARD_CHALLENGE',
    challenge_ref:'challenge:1',expires_at:'2026-11-14T22:00:00.000Z',
    blocked_operation:{operation:'worker.file-read',...prepared.scope,intent_digest:'a'.repeat(64),request_digest:'b'.repeat(64)},
    required_approval:{owner_ref:'EXISTING_WARD_RUNTIME_OWNER',action:'REVIEW_EXISTING_WARD_CHALLENGE',
      operation:'worker.file-read',work_ref:prepared.scope.work_ref,challenge_ref:'challenge:1',
      expires_at:'2026-11-14T22:00:00.000Z',intent_digest:'a'.repeat(64),request_digest:'b'.repeat(64),approval_granted:false}};
  const run=value=>readBinsVersionWithWorker({prepared,worker:{readFile:async()=>value}});
  assert.equal((await run(approval)).required_approval.approval_granted,false);
  for(const patch of [{approval_granted:true},{work_ref:'work:other'},{challenge_ref:'challenge:other'},
    {request_digest:'c'.repeat(64)},{expires_at:'not-a-date'},{owner_ref:'new-owner'}])
    await assert.rejects(run({...approval,required_approval:{...approval.required_approval,...patch}}),/(?:APPROVAL|CONTINUATION)_UNQUALIFIED/);
  let reads=0;
  await assert.rejects(run({...approval,required_approval:{...approval.required_approval,
    get intent_digest(){reads++;return reads<4?'a'.repeat(64):'/synthetic/private/data';}}}),/CONTINUATION_UNQUALIFIED/);
  assert.equal(reads,0);
});
