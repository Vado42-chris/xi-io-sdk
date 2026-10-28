/**
 * XI-IO SDK shared worker connection kernel (no server, credentials or effects).
 * Provider adapters supply IO; Ward alone supplies atomic authority; BINS
 * supplies independently reopened bytes. All consumers reuse this contract.
 * No API, installed process or model can self-assert host authority.
 */
import {createHash} from 'node:crypto';
import {observeAccount,chooseAccount,bindOwner} from '../identity/account-binding.mjs';

export const WORKER_CONNECTION_SCHEMA='xiio.sdk.worker-connection/v1';
export const WORKER_CANARY_TEXT='XIIO_SDK_WORKER_CANARY_V1\n';
export const WORKER_CANARY_BYTES=Buffer.from(WORKER_CANARY_TEXT,'utf8');
export const WORKER_CANARY_SHA256=createHash('sha256').update(WORKER_CANARY_BYTES).digest('hex');
export const MAX_WORKER_CANARY_BYTES=16*1024;
const SHA=/^[a-f0-9]{64}$/;
const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const PORTS=['readAccount','readInstalledWorker','observeWorker','readAttempt','withCurrentAuthority'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const digest=x=>sha(JSON.stringify(sorted(x)));
const ref=(x,k)=>{if(typeof x!=='string'||!REF.test(x))throw Error(k+'_INVALID');return x;};
const assert=(ok,k)=>{if(!ok)throw Error(k);};
const nowMs=s=>{const t=Date.parse(s);assert(typeof s==='string'&&Number.isFinite(t),'CLOCK_INVALID');return t;};
const denied=(code,extra={})=>Object.freeze({schema:WORKER_CONNECTION_SCHEMA,state:'BLOCKED',first_red:code,
  authority_granted:false,provider_effect:false,apply_return_verified:false,...extra});
const allowedCode=e=>typeof e?.message==='string'&&/^[A-Z][A-Z0-9_]{4,90}$/.test(e.message)?e.message:'WORKER_CONNECTION_UNAVAILABLE';
const attempt=async work=>{try{return await work();}catch(error){return denied(allowedCode(error));}};

function bindingKey(x){
  assert(x?.schema===WORKER_CONNECTION_SCHEMA&&x.state==='BINDING_OBSERVED', 'WORKER_BINDING_REQUIRED');
  const fields=['worker_ref','device_ref','source_generation','installed_generation','owner_principal_ref','account_principal_ref','installation_ref','installation_sha256','binding_ref'];
  for(const k of fields)ref(x[k],k.toUpperCase());
  assert(SHA.test(x.installation_sha256),'INSTALLATION_DIGEST_INVALID');
  assert(x.installed_generation===x.source_generation&&x.owner_principal_ref===x.account_principal_ref,
    'WORKER_BINDING_DRIFT');
  const signature=Object.fromEntries(fields.map(k=>[k,x[k]]));
  assert(x.binding_digest===digest(signature),'WORKER_BINDING_DIGEST_CHANGED');
  return signature;
}
function currentLiveness(x,binding,clock){
  if(!x||x.schema!=='xiio.sdk.worker-liveness/v1'||x.state!=='READY'||
     x.worker_ref!==binding.worker_ref||x.device_ref!==binding.device_ref||
     x.installed_generation!==binding.installed_generation||
     x.installation_sha256!==binding.installation_sha256||
     typeof x.observation_ref!=='string'||!REF.test(x.observation_ref)||
     x.service_active!==true||x.installed_process_observed!==true)
    throw Error('WORKER_LIVENESS_NOT_QUALIFIED');
  const age=nowMs(clock())-nowMs(x.observed_at);
  assert(age>=0&&age<=30_000,'WORKER_LIVENESS_STALE');
  return {schema:WORKER_CONNECTION_SCHEMA,state:'LIVENESS_OBSERVED',
    worker_ref:binding.worker_ref,device_ref:binding.device_ref,
    installed_generation:binding.installed_generation,observation_ref:x.observation_ref,
    authority_granted:false,provider_effect:false};
}
function makeRequest(binding,operation,{work_ref,approval_ref}){
  const base={operation,work_ref:ref(work_ref,'WORK_REF'),approval_ref:ref(approval_ref,'APPROVAL_REF'),
    worker_ref:binding.worker_ref,device_ref:binding.device_ref,owner_principal_ref:binding.owner_principal_ref,
    source_generation:binding.source_generation,installed_generation:binding.installed_generation,
    binding_digest:binding.binding_digest};
  return Object.freeze({...base,request_digest:digest(base)});
}
function admit(proof,request,clock){
  assert(proof?.schema==='xiio.ward.worker-operation-admission/v1'&&proof.state==='ADMITTED'&&
    proof.operation===request.operation&&proof.request_digest===request.request_digest&&
    proof.worker_ref===request.worker_ref&&proof.device_ref===request.device_ref&&
    proof.work_ref===request.work_ref&&proof.owner_principal_ref===request.owner_principal_ref&&
    proof.approval_ref===request.approval_ref,
    'WARD_ADMISSION_REQUEST_MISMATCH');
  ref(proof.admission_ref,'ADMISSION_REF');ref(proof.lease_ref,'LEASE_REF');
  assert(nowMs(proof.expires_at)>nowMs(clock()),'WARD_ADMISSION_EXPIRED');
  return proof;
}
function preservedBytes(custody,record){
  assert(custody?.schema==='xiio.bins.verified-preserved-version/v1'&&
    custody.resource_ref===record.resource_ref&&custody.version_ref===record.version_ref,
    'BINS_PRESERVED_REF_MISMATCH');
  const bytes=custody.bytes;
  assert(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array,'BINS_PRESERVED_BYTES_NOT_REOPENED');
  assert(bytes.byteLength<=MAX_WORKER_CANARY_BYTES&&bytes.byteLength===WORKER_CANARY_BYTES.length,
    'BINS_PRESERVED_SIZE_MISMATCH');
  assert(Buffer.from(bytes).equals(WORKER_CANARY_BYTES)&&sha(bytes)===WORKER_CANARY_SHA256&&
    custody.sha256===WORKER_CANARY_SHA256&&record.sha256===WORKER_CANARY_SHA256,
    'BINS_PRESERVED_DIGEST_MISMATCH');
  return Object.freeze({schema:WORKER_CONNECTION_SCHEMA,state:'CANARY_RETURN_VERIFIED',
    worker_ref:record.worker_ref,work_ref:record.work_ref,request_digest:record.request_digest,
    result_ref:record.result_ref,return_ref:record.return_ref,
    resource_ref:record.resource_ref,version_ref:record.version_ref,
    data_base64:Buffer.from(bytes).toString('base64'),bytes:bytes.byteLength,
    sha256:WORKER_CANARY_SHA256,authority_granted:false,
    provider_effect:false,apply_return_verified:false});
}
function returnRecord(record,request){
  assert(record?.schema==='xiio.switchboard.worker-canary-result/v1'&&
    record.state==='RESULT_PRESERVED'&&record.worker_ref===request.worker_ref&&
    record.work_ref===request.work_ref&&record.request_digest===request.request_digest,
    'WORKER_RESULT_IDENTITY_MISMATCH');
  for(const k of ['result_ref','return_ref','resource_ref','version_ref'])ref(record[k],k.toUpperCase());
  assert(SHA.test(record.sha256),'WORKER_RESULT_SHA_INVALID');
  return record;
}

/** External credential and account selection is observed, not authorization. */
export function createSharedWorkerConnection({ports,clock=()=>new Date().toISOString()}={}){
  assert(ports&&PORTS.every(k=>typeof ports[k]==='function'),'SDK_WORKER_PORTS_UNBOUND');
  async function bind({worker_ref,device_ref,source_generation,account_principal_ref,chosen_by}={}){
    return attempt(async()=>{
      for(const [k,v] of Object.entries({worker_ref,device_ref,source_generation,account_principal_ref}))ref(v,k.toUpperCase());
      ref(chosen_by,'CHOICE_ACTOR');
      const identity=await ports.readAccount({principal_ref:account_principal_ref});
      const observed=observeAccount(identity);
      const choice=chooseAccount([observed],account_principal_ref,{chosen_by});
      const worker=await ports.readInstalledWorker({worker_ref,device_ref});
      assert(worker?.schema==='xiio.sdk.installed-worker/v1'&&
        worker.state==='INSTALLED_READBACK_VERIFIED'&&
        worker.worker_ref===worker_ref&&worker.device_ref===device_ref&&
        worker.source_generation===source_generation&&
        worker.installed_generation===source_generation&&
        worker.owner_principal_ref===choice.account.principal_ref,
        'WORKER_INSTALLED_IDENTITY_MISMATCH');
      ref(worker.installation_ref,'INSTALLATION_REF');ref(worker.binding_ref,'BINDING_REF');
      assert(SHA.test(worker.installation_sha256),'WORKER_INSTALL_SHA_MISSING');
      const account=bindOwner({worker_ref,device_ref,source_generation,
        installed_generation:worker.installed_generation,installation_ref:worker.installation_ref,
        installation_sha256:worker.installation_sha256,binding_ref:worker.binding_ref},choice);
      const basis={worker_ref,device_ref,source_generation,installed_generation:worker.installed_generation,
        owner_principal_ref:account.owner_principal_ref,account_principal_ref:observed.principal_ref,
        installation_ref:worker.installation_ref,installation_sha256:worker.installation_sha256,
        binding_ref:worker.binding_ref};
      return Object.freeze({...basis,schema:WORKER_CONNECTION_SCHEMA,state:'BINDING_OBSERVED',
        binding_digest:digest(basis),authority_granted:false,provider_effect:false});
    });
  }
  async function rebind(binding){
    const expected=bindingKey(binding);
    const check=await bind({...expected,chosen_by:'person:owner'});
    assert(check.state==='BINDING_OBSERVED'&&check.binding_digest===binding.binding_digest,
      'WORKER_BINDING_NOT_CURRENT');
  }
  const observeLiveness=async binding=>attempt(async()=>{
    await rebind(binding);
    const observation=await ports.observeWorker({worker_ref:binding.worker_ref,device_ref:binding.device_ref});
    return currentLiveness(observation,binding,clock);
  });
  async function protectedOperation(binding,operation,scope,perform){
    return attempt(async()=>{
      await rebind(binding);
      const request=makeRequest(binding,operation,scope);
      let callbackCalled=false;
      const value=await ports.withCurrentAuthority({request,now:clock()},async trusted=>{
        callbackCalled=true;
        assert(trusted&&typeof trusted.admit==='function','WARD_TRANSACTION_PORTS_UNBOUND');
        const proof=admit(await trusted.admit(request),request,clock);
        return perform({trusted,proof,request});
      });
      assert(callbackCalled&&value && value.schema===WORKER_CONNECTION_SCHEMA && value.authority_granted===false,
        'WORKER_RETURN_UNQUALIFIED');
      return value;
    });
  }
  const start=async (binding,scope)=>attempt(async()=>{
    await rebind(binding);
    const prior=await ports.readAttempt({worker_ref:binding.worker_ref,
      work_ref:scope?.work_ref,operation:'worker.start'});
    assert(prior?.schema==='xiio.sdk.worker-attempt/v1'&&
      prior.worker_ref===binding.worker_ref&&prior.work_ref===scope?.work_ref,
      'WORKER_START_ATTEMPT_UNVERIFIED');
    if(prior.state==='UNKNOWN'||prior.state==='IN_FLIGHT')
      return denied('WORKER_START_UNCERTAIN_DO_NOT_RETRY');
    if(prior.state==='STARTED_VERIFIED'){
      const seen=currentLiveness(await ports.observeWorker({worker_ref:binding.worker_ref}),binding,clock);
      return Object.freeze({...seen,state:'ALREADY_STARTED_OBSERVED',work_ref:scope.work_ref});
    }
    assert(prior.state==='NO_ATTEMPT','WORKER_START_REQUIRES_RECOVERY');
    return protectedOperation(binding,'worker.start',scope,async({trusted,proof,request})=>{
      assert(typeof trusted.startWorker==='function'&&typeof trusted.observeWorker==='function','WARD_START_PORTS_UNBOUND');
      const started=await trusted.startWorker({request,admission_ref:proof.admission_ref});
      assert(started?.state==='STARTED'&&started.worker_ref===request.worker_ref&&
        started.request_digest===request.request_digest,'WORKER_START_ACK_UNQUALIFIED');
      ref(started.run_ref,'RUN_REF');
      const observed=currentLiveness(await trusted.observeWorker(request),binding,clock);
      return Object.freeze({...observed,state:'STARTED_OBSERVED',work_ref:request.work_ref,
        run_ref:started.run_ref,request_digest:request.request_digest});
    });
  });
  const canary=async(binding,scope)=>protectedOperation(binding,'worker.canary',scope,async({trusted,proof,request})=>{
    assert(typeof trusted.executeCanary==='function'&&typeof trusted.readPreservedVersion==='function',
      'WARD_CANARY_PORTS_UNBOUND');
    const seen=currentLiveness(await ports.observeWorker({worker_ref:binding.worker_ref,device_ref:binding.device_ref}),binding,clock);
    assert(seen.state==='LIVENESS_OBSERVED','WORKER_CANARY_REQUIRES_LIVENESS');
    const record=returnRecord(await trusted.executeCanary({request,admission_ref:proof.admission_ref,
      canary_text:WORKER_CANARY_TEXT,canary_sha256:WORKER_CANARY_SHA256}),request);
    const custody=await trusted.readPreservedVersion({resource_ref:record.resource_ref,
      version_ref:record.version_ref,max_bytes:MAX_WORKER_CANARY_BYTES,
      requester_principal_ref:request.owner_principal_ref,admission_ref:proof.admission_ref});
    return preservedBytes(custody,record);
  });
  const recover=async (binding,scope)=>attempt(async()=>{
    await rebind(binding);
    const prior=await ports.readAttempt({worker_ref:binding.worker_ref,work_ref:scope?.work_ref});
    if(!prior||prior.schema!=='xiio.sdk.worker-attempt/v1'||prior.worker_ref!==binding.worker_ref||
      prior.work_ref!==scope?.work_ref)return denied('WORKER_RECOVERY_ATTEMPT_UNVERIFIED');
    if(prior.state==='UNKNOWN'||prior.state==='IN_FLIGHT')return denied('WORKER_RECOVERY_UNCERTAIN_DO_NOT_RETRY');
    // Lost ACK or interrupted RETURN is reconciled from preserved BINS bytes.
    // It must NEVER dispatch the canary again or fabricate APPLY_RETURN.
    if(prior.state==='RESULT_PRESERVED'){
      return protectedOperation(binding,'worker.return-read',scope,async({trusted,proof,request})=>{
        assert(typeof trusted.readPreservedVersion==='function','WARD_RETURN_READ_PORT_UNBOUND');
        const originalDigest=prior.original_request_digest;
        assert(typeof originalDigest==='string'&&SHA.test(originalDigest),
          'RECOVERY_ORIGINAL_REQUEST_UNBOUND');
        const original={...request,request_digest:originalDigest};
        const record=returnRecord(prior.result,original);
        const saved=await trusted.readPreservedVersion({resource_ref:record.resource_ref,
          version_ref:record.version_ref,max_bytes:MAX_WORKER_CANARY_BYTES,
          requester_principal_ref:request.owner_principal_ref,admission_ref:proof.admission_ref});
        const receipt=preservedBytes(saved,record);
        return Object.freeze({...receipt,state:'CANARY_RETURN_RECONCILED',
          recovery_read_request_digest:request.request_digest});
      });
    }
    if(prior.state!=='STOPPED_VERIFIED'||typeof prior.evidence_ref!=='string'||!REF.test(prior.evidence_ref))
      return denied('WORKER_RECOVERY_NOT_ELIGIBLE');
    return protectedOperation(binding,'worker.recover',scope,async({trusted,proof,request})=>{
      assert(typeof trusted.recoverWorker==='function'&&typeof trusted.observeWorker==='function',
        'WARD_RECOVERY_PORTS_UNBOUND');
      const output=await trusted.recoverWorker({request,prior_evidence_ref:prior.evidence_ref,
        admission_ref:proof.admission_ref});
      assert(output?.state==='RECOVERED'&&output.worker_ref===binding.worker_ref&&
        output.request_digest===request.request_digest,'WORKER_RECOVERY_ACK_UNQUALIFIED');
      const observation=currentLiveness(await trusted.observeWorker(request),binding,clock);
      return Object.freeze({...observation,state:'RECOVERED_OBSERVED',
        recovery_ref:ref(output.recovery_ref,'RECOVERY_REF'),work_ref:request.work_ref,
        request_digest:request.request_digest});
    });
  });
  return Object.freeze({bind,observeLiveness,start,canary,recover});
}

/** Shared preview-only SDK HTTP consumer for Zed and other plugins. */
export function inspectLocalAgentStatus(raw){
  if(raw?.schema!=='xiio.cli.local-agent-http/v1'||raw.state!=='READY'||
    raw.installed_sdk_generation_verified!==true||raw.ollama_model_ready!==true||
    raw.runtime_verified===false)return denied('SDK_LOCAL_AGENT_NOT_QUALIFIED');
  if(raw.execution!=='PREVIEW'&&raw.execution!=='BOUNDED')return denied('SDK_EXECUTION_STATE_INVALID');
  return Object.freeze({schema:WORKER_CONNECTION_SCHEMA,state:'STATUS_OBSERVED',
    runtime:{state:raw.state,execution:raw.execution,model:raw.model??null,
      installed_sdk_generation_claimed:true,ollama_model_ready_observed:true},
    authority_granted:false,provider_effect:false,installed_generation_independently_verified:false});
}
export function validateLocalAgentTurnReply(status,raw){
  if(status?.state!=='STATUS_OBSERVED'||status.runtime?.execution!=='PREVIEW')
    return denied('SDK_EFFECT_CEILING_NOT_PREVIEW');
  if(raw?.schema!=='xiio.cli.local-agent-http/v1'||raw.state!=='ANSWERED'||
    typeof raw.reply!=='string'||Buffer.byteLength(raw.reply)>65536)
    return denied('SDK_TURN_UNVERIFIED');
  return Object.freeze({schema:WORKER_CONNECTION_SCHEMA,state:'MODEL_REPLIED',reply:raw.reply,
    model:status.runtime.model,execution:'PREVIEW',authority_granted:false,
    provider_effect:false,level9:false});
}

/** Input gate shared by preview-only local-model plugin consumers. */
export function normalizeLocalAgentMessage(message){
  if(typeof message!=='string'||!message.trim()||Buffer.byteLength(message)>16_384)
    return denied('MESSAGE_INVALID_OR_OVERSIZE');
  return Object.freeze({schema:WORKER_CONNECTION_SCHEMA,state:'PREVIEW_MESSAGE_VALID',
    message:message.trim(),authority_granted:false,provider_effect:false});
}
