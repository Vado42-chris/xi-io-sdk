import { createHash } from 'node:crypto';

export const INSTALLED_WORKER_OBSERVATION_PORTS_SCHEMA =
  'xiio.sdk.installed-worker-observation-ports/v1';

const REF=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
const SHA=/^[a-f0-9]{64}$/;
const UNIT=/^[A-Za-z0-9_.@-]+\.service$/;

function fail(code){
  const error=new TypeError(code);
  error.code=code;
  throw error;
}
function ref(value,code){
  if(typeof value!=='string'||!REF.test(value))fail(code);
  return value;
}
function sha(value,code){
  if(typeof value!=='string'||!SHA.test(value))fail(code);
  return value;
}
function timestamp(value,code){
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail(code);
  return value;
}
function object(value,code){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=='string'||!Object.hasOwn(descriptors[key],'value'))fail(code);
  }
  return value;
}
function digest(value){
  const stable=(input)=>Array.isArray(input)
    ?input.map(stable)
    :input&&typeof input==='object'
      ?Object.fromEntries(Object.keys(input).sort().map((key)=>[key,stable(input[key])]))
      :input;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function verifiedActivation(value){
  const row=object(value,'INSTALLED_WORKER_ACTIVATION_INVALID');
  if(row.schema!=='xiio.sdk.installer-runtime-activation-client/v1'||
     row.state!=='VERIFIED'||row.custody_verified!==true||
     row.authority_granted!==false||row.provider_effect!==false||
     row.effect_authority!==false||!Array.isArray(row.services)){
    fail('INSTALLED_WORKER_ACTIVATION_UNVERIFIED');
  }
  sha(row.activation_receipt_sha256,'INSTALLED_WORKER_ACTIVATION_DIGEST_INVALID');
  ref(row.profile_id,'INSTALLED_WORKER_PROFILE_REF_INVALID');
  ref(row.product_id,'INSTALLED_WORKER_PRODUCT_REF_INVALID');
  ref(row.profile_generation,'INSTALLED_WORKER_PROFILE_GENERATION_INVALID');
  return row;
}
function selectedService(activation,serviceId){
  const matches=activation.services.filter((candidate)=>candidate?.service_id===serviceId);
  if(matches.length!==1)fail(matches.length?'INSTALLED_WORKER_SERVICE_AMBIGUOUS':'INSTALLED_WORKER_SERVICE_UNBOUND');
  const service=object(matches[0],'INSTALLED_WORKER_SERVICE_INVALID');
  if(service.active!==true||service.profile_generation!==activation.profile_generation||
     typeof service.unit!=='string'||!UNIT.test(service.unit)||
     service.generation_readback?.schema!=='xiio.installer-running-generation-readback/v1'||
     service.generation_readback?.state!=='CURRENT'||
     service.generation_readback?.provider_effect!==false||
     service.generation_readback?.effect_authority!==false||
     service.generation_readback?.declared_generation!==service.declared_component_generation||
     service.generation_readback?.running_generation!==service.declared_component_generation){
    fail('INSTALLED_WORKER_SERVICE_NOT_CURRENT');
  }
  ref(service.declared_component_generation,'INSTALLED_WORKER_SOURCE_GENERATION_INVALID');
  return service;
}
function verifiedFrameworkBinding(value){
  const row=object(value,'INSTALLED_FRAMEWORK_BINDING_INVALID');
  if(row.schema!=='xiio.sdk.installer-dependency-binding-client/v1'||
     row.state!=='VERIFIED'||row.custody_verified!==true||
     row.dependency_id!=='framework-runtime'||
     row.owner_repo!=='Vado42-chris/xi-io.net'||
     row.authority_granted!==false||row.provider_effect!==false||
     row.effect_authority!==false){
    fail('INSTALLED_FRAMEWORK_BINDING_UNVERIFIED');
  }
  ref(row.accepted_generation,'INSTALLED_FRAMEWORK_GENERATION_INVALID');
  sha(row.binding_sha256,'INSTALLED_FRAMEWORK_BINDING_DIGEST_INVALID');
  object(row.fields,'INSTALLED_FRAMEWORK_FIELDS_INVALID');
  object(row.runtime_exports,'INSTALLED_FRAMEWORK_EXPORTS_INVALID');
  if(!Object.keys(row.fields).length||
     Object.keys(row.fields).sort().join('\0')!==Object.keys(row.runtime_exports).sort().join('\0')){
    fail('INSTALLED_FRAMEWORK_EXPORTS_UNVERIFIED');
  }
  return row;
}
function currentInstallation({activation,service,workerRef,deviceRef}){
  const basis=Object.freeze({
    worker_ref:workerRef,
    device_ref:deviceRef,
    profile_id:activation.profile_id,
    profile_generation:activation.profile_generation,
    product_id:activation.product_id,
    service_id:service.service_id,
    unit:service.unit,
    source_generation:service.declared_component_generation,
    activation_receipt_sha256:activation.activation_receipt_sha256,
  });
  const installation_sha256=digest(basis);
  return Object.freeze({
    basis,
    installation_ref:'installation:'+installation_sha256.slice(0,32),
    installation_sha256,
    binding_ref:'binding:'+digest({
      worker_ref:workerRef,
      device_ref:deviceRef,
      installation_sha256,
      service_id:service.service_id,
    }).slice(0,32),
  });
}
function exactTarget(value,expected,code){
  if(value!==expected)fail(code);
  return value;
}
function requestRecord(value){
  const request=object(value,'INSTALLED_FRAMEWORK_REQUEST_INVALID');
  for(const name of [
    'worker_ref','device_ref','source_generation','installed_generation',
    'installation_sha256','request_digest',
  ]){
    if(typeof request[name]!=='string')fail('INSTALLED_FRAMEWORK_REQUEST_INCOMPLETE');
  }
  ref(request.worker_ref,'INSTALLED_FRAMEWORK_WORKER_REF_INVALID');
  ref(request.device_ref,'INSTALLED_FRAMEWORK_DEVICE_REF_INVALID');
  ref(request.source_generation,'INSTALLED_FRAMEWORK_SOURCE_GENERATION_INVALID');
  ref(request.installed_generation,'INSTALLED_FRAMEWORK_GENERATION_INVALID');
  sha(request.installation_sha256,'INSTALLED_FRAMEWORK_INSTALLATION_DIGEST_INVALID');
  sha(request.request_digest,'INSTALLED_FRAMEWORK_REQUEST_DIGEST_INVALID');
  return request;
}

export function createInstalledWorkerObservationPorts({
  readRuntimeActivation,
  readFrameworkBinding,
  readOwnerPrincipal,
  serviceId,
  workerRef,
  deviceRef,
  clock=()=>new Date().toISOString(),
}={}){
  for(const [value,code] of [
    [readRuntimeActivation,'INSTALLED_WORKER_ACTIVATION_READER_UNBOUND'],
    [readFrameworkBinding,'INSTALLED_FRAMEWORK_BINDING_READER_UNBOUND'],
    [readOwnerPrincipal,'INSTALLED_WORKER_OWNER_READER_UNBOUND'],
  ]){
    if(typeof value!=='function')fail(code);
  }
  if(typeof clock!=='function')fail('INSTALLED_WORKER_CLOCK_INVALID');
  const service_id=ref(serviceId,'INSTALLED_WORKER_SERVICE_REF_INVALID');
  const worker_ref=ref(workerRef,'INSTALLED_WORKER_REF_INVALID');
  const device_ref=ref(deviceRef,'INSTALLED_WORKER_DEVICE_REF_INVALID');

  async function activation(){
    return verifiedActivation(await readRuntimeActivation(Object.freeze({
      worker_ref,
      device_ref,
      service_id,
    })));
  }
  async function installation(){
    const current=await activation();
    const service=selectedService(current,service_id);
    return Object.freeze({
      activation:current,
      service,
      installation:currentInstallation({
        activation:current,
        service,
        workerRef:worker_ref,
        deviceRef:device_ref,
      }),
    });
  }

  const ports=Object.freeze({
    async readInstalledWorker({worker_ref:requestedWorker,device_ref:requestedDevice}={}){
      exactTarget(requestedWorker,worker_ref,'INSTALLED_WORKER_REQUEST_WORKER_MISMATCH');
      exactTarget(requestedDevice,device_ref,'INSTALLED_WORKER_REQUEST_DEVICE_MISMATCH');
      const current=await installation();
      const owner=ref(
        await readOwnerPrincipal(Object.freeze({
          worker_ref,
          device_ref,
          service_id,
          source_generation:current.service.declared_component_generation,
        })),
        'INSTALLED_WORKER_OWNER_PRINCIPAL_INVALID',
      );
      return Object.freeze({
        schema:'xiio.sdk.installed-worker/v1',
        state:'INSTALLED_READBACK_VERIFIED',
        worker_ref,
        device_ref,
        source_generation:current.service.declared_component_generation,
        installed_generation:current.service.declared_component_generation,
        owner_principal_ref:owner,
        installation_ref:current.installation.installation_ref,
        installation_sha256:current.installation.installation_sha256,
        binding_ref:current.installation.binding_ref,
        activation_receipt_sha256:current.activation.activation_receipt_sha256,
        activation_profile_ref:current.activation.profile_id,
        activation_service_ref:service_id,
        authority_granted:false,
        provider_effect:false,
      });
    },

    async observeWorker({worker_ref:requestedWorker,device_ref:requestedDevice}={}){
      exactTarget(requestedWorker,worker_ref,'WORKER_LIVENESS_REQUEST_WORKER_MISMATCH');
      exactTarget(requestedDevice,device_ref,'WORKER_LIVENESS_REQUEST_DEVICE_MISMATCH');
      const current=await installation();
      const observed_at=timestamp(clock(),'WORKER_LIVENESS_CLOCK_INVALID');
      return Object.freeze({
        schema:'xiio.sdk.worker-liveness/v1',
        state:'READY',
        worker_ref,
        device_ref,
        installed_generation:current.service.declared_component_generation,
        installation_sha256:current.installation.installation_sha256,
        observation_ref:'observation:'+digest({
          worker_ref,
          device_ref,
          service_id,
          installation_sha256:current.installation.installation_sha256,
          observed_at,
        }).slice(0,32),
        service_active:true,
        installed_process_observed:true,
        observed_at,
        authority_granted:false,
        provider_effect:false,
      });
    },

    async inspectInstalledFramework({request}={}){
      const pinned=requestRecord(request);
      exactTarget(pinned.worker_ref,worker_ref,'INSTALLED_FRAMEWORK_WORKER_MISMATCH');
      exactTarget(pinned.device_ref,device_ref,'INSTALLED_FRAMEWORK_DEVICE_MISMATCH');
      const current=await installation();
      exactTarget(
        pinned.source_generation,
        current.service.declared_component_generation,
        'INSTALLED_FRAMEWORK_SOURCE_GENERATION_DRIFT',
      );
      exactTarget(
        pinned.installed_generation,
        current.service.declared_component_generation,
        'INSTALLED_FRAMEWORK_GENERATION_DRIFT',
      );
      exactTarget(
        pinned.installation_sha256,
        current.installation.installation_sha256,
        'INSTALLED_FRAMEWORK_INSTALLATION_DRIFT',
      );
      const framework=verifiedFrameworkBinding(await readFrameworkBinding(Object.freeze({
        worker_ref,
        device_ref,
        service_id,
        request_digest:pinned.request_digest,
      })));
      const observed_at=timestamp(clock(),'INSTALLED_FRAMEWORK_CLOCK_INVALID');
      return Object.freeze({
        schema:'xiio.sdk.worker-disk-inspection/v1',
        state:'ON_DISK_BYTES_REOPENED',
        inspection_ref:'inspection:'+digest({
          request_digest:pinned.request_digest,
          installation_sha256:pinned.installation_sha256,
          framework_binding_sha256:framework.binding_sha256,
          observed_at,
        }).slice(0,32),
        worker_ref,
        device_ref,
        source_generation:pinned.source_generation,
        installed_generation:pinned.installed_generation,
        installation_sha256:pinned.installation_sha256,
        request_digest:pinned.request_digest,
        observed_at,
        framework_dependency_id:framework.dependency_id,
        framework_accepted_generation:framework.accepted_generation,
        framework_binding_sha256:framework.binding_sha256,
        authority_granted:false,
        provider_effect:false,
      });
    },
  });

  return Object.freeze({
    schema:INSTALLED_WORKER_OBSERVATION_PORTS_SCHEMA,
    state:'BOUND',
    worker_ref,
    device_ref,
    service_id,
    ports,
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
    hard:Object.freeze([
      'INSTALLER_ACTIVATION_VERIFIED!=WARD_AUTHORITY',
      'FRAMEWORK_BINDING_VERIFIED!=WORKER_EFFECT_AUTHORITY',
      'INSTALLED_WORKER_OBSERVED!=EXECUTION_ROUTE_QUALIFIED',
      'WORKER_LIVENESS_OBSERVED!=EFFECT_AUTHORIZED',
      'DISK_INSPECTION_OBSERVED!=WARD_DISK_VERIFIED',
    ]),
  });
}
