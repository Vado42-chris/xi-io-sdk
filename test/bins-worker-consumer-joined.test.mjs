import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSharedWorkerConnection} from '../src/worker/connection.mjs';
import {prepareBinsVersionRead,readBinsVersionWithWorker}
  from '../src/worker/bins-version-consumer.mjs';

const clock='2026-10-28T14:30:00.000Z';
const bytes=Buffer.from('bounded legal record');
const digest=createHash('sha256').update(bytes).digest('hex');
const work={matter_ref:'matter:one',work_ref:'work:one',work_generation:'generation:one'};
const returned={work_ref:work.work_ref,work_generation:work.work_generation,
  return_ref:'return:one',resource_ref:'bins:resource:one',
  version_ref:'bins:version:one',storage_binding_ref:'bins:binding:one'};
const event={
  schema:'xiio.dataforge.legal-evidence/v1',state:'BINS_CUSTODIED',
  event_id:'dataforge:event:one',case_ref:work.matter_ref,
  destination_binding:{registry_ref:'registry:one',registry_generation:'generation:one',
    binding_ref:'destination:binding:one'},
  source:{sha256:digest,size_bytes:bytes.length},
  bins:{resource_ref:returned.resource_ref,version_ref:returned.version_ref,
    binding_ref:returned.storage_binding_ref,parent_version_ref:null,
    custody_coordinate:{resource_ref:returned.resource_ref,
      version_ref:returned.version_ref,sha256:digest,byte_length:bytes.length}},
};
const selected={
  worker_ref:'worker:one',device_ref:'device:execution',source_generation:'source:one',
  account_principal_ref:'xiio:account-one',chosen_by:'person:operator'
};
const observedWorker={
  schema:'xiio.sdk.installed-worker/v1',state:'INSTALLED_READBACK_VERIFIED',
  worker_ref:selected.worker_ref,device_ref:selected.device_ref,
  owner_principal_ref:selected.account_principal_ref,
  source_generation:selected.source_generation,installed_generation:selected.source_generation,
  installation_ref:'installation:one',binding_ref:'worker:binding:one',
  installation_sha256:'a'.repeat(64)
};
function harness({brokerOverride,denyWard=false,requireApproval=false}={}){
  const calls={admit:0,broker:0,localRead:0,verifyDisk:0};
  const ports={
    readAccount:async()=>({
      provider:'xiio',subject_id:'account-one',login:'operator',
      observed_via:'provider_api_readback',observed_at:clock
    }),
    readInstalledWorker:async()=>observedWorker,
    observeWorker:async()=>({
      schema:'xiio.sdk.worker-liveness/v1',state:'READY',
      worker_ref:selected.worker_ref,device_ref:selected.device_ref,
      installed_generation:selected.source_generation,
      installation_sha256:observedWorker.installation_sha256,
      observation_ref:'observation:one',observed_at:clock,
      service_active:true,installed_process_observed:true
    }),
    readAttempt:async()=>({schema:'xiio.sdk.worker-attempt/v1',
      state:'NO_ATTEMPT',worker_ref:selected.worker_ref,work_ref:work.work_ref}),
    inspectInstalledFramework:async({request})=>({
      schema:'xiio.sdk.worker-disk-inspection/v1',
      state:'ON_DISK_BYTES_REOPENED',worker_ref:request.worker_ref,
      device_ref:request.device_ref,source_generation:request.source_generation,
      installed_generation:request.installed_generation,
      installation_sha256:request.installation_sha256,
      request_digest:request.request_digest,inspection_ref:'inspection:one',observed_at:clock
    }),
    withCurrentAuthority:async(_admission,callback)=>callback({
      verifyDiskInspection:async({request,inspection})=>{
        calls.verifyDisk++;
        return {schema:'xiio.ward.worker-disk-verification/v1',
          state:'CURRENT_NATIVE_BYTES_VERIFIED',inspection_ref:inspection.inspection_ref,
          request_digest:request.request_digest,worker_ref:request.worker_ref,
          device_ref:request.device_ref,installed_generation:request.installed_generation,
          installation_sha256:request.installation_sha256,
          verification_ref:'ward:disk-verification:one',verified_against_current_store:true};
      },
      admit:async request=>{
        calls.admit++;
        if(denyWard) throw new Error('WARD_ADMISSION_UNAVAILABLE');
        if(requireApproval)return {schema:'xiio.ward.worker-operation-admission/v1',
          state:'APPROVAL_REQUIRED',operation:request.operation,
          worker_ref:request.worker_ref,device_ref:request.device_ref,
          work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
          request_digest:request.request_digest,intent_digest:request.intent_digest,
          approval_ref:null,challenge_ref:'challenge:one',expires_at:'2026-10-28T14:40:00.000Z'};
        return {schema:'xiio.ward.worker-operation-admission/v1',state:'ADMITTED',
          operation:request.operation,request_digest:request.request_digest,
          worker_ref:request.worker_ref,device_ref:request.device_ref,
          work_ref:request.work_ref,owner_principal_ref:request.owner_principal_ref,
          approval_ref:request.approval_ref,admission_ref:'admission:one',
          lease_ref:'lease:one',expires_at:'2026-10-28T14:40:00.000Z'};
      },
      readRequesterReturnBytes:async({request})=>{
        calls.broker++;
        const normal={schema:'xiio.switchboard.device-return-bytes/v1',
          state:'BYTES_READBACK',returnRef:request.return_ref,
          jobRef:'job:one',deviceRef:request.device_ref,workRef:request.work_ref,
          occurrenceId:'work:occurrence:one',generation:request.work_generation,
          resourceRef:request.resource_ref,versionRef:request.version_ref,
          storageBindingRef:request.storage_binding_ref,readbackRef:'readback:one',
          sha256:digest,bytes:bytes.length,encoding:'base64',
          contentBase64:bytes.toString('base64'),
          returnCertified:false,applyReturn:false};
        return brokerOverride ? brokerOverride(normal) : normal;
      }
    })
  };
  return {worker:createSharedWorkerConnection({ports,clock:()=>clock}),calls};
}

test('joined SDK consumer calls existing worker once and independently matches broker bytes',async()=>{
  const {worker,calls}=harness();
  const binding=await worker.bind(selected);
  assert.equal(binding.state,'BINDING_OBSERVED');
  const prepared=prepareBinsVersionRead({event,work,returned});
  assert.equal(prepared.scope.storage_binding_ref,'bins:binding:one');
  assert.notEqual(event.destination_binding.binding_ref,prepared.scope.storage_binding_ref);
  const result=await readBinsVersionWithWorker({prepared,worker,binding});
  assert.equal(result.state,'RECEIVER_SCOPE_MATCHED_UNVERIFIED');
  assert.equal(result.resource_ref,returned.resource_ref);
  assert.equal(result.version_ref,returned.version_ref);
  assert.equal(result.authority_granted,false);
  assert.equal(result.apply_return_verified,false);
  assert.deepEqual(calls,{admit:1,broker:1,localRead:0,verifyDisk:1});
});

test('revoked Ward admission refuses before reading requester bytes',async()=>{
  const {worker,calls}=harness({denyWard:true});
  const binding=await worker.bind(selected);
  const result=await readBinsVersionWithWorker({
    prepared:prepareBinsVersionRead({event,work,returned}),worker,binding
  });
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.first_red,'WARD_ADMISSION_UNAVAILABLE');
  assert.equal(result.apply_return_verified,false);
  assert.equal(calls.broker,0);
  assert.equal(calls.admit,1);
});

test('foreign resource version broker response refuses without APPLY_RETURN',async()=>{
  const {worker,calls}=harness({brokerOverride:normal=>({
    ...normal,versionRef:'bins:version:foreign'
  })});
  const binding=await worker.bind(selected);
  const result=await readBinsVersionWithWorker({
    prepared:prepareBinsVersionRead({event,work,returned}),worker,binding
  });
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.first_red,'SWITCHBOARD_RETURN_SCOPE_UNVERIFIED');
  assert.equal(result.apply_return_verified,false);
  assert.equal(calls.broker,1);
});

test('wrong source matter refuses before worker admission',async()=>{
  const {worker,calls}=harness();
  assert.throws(()=>prepareBinsVersionRead({
    event:{...event,case_ref:'matter:other'},work,returned
  }),/MATTER_MISMATCH/);
  assert.equal(calls.admit,0);
  assert.equal(calls.broker,0);
});


test('existing Ward challenge survives BINS adapter without approval or byte dispatch',async()=>{
  const {worker,calls}=harness({requireApproval:true});
  const binding=await worker.bind(selected);
  const result=await readBinsVersionWithWorker({prepared:prepareBinsVersionRead({event,work,returned}),worker,binding});
  assert.equal(result.state,'OWNER_APPROVAL_REQUIRED');
  assert.equal(result.challenge_ref,'challenge:one');
  assert.equal(result.required_approval.approval_granted,false);
  assert.equal(result.required_approval.work_ref,work.work_ref);
  assert.equal(result.next_action,'REVIEW_EXISTING_WARD_CHALLENGE');
  assert.equal(result.authority_granted,false);
  assert.equal(result.apply_return_verified,false);
  assert.equal(calls.admit,1);assert.equal(calls.broker,0);
});

test('existing SDK refusal keeps its exact repair route through BINS adapter',async()=>{
  const {worker,calls}=harness({denyWard:true});
  const binding=await worker.bind(selected);
  const result=await readBinsVersionWithWorker({prepared:prepareBinsVersionRead({event,work,returned}),worker,binding});
  assert.equal(result.state,'BLOCKED');
  assert.equal(result.required_repair.owner_ref,'EXISTING_WARD_RUNTIME_OWNER');
  assert.equal(result.next_action,'REPAIR_AND_RESUME_ORIGINAL_WORK');
  assert.equal(result.blocked_operation.resource_ref,returned.resource_ref);
  assert.equal(calls.admit,1);assert.equal(calls.broker,0);
});
