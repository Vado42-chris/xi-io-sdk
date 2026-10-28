import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createSharedWorkerConnection, inspectLocalAgentStatus, validateLocalAgentTurnReply, normalizeLocalAgentMessage,
  WORKER_CONNECTION_SCHEMA,WORKER_CANARY_TEXT,WORKER_CANARY_SHA256,MAX_WORKER_CANARY_BYTES,
} from '../src/worker/connection.mjs';

const epoch='2026-10-28T14:30:00.000Z';
const identity={provider:'xiio',subject_id:'user-1',login:'owner',observed_via:'provider_api_readback',observed_at:epoch};
const sha='a'.repeat(64);
const base={worker_ref:'worker:loki',device_ref:'device:loki',source_generation:'gen:1',
 account_principal_ref:'xiio:user-1',chosen_by:'person:owner'};
let calls;
let behavior;
function make(){
 calls={readAccount:0,readInstalledWorker:0,observeWorker:0,inspectDisk:0,verifyDisk:0,withCurrentAuthority:0,admit:0,start:0,
   execute:0,readPreserved:0,readRequester:0,readAttempt:0,recover:0};
 behavior={account:{...identity},worker:{schema:'xiio.sdk.installed-worker/v1',state:'INSTALLED_READBACK_VERIFIED',
  worker_ref:base.worker_ref,device_ref:base.device_ref,owner_principal_ref:base.account_principal_ref,
  source_generation:base.source_generation,installed_generation:base.source_generation,
  installation_ref:'installation:loki',binding_ref:'binding:loki',installation_sha256:sha},
  liveness:{schema:'xiio.sdk.worker-liveness/v1',state:'READY',worker_ref:base.worker_ref,
    device_ref:base.device_ref,installed_generation:base.source_generation,installation_sha256:sha,
    observation_ref:'observation:live-1',observed_at:epoch,service_active:true,installed_process_observed:true},
  admission:null,diskOverride:null,verifiedDiskOverride:null,returnOverride:null,brokerReturnOverride:null,attempt:{schema:'xiio.sdk.worker-attempt/v1',state:'STOPPED_VERIFIED',
    worker_ref:base.worker_ref,work_ref:'work:1',evidence_ref:'evidence:stopped'},
  runCanary:null};
 const trusted={
  verifyDiskInspection:async({request,inspection})=>{calls.verifyDisk++;return behavior.verifiedDiskOverride||{
    schema:'xiio.ward.worker-disk-verification/v1',state:'CURRENT_NATIVE_BYTES_VERIFIED',
    inspection_ref:inspection.inspection_ref,request_digest:request.request_digest,
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    installed_generation:request.installed_generation,
    installation_sha256:request.installation_sha256,
    verification_ref:'verify:disk:1',verified_against_current_store:true};},
  admit:async request=>{calls.admit++;return (typeof behavior.admission==='function'?behavior.admission(request):behavior.admission)||{
    schema:'xiio.ward.worker-operation-admission/v1',state:'ADMITTED',
    operation:request.operation,request_digest:request.request_digest,
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
    approval_ref:request.approval_ref,admission_ref:'admission:1',lease_ref:'lease:1',
    expires_at:'2026-10-28T14:40:00.000Z'};},
  startWorker:async({request})=>{calls.start++;return {state:'STARTED',run_ref:'run:1',worker_ref:request.worker_ref,request_digest:request.request_digest};},
  observeWorker:async()=>{calls.observeWorker++;return behavior.liveness;},
  executeCanary:async({request,canary_text,canary_sha256,idempotency_key})=>{calls.execute++;
    assert.equal(idempotency_key,request.request_digest,'Ward executor receives stable atomic claim key');
    assert.equal(canary_text,WORKER_CANARY_TEXT); assert.equal(canary_sha256,WORKER_CANARY_SHA256);
    return behavior.runCanary||{schema:'xiio.switchboard.worker-canary-result/v1',state:'RESULT_PRESERVED',
      worker_ref:request.worker_ref,work_ref:request.work_ref,request_digest:request.request_digest,
      result_ref:'result:1',return_ref:'return:1',resource_ref:'bins:1',version_ref:'version:1',sha256:WORKER_CANARY_SHA256};},
  readPreservedVersion:async request=>{calls.readPreserved++;
    const override=typeof behavior.returnOverride==='function'?behavior.returnOverride(request):behavior.returnOverride;
    return override||{
    schema:'xiio.bins.verified-preserved-version/v1',resource_ref:'bins:1',version_ref:'version:1',
    bytes:Buffer.from(WORKER_CANARY_TEXT),sha256:WORKER_CANARY_SHA256};},
  readRequesterReturnBytes:async(payload)=>{calls.readRequester++;
    behavior.requesterPortArgs=payload;
    const {request,return_ref}=payload;
    return typeof behavior.brokerReturnOverride==='function'
      ?behavior.brokerReturnOverride({request,return_ref})
      :behavior.brokerReturnOverride;},
  recoverWorker:async({request})=>{calls.recover++;return {state:'RECOVERED',recovery_ref:'recovery:1',
    worker_ref:request.worker_ref,request_digest:request.request_digest};}
 };
 const ports={
  readAccount:async()=>{calls.readAccount++;return behavior.account;},
  readInstalledWorker:async()=>{calls.readInstalledWorker++;return behavior.worker;},
  observeWorker:async()=>{calls.observeWorker++;return behavior.liveness;},
  inspectInstalledFramework:async({request})=>{calls.inspectDisk++;
    return (typeof behavior.diskOverride==='function'?behavior.diskOverride(request):behavior.diskOverride)||{
    schema:'xiio.sdk.worker-disk-inspection/v1',state:'ON_DISK_BYTES_REOPENED',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    source_generation:request.source_generation,installed_generation:request.installed_generation,
    installation_sha256:request.installation_sha256,
    request_digest:request.request_digest,
    inspection_ref:'inspection:1',observed_at:epoch};},
  readAttempt:async({operation})=>{calls.readAttempt++;
    if(operation==='worker.start')return behavior.startAttempt||{schema:'xiio.sdk.worker-attempt/v1',state:'NO_ATTEMPT',worker_ref:base.worker_ref,work_ref:'work:1'};
    if(operation==='worker.canary')return behavior.canaryAttempt||{schema:'xiio.sdk.worker-attempt/v1',state:'NO_ATTEMPT',worker_ref:base.worker_ref,work_ref:'work:1'};
    return behavior.attempt;},
  withCurrentAuthority:async(_envelope,callback)=>{calls.withCurrentAuthority++;return callback(trusted);}
 };
 return createSharedWorkerConnection({ports,clock:()=>epoch});
}
async function bound(o){const result=await o.bind(base);assert.equal(result.state,'BINDING_OBSERVED');return result;}
const scope={work_ref:'work:1',approval_ref:'approval:1'};

test('constructor requires all trustworthy ports, no permissive defaults',()=>{
 assert.throws(()=>createSharedWorkerConnection({}),/SDK_WORKER_PORTS_UNBOUND/);
});
test('observed provider/account uses SDK stable subject, not provider login or token',async()=>{
 const o=make(),b=await bound(o);
 assert.equal(b.owner_principal_ref,'xiio:user-1');
 assert.equal(b.authority_granted,false);
 assert.equal(b.provider_effect,false);
 assert.match(b.binding_digest,/^[a-f0-9]{64}$/);
});
test('unobserved provider account fails without startup',async()=>{
 const o=make();behavior.account.observed_via='typed_login';
 const b=await o.bind(base);assert.equal(b.state,'BLOCKED');assert.equal(calls.start,0);
});
test('wrong selected account fails rather than relabeling owner',async()=>{
 const o=make(),b=await o.bind({...base,account_principal_ref:'xiio:other'});
 assert.equal(b.state,'BLOCKED');assert.equal(calls.start,0);
});
test('installed generation mismatch fails before any effects',async()=>{
 const o=make();behavior.worker.installed_generation='gen:old';
 const b=await o.bind(base);assert.equal(b.first_red,'WORKER_INSTALLED_IDENTITY_MISMATCH');
 assert.equal(calls.start,0);
});
test('fresh liveness observed without granting authority',async()=>{
 const o=make(),b=await bound(o);const r=await o.observeLiveness(b);
 assert.equal(r.state,'LIVENESS_OBSERVED');assert.equal(r.authority_granted,false);
 assert.equal(calls.withCurrentAuthority,0);
});
test('stale liveness is not live proof',async()=>{
 const o=make(),b=await bound(o);behavior.liveness.observed_at='2026-10-28T14:29:00.000Z';
 const r=await o.observeLiveness(b);assert.equal(r.first_red,'WORKER_LIVENESS_STALE');
});
test('Ward-admitted startup and physical liveness compose once',async()=>{
 const o=make(),b=await bound(o),r=await o.start(b,scope);
 assert.equal(r.state,'STARTED_OBSERVED');assert.equal(calls.start,1);
 assert.equal(calls.withCurrentAuthority,1);assert.equal(calls.admit,1);
 assert.equal(r.authority_granted,false);
});
test('Ward missing/incorrect proof rejects before startup',async()=>{
 const o=make(),b=await bound(o);behavior.admission={state:'ADMITTED',operation:'worker.start'};
 const r=await o.start(b,scope);assert.equal(r.first_red,'WARD_ADMISSION_REQUEST_MISMATCH');
 assert.equal(calls.start,0);
});
test('stale worker source blocks startup despite old binding',async()=>{
 const o=make(),b=await bound(o);behavior.worker.installed_generation='gen:old';
 const r=await o.start(b,scope);assert.equal(r.first_red,'WORKER_BINDING_NOT_CURRENT');
 assert.equal(calls.start,0);assert.equal(calls.withCurrentAuthority,0);
});
test('approved canary uses independently reopened BINS bytes',async()=>{
 const o=make(),b=await bound(o),r=await o.canary(b,scope);
 assert.equal(r.state,'CANARY_RETURN_VERIFIED');assert.equal(calls.execute,1);
 assert.equal(calls.readPreserved,1);assert.equal(r.sha256,WORKER_CANARY_SHA256);
 assert.equal(Buffer.from(r.data_base64,'base64').toString(),WORKER_CANARY_TEXT);
 assert.equal(r.apply_return_verified,false);
});
test('returned worker receipt alone cannot prove bytes',async()=>{
 const o=make(),b=await bound(o);
 behavior.returnOverride={schema:'xiio.bins.verified-preserved-version/v1',resource_ref:'bins:1',version_ref:'version:1',sha256:WORKER_CANARY_SHA256};
 const r=await o.canary(b,scope);
 assert.equal(r.first_red,'BINS_PRESERVED_BYTES_NOT_REOPENED');
});
test('BINS tampered bytes must not be promoted',async()=>{
 const o=make(),b=await bound(o);
 behavior.returnOverride={schema:'xiio.bins.verified-preserved-version/v1',resource_ref:'bins:1',version_ref:'version:1',bytes:Buffer.from('tampered'),sha256:WORKER_CANARY_SHA256};
 const r=await o.canary(b,scope);assert.equal(r.state,'BLOCKED');
 assert.ok(/BINS_PRESERVED/.test(r.first_red));
});
test('invalid request digest in result cannot reach BINS',async()=>{
 const o=make(),b=await bound(o);
 behavior.runCanary={schema:'xiio.switchboard.worker-canary-result/v1',state:'RESULT_PRESERVED',
   worker_ref:base.worker_ref,work_ref:'work:1',request_digest:'f'.repeat(64)};
 const r=await o.canary(b,scope);
 assert.equal(r.first_red,'WORKER_RESULT_IDENTITY_MISMATCH');assert.equal(calls.readPreserved,0);
});
test('uncertain interrupted attempt never executes retry or recovery',async()=>{
 const o=make(),b=await bound(o);behavior.attempt.state='UNKNOWN';
 const r=await o.recover(b,scope);
 assert.equal(r.first_red,'WORKER_RECOVERY_UNCERTAIN_DO_NOT_RETRY');
 assert.equal(calls.recover,0);assert.equal(calls.withCurrentAuthority,0);
});
test('verified stopped attempt recovers under fresh Ward admission',async()=>{
 const o=make(),b=await bound(o);const r=await o.recover(b,scope);
 assert.equal(r.state,'RECOVERED_OBSERVED');assert.equal(calls.recover,1);
 assert.equal(calls.withCurrentAuthority,1);
});
test('attempt with wrong Work never replays or recovers',async()=>{
 const o=make(),b=await bound(o);behavior.attempt.work_ref='work:foreign';
 const r=await o.recover(b,scope);assert.equal(r.first_red,'WORKER_RECOVERY_ATTEMPT_UNVERIFIED');
 assert.equal(calls.recover,0);
});
test('SDK preview status returns observations not fabricated independent install proof',()=>{
 const r=inspectLocalAgentStatus({schema:'xiio.cli.local-agent-http/v1',state:'READY',
   installed_sdk_generation_verified:true,ollama_model_ready:true,execution:'PREVIEW',model:'ollama:local'});
 assert.equal(r.state,'STATUS_OBSERVED');assert.equal(r.installed_generation_independently_verified,false);
 assert.equal(r.authority_granted,false);
});
test('SDK preview turn remains fail-closed on non-preview worker',()=>{
 const s=inspectLocalAgentStatus({schema:'xiio.cli.local-agent-http/v1',state:'READY',
   installed_sdk_generation_verified:true,ollama_model_ready:true,execution:'BOUNDED'});
 const r=validateLocalAgentTurnReply(s,{schema:'xiio.cli.local-agent-http/v1',state:'ANSWERED',reply:'bad'});
 assert.equal(r.first_red,'SDK_EFFECT_CEILING_NOT_PREVIEW');
});
test('SDK refuses model result without actual bounded response',()=>{
 const s=inspectLocalAgentStatus({schema:'xiio.cli.local-agent-http/v1',state:'READY',
   installed_sdk_generation_verified:true,ollama_model_ready:true,execution:'PREVIEW'});
 const r=validateLocalAgentTurnReply(s,{schema:'wrong',state:'ANSWERED',reply:'text'});
 assert.equal(r.first_red,'SDK_TURN_UNVERIFIED');
});

test('start lost-ACK never launches second copy',async()=>{
 const o=make(),b=await bound(o);
 behavior.startAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'UNKNOWN',worker_ref:base.worker_ref,work_ref:'work:1'};
 const r=await o.start(b,scope);assert.equal(r.first_red,'WORKER_START_UNCERTAIN_DO_NOT_RETRY');
 assert.equal(calls.start,0);assert.equal(calls.withCurrentAuthority,0);
});
test('known already-started worker does not repeat startup',async()=>{
 const o=make(),b=await bound(o);
 behavior.startAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'STARTED_VERIFIED',worker_ref:base.worker_ref,work_ref:'work:1'};
 const r=await o.start(b,scope);assert.equal(r.state,'ALREADY_STARTED_OBSERVED');
 assert.equal(calls.start,0);assert.equal(calls.withCurrentAuthority,0);
});
test('recover interrupted BINS return without re-running canary',async()=>{
 const o=make(),b=await bound(o);
 behavior.attempt={schema:'xiio.sdk.worker-attempt/v1',state:'RESULT_PRESERVED',worker_ref:base.worker_ref,work_ref:'work:1',
  original_request_digest:'b'.repeat(64),result:{schema:'xiio.switchboard.worker-canary-result/v1',state:'RESULT_PRESERVED',
  worker_ref:base.worker_ref,work_ref:'work:1',request_digest:'b'.repeat(64),result_ref:'result:old',
  return_ref:'return:old',resource_ref:'bins:1',version_ref:'version:1',sha256:WORKER_CANARY_SHA256}};
 const r=await o.recover(b,scope);assert.equal(r.state,'CANARY_RETURN_RECONCILED');
 assert.equal(calls.execute,0);assert.equal(calls.recover,0);assert.equal(calls.readPreserved,1);
});
test('withCurrentAuthority must actually call its checked callback',async()=>{
 const o=createSharedWorkerConnection({ports:{readAccount:async()=>identity,
  readInstalledWorker:async()=>({schema:'xiio.sdk.installed-worker/v1',state:'INSTALLED_READBACK_VERIFIED',
    worker_ref:base.worker_ref,device_ref:base.device_ref,owner_principal_ref:base.account_principal_ref,
    source_generation:base.source_generation,installed_generation:base.source_generation,
    installation_ref:'installation:loki',binding_ref:'binding:loki',installation_sha256:sha}),
  observeWorker:async()=>behavior.liveness,
  inspectInstalledFramework:async({request})=>({
    schema:'xiio.sdk.worker-disk-inspection/v1',state:'ON_DISK_BYTES_REOPENED',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    source_generation:request.source_generation,installed_generation:request.installed_generation,
    installation_sha256:request.installation_sha256,request_digest:request.request_digest,
    inspection_ref:'inspection:1',observed_at:epoch}),
  readAttempt:async()=>({schema:'xiio.sdk.worker-attempt/v1',state:'NO_ATTEMPT',worker_ref:base.worker_ref,work_ref:'work:1'}),
  withCurrentAuthority:async()=>({schema:WORKER_CONNECTION_SCHEMA,authority_granted:false,state:'STARTED_OBSERVED'})},clock:()=>epoch});
 const b=await bound(o),r=await o.start(b,scope);
 assert.equal(r.first_red,'WORKER_RETURN_UNQUALIFIED');
});

test('SDK preview message gate refuses oversized and empty payloads',()=>{
 assert.equal(normalizeLocalAgentMessage('').first_red,'MESSAGE_INVALID_OR_OVERSIZE');
 assert.equal(normalizeLocalAgentMessage('x'.repeat(16_385)).first_red,'MESSAGE_INVALID_OR_OVERSIZE');
 assert.equal(normalizeLocalAgentMessage(' ping ').message,'ping');
});

test('lost ACK returns exact original Work and existing attempt-reconciliation owner',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'UNKNOWN',
    worker_ref:base.worker_ref,work_ref:'work:1'};
  const x=await o.canary(b,scope);
  assert.equal(x.state,'BLOCKED');
  assert.equal(x.first_red,'WORKER_CANARY_RECONCILE_FIRST_DO_NOT_RETRY');
  assert.equal(x.blocked_operation.operation,'worker.canary');
  assert.equal(x.blocked_operation.work_ref,'work:1');
  assert.equal(x.required_repair.owner_ref,'EXISTING_SWITCHBOARD_ATTEMPT_OWNER');
  assert.equal(x.required_repair.action,'RECONCILE_EXISTING_ATTEMPT_WITHOUT_REEXECUTION');
  assert.equal(x.required_repair.owner_approval_needed,false);
  assert.equal(calls.withCurrentAuthority,0);assert.equal(calls.execute,0);
});
test('stale bound worker returns native runtime owner repair without retry',async()=>{
  const o=make(),b=await bound(o);
  behavior.worker.installed_generation='gen:stale';
  const x=await o.start(b,scope);
  assert.equal(x.first_red,'WORKER_BINDING_NOT_CURRENT');
  assert.equal(x.blocked_operation.operation,'worker.start');
  assert.equal(x.required_repair.owner_ref,'EXISTING_LOCAL_RUNTIME_OWNER');
  assert.equal(x.next_action,'RETURN_BLOCKED_ACK_TO_ORIGINAL_WORK_OWNER');
  assert.equal(calls.start,0);
});
test('file-reader missing return capability reports exact existing broker repair owner',async()=>{
  const o=make(),b=await bound(o);
  const bytes=Buffer.from('public test');
  const digest=createHash('sha256').update(bytes).digest('hex');
  const x=await o.readFile(b,{
    work_ref:'work:1',approval_ref:'approval:1',return_ref:'return:1',
    work_generation:'g1',resource_ref:'bins:1',version_ref:'version:1',
    storage_binding_ref:'binding:1',expected_sha256:digest,expected_bytes:bytes.length});
  assert.equal(x.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
  assert.equal(x.blocked_operation.operation,'worker.file-read');
  assert.equal(x.blocked_operation.return_ref,'return:1');
  assert.equal(x.required_repair.owner_ref,'EXISTING_SWITCHBOARD_RETURN_OWNER');
  assert.equal(calls.readRequester,1);
});
test('canary lost ACK blocks redispatch before Ward or worker effects',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'UNKNOWN',
    worker_ref:base.worker_ref,work_ref:'work:1'};
  const result=await o.canary(b,scope);
  assert.equal(result.first_red,'WORKER_CANARY_RECONCILE_FIRST_DO_NOT_RETRY');
  assert.equal(calls.execute,0);assert.equal(calls.withCurrentAuthority,0);
  assert.equal(calls.readPreserved,0);
});
test('canary preserved result requires recovery rather than rerunning',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'RESULT_PRESERVED',
    worker_ref:base.worker_ref,work_ref:'work:1'};
  const result=await o.canary(b,scope);
  assert.equal(result.first_red,'WORKER_CANARY_RECONCILE_FIRST_DO_NOT_RETRY');
  assert.equal(calls.execute,0);assert.equal(calls.withCurrentAuthority,0);
});
test('canary completed return cannot launch a second canary',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'COMPLETE_VERIFIED',
    worker_ref:base.worker_ref,work_ref:'work:1'};
  const result=await o.canary(b,scope);
  assert.equal(result.first_red,'WORKER_CANARY_RECONCILE_FIRST_DO_NOT_RETRY');
  assert.equal(calls.execute,0);
});
test('canary attempt bound to another Work is refused before Ward admission',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'NO_ATTEMPT',
    worker_ref:base.worker_ref,work_ref:'work:foreign'};
  const result=await o.canary(b,scope);
  assert.equal(result.first_red,'WORKER_CANARY_ATTEMPT_UNVERIFIED');
  assert.equal(calls.execute,0);assert.equal(calls.withCurrentAuthority,0);
});
test('canary with mismatched attempt digest is refused before any effect',async()=>{
  const o=make(),b=await bound(o);
  behavior.canaryAttempt={schema:'xiio.sdk.worker-attempt/v1',state:'NO_ATTEMPT',
    worker_ref:base.worker_ref,work_ref:'work:1',operation:'worker.canary',
    request_digest:'f'.repeat(64)};
  const result=await o.canary(b,scope);
  assert.equal(result.first_red,'WORKER_CANARY_ATTEMPT_UNVERIFIED');
  assert.equal(calls.execute,0);assert.equal(calls.withCurrentAuthority,0);
});

test('disk inspection is a mandatory runtime port, not a claimed status',()=>{
  assert.throws(()=>createSharedWorkerConnection({ports:{
    readAccount:async()=>identity,readInstalledWorker:async()=>null,
    observeWorker:async()=>null,readAttempt:async()=>null,withCurrentAuthority:async()=>null,
  }}),/SDK_WORKER_PORTS_UNBOUND/);
});
test('forged on-disk binary hash denies worker start before Ward/executor',async()=>{
  const o=make(),b=await bound(o);
  behavior.diskOverride=request=>({
    schema:'xiio.sdk.worker-disk-inspection/v1',state:'ON_DISK_BYTES_REOPENED',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    source_generation:request.source_generation,installed_generation:request.installed_generation,
    installation_sha256:'f'.repeat(64),request_digest:request.request_digest,
    inspection_ref:'inspection:forged',observed_at:epoch});
  const x=await o.start(b,scope);
  assert.equal(x.first_red,'WORKER_DISK_INSPECTION_UNVERIFIED');
  assert.equal(x.blocked_operation.operation,'worker.start');
  assert.equal(x.required_repair.action,'REOPEN_INSTALLED_FRAMEWORK_BYTES');
  assert.equal(calls.withCurrentAuthority,0);assert.equal(calls.start,0);
});
test('stale native disk observation rejects before Ward/executor',async()=>{
  const o=make(),b=await bound(o);
  behavior.diskOverride=request=>({
    schema:'xiio.sdk.worker-disk-inspection/v1',state:'ON_DISK_BYTES_REOPENED',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    source_generation:request.source_generation,installed_generation:request.installed_generation,
    installation_sha256:request.installation_sha256,request_digest:request.request_digest,
    inspection_ref:'inspection:stale',observed_at:'2026-10-28T14:29:00.000Z'});
  const x=await o.start(b,scope);
  assert.equal(x.first_red,'WORKER_DISK_INSPECTION_STALE');
  assert.equal(calls.withCurrentAuthority,0);assert.equal(calls.start,0);
});
test('Ward must independently verify installed bytes before admission',async()=>{
  const o=make(),b=await bound(o);
  behavior.verifiedDiskOverride={schema:'xiio.ward.worker-disk-verification/v1',
    state:'CURRENT_NATIVE_BYTES_VERIFIED',verification_ref:'verify:fake',
    inspection_ref:'inspection:wrong',verified_against_current_store:true};
  const x=await o.start(b,scope);
  assert.equal(x.first_red,'WARD_DISK_INSPECTION_NOT_VERIFIED');
  assert.equal(x.required_repair.owner_ref,'EXISTING_WARD_RUNTIME_OWNER');
  assert.equal(calls.verifyDisk,1);assert.equal(calls.admit,0);assert.equal(calls.start,0);
});
test('no approval reference is needed to request exact Ward approval challenge',async()=>{
  const o=make(),b=await bound(o);
  behavior.admission=request=>({
    schema:'xiio.ward.worker-operation-admission/v1',state:'APPROVAL_REQUIRED',
    operation:request.operation,worker_ref:request.worker_ref,device_ref:request.device_ref,
    work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
    request_digest:request.request_digest,intent_digest:request.intent_digest,
    approval_ref:null,challenge_ref:'challenge:1',expires_at:'2026-10-28T14:40:00.000Z'});
  const x=await o.start(b,{work_ref:'work:1'});
  assert.equal(x.state,'OWNER_APPROVAL_REQUIRED');
  assert.equal(x.blocked_operation.operation,'worker.start');
  assert.equal(x.blocked_operation.work_ref,'work:1');
  assert.equal(x.challenge_ref,'challenge:1');
  assert.equal(x.owner_approval_needed,true);
  assert.equal(x.required_approval.challenge_ref,'challenge:1');
  assert.equal(x.required_approval.action,'REVIEW_EXISTING_WARD_CHALLENGE');
  assert.equal(x.required_approval.owner_ref,'EXISTING_WARD_RUNTIME_OWNER');
  assert.equal(x.required_approval.approval_granted,false);
  assert.equal(x.authority_granted,false);assert.equal(x.provider_effect,false);
  assert.equal(calls.inspectDisk,1);assert.equal(calls.verifyDisk,1);
  assert.equal(calls.admit,1);assert.equal(calls.start,0);
});
test('foreign or model-forged Ward approval challenge is never accepted',async()=>{
  const o=make(),b=await bound(o);
  behavior.admission=request=>({
    schema:'xiio.ward.worker-operation-admission/v1',state:'APPROVAL_REQUIRED',
    operation:request.operation,worker_ref:request.worker_ref,device_ref:request.device_ref,
    work_ref:'work:foreign',owner_principal_ref:request.owner_principal_ref,
    request_digest:request.request_digest,intent_digest:request.intent_digest,
    approval_ref:null,challenge_ref:'challenge:fake',expires_at:'2026-10-28T14:40:00.000Z'});
  const x=await o.start(b,{work_ref:'work:1'});
  assert.equal(x.first_red,'WARD_APPROVAL_CHALLENGE_UNVERIFIED');
  assert.equal(calls.start,0);
});
test('intent is stable before and after approval; the existing Ward API still controls effect',async()=>{
  const o=make(),b=await bound(o),intents=[];
  behavior.admission=request=>{
    intents.push(request.intent_digest);
    if(request.approval_ref===null)return {
      schema:'xiio.ward.worker-operation-admission/v1',state:'APPROVAL_REQUIRED',
      operation:request.operation,worker_ref:request.worker_ref,device_ref:request.device_ref,
      work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
      request_digest:request.request_digest,intent_digest:request.intent_digest,
      approval_ref:null,challenge_ref:'challenge:1',expires_at:'2026-10-28T14:40:00.000Z'};
    return {schema:'xiio.ward.worker-operation-admission/v1',state:'ADMITTED',
      operation:request.operation,request_digest:request.request_digest,
      worker_ref:request.worker_ref,device_ref:request.device_ref,
      work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
      approval_ref:request.approval_ref,admission_ref:'admission:1',
      lease_ref:'lease:1',expires_at:'2026-10-28T14:40:00.000Z'};
  };
  const waiting=await o.start(b,{work_ref:'work:1'});
  assert.equal(waiting.state,'OWNER_APPROVAL_REQUIRED');assert.equal(calls.start,0);
  const admitted=await o.start(b,scope);
  assert.equal(admitted.state,'STARTED_OBSERVED');assert.equal(calls.start,1);
  assert.equal(intents[0],intents[1]);
});



const FILE_BYTES=Buffer.from('XIIO_SDK_PUBLIC_SYNTHETIC_FILE_V1\\n');
const FILE_SHA=createHash('sha256').update(FILE_BYTES).digest('hex');
const selectedFile={
  work_ref:'work:1',approval_ref:'approval:1',return_ref:'return:job:1',
  work_generation:'workgen:1',resource_ref:'bins:record:1',
  version_ref:'bins:version:1',storage_binding_ref:'binding:source:1',
  expected_sha256:FILE_SHA,expected_bytes:FILE_BYTES.length
};
function nativeBrokerFixture(){
  behavior.brokerReturnOverride=({request})=>({
    schema:'xiio.switchboard.device-return-bytes/v1',state:'BYTES_READBACK',
    returnRef:selectedFile.return_ref,jobRef:'job:1',deviceRef:base.device_ref,workRef:'work:1',
    occurrenceId:'occurrence:1',generation:selectedFile.work_generation,
    resourceRef:selectedFile.resource_ref,versionRef:selectedFile.version_ref,
    storageBindingRef:selectedFile.storage_binding_ref,
    readbackRef:'bins:readback:1',sha256:FILE_SHA,bytes:FILE_BYTES.length,
    encoding:'base64',contentBase64:FILE_BYTES.toString('base64'),
    resultDigest:'a'.repeat(64),returnCertified:false,applyReturn:false
  });
}
test('existing requester-only Switchboard byte return yields real contents, not BINS bypass',async()=>{
  const o=make(),b=await bound(o);nativeBrokerFixture();
  const x=await o.readFile(b,selectedFile);
  assert.equal(x.state,'REQUESTER_FILE_BYTES_MATCHED');
  assert.equal(Buffer.from(x.contentBase64,'base64').toString('utf8'),FILE_BYTES.toString('utf8'));
  assert.equal(x.return_ref,selectedFile.return_ref);
  assert.equal(x.version_ref,selectedFile.version_ref);
  assert.equal(x.sha256,FILE_SHA);assert.equal(x.apply_return_verified,false);
  assert.equal(calls.verifyDisk,1);assert.equal(calls.admit,1);
  assert.equal(calls.execute,0);assert.equal(calls.readRequester,1);
  assert.equal(calls.readPreserved,0,'SDK must NOT call BINS direct for remote content');
});
test('no approval yields exact Ward challenge scoped to the broker return and Work generation',async()=>{
  const o=make(),b=await bound(o);
  behavior.admission=request=>({
    schema:'xiio.ward.worker-operation-admission/v1',state:'APPROVAL_REQUIRED',
    operation:request.operation,worker_ref:request.worker_ref,device_ref:request.device_ref,
    work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
    request_digest:request.request_digest,intent_digest:request.intent_digest,
    approval_ref:null,challenge_ref:'challenge:file:1',expires_at:'2026-10-28T14:40:00.000Z'
  });
  const x=await o.readFile(b,{...selectedFile,approval_ref:null});
  assert.equal(x.state,'OWNER_APPROVAL_REQUIRED');
  assert.equal(x.blocked_operation.return_ref,selectedFile.return_ref);
  assert.equal(x.blocked_operation.work_generation,selectedFile.work_generation);
  assert.equal(x.blocked_operation.resource_ref,selectedFile.resource_ref);
  assert.equal(x.blocked_operation.storage_binding_ref,selectedFile.storage_binding_ref);
  assert.equal(x.blocked_operation.expected_sha256,FILE_SHA);
  assert.equal(calls.readRequester,0);assert.equal(x.authority_granted,false);
});
test('arbitrary direct file paths or embedded payloads refuse before any admission',async()=>{
  const o=make(),b=await bound(o);
  for(const payload of [{path:'/home/private/secret'},{raw_bytes:'secret'},
    {credential:'secret'}, {callback:'bypass'}]){
    const x=await o.readFile(b,{...selectedFile,...payload});
    assert.equal(x.first_red,'WORKER_DIRECT_PATH_OR_UNSCOPED_FIELD_FORBIDDEN');
  }
  assert.equal(calls.inspectDisk,0);assert.equal(calls.withCurrentAuthority,0);
  assert.equal(calls.readRequester,0);
});
test('missing return/work generation/digest/binding and over-limit bytes deny without disclosure',async()=>{
  const o=make(),b=await bound(o);
  const variants=[{return_ref:null},{work_generation:null},{storage_binding_ref:null},
    {expected_sha256:'invalid'},{expected_bytes:16385},{expected_bytes:-1}];
  for(const patch of variants){
    const x=await o.readFile(b,{...selectedFile,...patch});assert.equal(x.state,'BLOCKED');
  }
  assert.equal(calls.inspectDisk,0);assert.equal(calls.readRequester,0);
});
test('metadata-only broker return cannot masquerade as requester bytes',async()=>{
  const o=make(),b=await bound(o);
  behavior.brokerReturnOverride={schema:'xiio.switchboard.device-return-bytes/v1',
    state:'BYTES_READBACK',returnRef:selectedFile.return_ref,workRef:'work:1',
    resourceRef:selectedFile.resource_ref,versionRef:selectedFile.version_ref};
  const x=await o.readFile(b,selectedFile);
  assert.equal(x.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
  assert.equal(calls.readRequester,1);assert.equal(calls.readPreserved,0);
});
test('foreign Work return cannot be credited even with matching bytes and digest',async()=>{
  const o=make(),b=await bound(o);nativeBrokerFixture();
  const f=behavior.brokerReturnOverride;
  behavior.brokerReturnOverride=payload=>({...f(payload),workRef:'work:foreign'});
  const x=await o.readFile(b,selectedFile);
  assert.equal(x.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
});
test('tampered or noncanonical base64 payload fails after requester readback',async()=>{
  const o=make(),b=await bound(o);nativeBrokerFixture();
  const f=behavior.brokerReturnOverride;
  for(const contentBase64 of ['@@',Buffer.from('tampered').toString('base64')]){
    behavior.brokerReturnOverride=payload=>({...f(payload),contentBase64});
    const x=await o.readFile(b,selectedFile);
    assert.equal(x.state,'BLOCKED');
    assert.equal(x.authority_granted,false);
  }
  assert.equal(calls.readPreserved,0);
});
test('changed ResourceVersion cannot be read with a stale approval intent',async()=>{
  const o=make(),b=await bound(o);nativeBrokerFixture();
  const x=await o.readFile(b,{...selectedFile,version_ref:'bins:version:foreign'});
  assert.equal(x.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
});
test('forged local disk inspection blocks requester content before broker read',async()=>{
  const o=make(),b=await bound(o);nativeBrokerFixture();
  behavior.diskOverride=request=>({
    schema:'xiio.sdk.worker-disk-inspection/v1',state:'ON_DISK_BYTES_REOPENED',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    source_generation:request.source_generation,installed_generation:request.installed_generation,
    installation_sha256:'f'.repeat(64),request_digest:request.request_digest,
    inspection_ref:'inspection:forged',observed_at:epoch
  });
  const x=await o.readFile(b,selectedFile);
  assert.equal(x.first_red,'WORKER_DISK_INSPECTION_UNVERIFIED');
  assert.equal(calls.withCurrentAuthority,0);assert.equal(calls.readRequester,0);
});

test('original requester is resolved by native broker, not the target-device metadata',async()=>{
  const o=make(),binding=await bound(o);nativeBrokerFixture();
  const actual=await o.readFile(binding,selectedFile);
  assert.equal(actual.state,'REQUESTER_FILE_BYTES_MATCHED');
  assert.equal(behavior.requesterPortArgs.request.device_ref,'device:loki');
  assert.equal(Object.hasOwn(behavior.requesterPortArgs,'requester_device_ref'),false);
  assert.equal(Object.hasOwn(behavior.requesterPortArgs,'requester_principal_ref'),false);
  assert.equal(behavior.requesterPortArgs.return_ref,selectedFile.return_ref);
});
test('foreign execution target cannot return bytes despite matching Work and digest',async()=>{
  const o=make(),binding=await bound(o);nativeBrokerFixture();
  const original=behavior.brokerReturnOverride;
  behavior.brokerReturnOverride=payload=>({...original(payload),deviceRef:'device:foreign'});
  const result=await o.readFile(binding,selectedFile);
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
  assert.equal(calls.readRequester,1);
  assert.equal(result.provider_effect,false);
});

test('invalid path cannot become an approved file, but routes exact safe Work back to BINS',async()=>{
  const o=make(),b=await bound(o),path='/private/must-not-echo';
  const r=await o.readFile(b,{...selectedFile,path});
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.first_red,'WORKER_DIRECT_PATH_OR_UNSCOPED_FIELD_FORBIDDEN');
  assert.equal(r.blocked_operation.work_ref,selectedFile.work_ref);
  assert.equal(r.blocked_operation.resource_ref,selectedFile.resource_ref);
  assert.equal(r.required_repair.owner_ref,'EXISTING_BINS_RESOURCE_OWNER');
  assert.equal(r.required_repair.action,'RESOLVE_PATH_TO_AUTHORIZED_RESOURCE_VERSION');
  assert.equal(JSON.stringify(r).includes(path),false);
  assert.equal(calls.withCurrentAuthority,0);
});
test('unadmitted file size requires bounded return repair without permission bypass',async()=>{
  const o=make(),b=await bound(o);
  const r=await o.readFile(b,{...selectedFile,expected_bytes:32768});
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.first_red,'WORKER_FILE_SIZE_UNADMITTED');
  assert.equal(r.blocked_operation.expected_bytes,32768);
  assert.equal(r.required_repair.owner_ref,'EXISTING_SWITCHBOARD_RETURN_OWNER');
  assert.equal(r.required_repair.action,'QUALIFY_BOUNDED_FILE_READ_OR_CHUNKED_RETURN');
  assert.equal(r.required_repair.owner_approval_needed,false);
  assert.equal(calls.withCurrentAuthority,0);
});
test('Ward admission mismatch returns the current Ward owner, not a generic unknown repair',async()=>{
  const o=make(),b=await bound(o);
  behavior.admission=request=>({
    schema:'xiio.ward.worker-operation-admission/v1',state:'ADMITTED',
    operation:request.operation,request_digest:'bad-digest',
    worker_ref:request.worker_ref,device_ref:request.device_ref,
    work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
    approval_ref:request.approval_ref,admission_ref:'admission:1',
    lease_ref:'lease:1',expires_at:'2026-10-28T14:40:00.000Z'
  });
  const r=await o.start(b,scope);
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.first_red,'WARD_ADMISSION_REQUEST_MISMATCH');
  assert.equal(r.required_repair.owner_ref,'EXISTING_WARD_RUNTIME_OWNER');
  assert.equal(r.required_repair.action,'REVALIDATE_CURRENT_WARD_SESSION_AND_ADMISSION');
  assert.equal(calls.start,0);
});
