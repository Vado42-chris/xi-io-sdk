import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstalledWorkerObservationPorts } from '../src/worker/installed-observation.mjs';

const NOW='2026-11-17T22:30:00.000Z';
const WORKER='worker:loki:inbox';
const DEVICE='device:loki';
const SERVICE='worker-service';
const GENERATION='generation:worker:1';

function activation(generation=GENERATION,overrides={}){
  return Object.freeze({
    schema:'xiio.sdk.installer-runtime-activation-client/v1',
    state:'VERIFIED',
    profile_id:'profile:inbox',
    profile_generation:'composition:g2',
    product_id:'product:inbox',
    activation_receipt_path:'/var/lib/xiio/activation.json',
    activation_receipt_sha256:'a'.repeat(64),
    services:Object.freeze([Object.freeze({
      service_id:SERVICE,
      unit:'xiio-worker.service',
      health_url:'http://127.0.0.1:9911/health',
      profile_generation:'composition:g2',
      declared_component_generation:generation,
      generation_readback:Object.freeze({
        schema:'xiio.installer-running-generation-readback/v1',
        state:'CURRENT',
        declared_generation:generation,
        running_generation:generation,
        generation_field:'generation',
        provider_effect:false,
        effect_authority:false,
      }),
      health_schema:'xiio.worker.health/v1',
      active:true,
    })]),
    custody_verified:true,
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
    ...overrides,
  });
}
function frameworkBinding(overrides={}){
  return Object.freeze({
    schema:'xiio.sdk.installer-dependency-binding-client/v1',
    state:'VERIFIED',
    dependency_id:'framework-runtime',
    owner_repo:'Vado42-chris/xi-io.net',
    accepted_generation:'b'.repeat(40),
    binding_receipt_path:'/var/lib/xiio/framework-binding.json',
    binding_sha256:'c'.repeat(64),
    fields:Object.freeze({
      product_api_host_ports_producer_module:'/var/lib/xiio/framework/product-api-host-ports.mjs',
    }),
    runtime_exports:Object.freeze({
      product_api_host_ports_producer_module:Object.freeze({
        destination_scope:'xdg_data',
        destination:'xi-io/framework/runtime/worker/product-api-host-ports.mjs',
        sha256:'d'.repeat(64),
        mode:'0644',
      }),
    }),
    custody_verified:true,
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
    ...overrides,
  });
}
function fixture({activationSequence=[activation()],binding=frameworkBinding(),owner='xiio:owner1'}={}){
  let activationReads=0,bindingReads=0,ownerReads=0;
  const observer=createInstalledWorkerObservationPorts({
    readRuntimeActivation:async()=>{
      const value=activationSequence[Math.min(activationReads,activationSequence.length-1)];
      activationReads+=1;
      return value;
    },
    readFrameworkBinding:async()=>{bindingReads+=1;return binding;},
    readOwnerPrincipal:async()=>{ownerReads+=1;return owner;},
    serviceId:SERVICE,
    workerRef:WORKER,
    deviceRef:DEVICE,
    clock:()=>NOW,
  });
  return {
    observer,
    reads:()=>({activation:activationReads,binding:bindingReads,owner:ownerReads}),
  };
}

test('verified Installer activation becomes exact installed worker, liveness and Framework inspection records',async()=>{
  const f=fixture();
  assert.equal(f.observer.state,'BOUND');
  assert.equal(f.observer.authority_granted,false);
  const installed=await f.observer.ports.readInstalledWorker({worker_ref:WORKER,device_ref:DEVICE});
  assert.equal(installed.schema,'xiio.sdk.installed-worker/v1');
  assert.equal(installed.state,'INSTALLED_READBACK_VERIFIED');
  assert.equal(installed.source_generation,GENERATION);
  assert.equal(installed.installed_generation,GENERATION);
  assert.equal(installed.owner_principal_ref,'xiio:owner1');
  assert.match(installed.installation_sha256,/^[a-f0-9]{64}$/);
  assert.equal(installed.authority_granted,false);
  assert.equal(installed.provider_effect,false);

  const live=await f.observer.ports.observeWorker({worker_ref:WORKER,device_ref:DEVICE});
  assert.equal(live.schema,'xiio.sdk.worker-liveness/v1');
  assert.equal(live.state,'READY');
  assert.equal(live.installed_generation,GENERATION);
  assert.equal(live.installation_sha256,installed.installation_sha256);
  assert.equal(live.service_active,true);
  assert.equal(live.installed_process_observed,true);
  assert.equal(live.observed_at,NOW);

  const inspection=await f.observer.ports.inspectInstalledFramework({
    request:Object.freeze({
      worker_ref:WORKER,
      device_ref:DEVICE,
      source_generation:GENERATION,
      installed_generation:GENERATION,
      installation_sha256:installed.installation_sha256,
      request_digest:'e'.repeat(64),
    }),
  });
  assert.equal(inspection.schema,'xiio.sdk.worker-disk-inspection/v1');
  assert.equal(inspection.state,'ON_DISK_BYTES_REOPENED');
  assert.equal(inspection.framework_dependency_id,'framework-runtime');
  assert.equal(inspection.framework_accepted_generation,'b'.repeat(40));
  assert.equal(inspection.framework_binding_sha256,'c'.repeat(64));
  assert.equal(inspection.installation_sha256,installed.installation_sha256);
  assert.equal(inspection.request_digest,'e'.repeat(64));
  assert.equal(inspection.authority_granted,false);
  assert.equal(inspection.provider_effect,false);
  assert.deepEqual(f.reads(),{activation:3,binding:1,owner:1});
});

test('target substitution refuses before reading any installed owner',async()=>{
  const f=fixture();
  await assert.rejects(
    f.observer.ports.readInstalledWorker({worker_ref:'worker:other',device_ref:DEVICE}),
    /INSTALLED_WORKER_REQUEST_WORKER_MISMATCH/,
  );
  await assert.rejects(
    f.observer.ports.observeWorker({worker_ref:WORKER,device_ref:'device:other'}),
    /WORKER_LIVENESS_REQUEST_DEVICE_MISMATCH/,
  );
  assert.deepEqual(f.reads(),{activation:0,binding:0,owner:0});
});

test('runtime generation drift refuses Framework inspection before dependency read',async()=>{
  const f=fixture({activationSequence:[activation(),activation('generation:worker:2')]});
  const installed=await f.observer.ports.readInstalledWorker({worker_ref:WORKER,device_ref:DEVICE});
  await assert.rejects(
    f.observer.ports.inspectInstalledFramework({
      request:{
        worker_ref:WORKER,device_ref:DEVICE,
        source_generation:GENERATION,installed_generation:GENERATION,
        installation_sha256:installed.installation_sha256,
        request_digest:'e'.repeat(64),
      },
    }),
    /INSTALLED_FRAMEWORK_SOURCE_GENERATION_DRIFT/,
  );
  assert.deepEqual(f.reads(),{activation:2,binding:0,owner:1});
});

test('effectful or unverified Installer activation refuses before owner binding',async()=>{
  for(const row of [
    activation(GENERATION,{effect_authority:true}),
    activation(GENERATION,{custody_verified:false}),
  ]){
    const f=fixture({activationSequence:[row]});
    await assert.rejects(
      f.observer.ports.readInstalledWorker({worker_ref:WORKER,device_ref:DEVICE}),
      /INSTALLED_WORKER_ACTIVATION_UNVERIFIED/,
    );
    assert.equal(f.reads().owner,0);
  }
});

test('wrong Framework owner or missing binding digest cannot become disk inspection',async()=>{
  for(const binding of [
    frameworkBinding({owner_repo:'owner/other'}),
    frameworkBinding({binding_sha256:'not-a-digest'}),
  ]){
    const f=fixture({binding});
    const installed=await f.observer.ports.readInstalledWorker({worker_ref:WORKER,device_ref:DEVICE});
    await assert.rejects(
      f.observer.ports.inspectInstalledFramework({
        request:{
          worker_ref:WORKER,device_ref:DEVICE,
          source_generation:GENERATION,installed_generation:GENERATION,
          installation_sha256:installed.installation_sha256,
          request_digest:'e'.repeat(64),
        },
      }),
      /INSTALLED_FRAMEWORK_(?:BINDING_UNVERIFIED|BINDING_DIGEST_INVALID)/,
    );
  }
});

test('factory refuses missing owners and never mints authority',()=>{
  assert.throws(()=>createInstalledWorkerObservationPorts(),/INSTALLED_WORKER_ACTIVATION_READER_UNBOUND/);
  const f=fixture();
  assert.deepEqual({
    authority_granted:f.observer.authority_granted,
    provider_effect:f.observer.provider_effect,
    effect_authority:f.observer.effect_authority,
  },{
    authority_granted:false,
    provider_effect:false,
    effect_authority:false,
  });
  assert.ok(f.observer.hard.includes('DISK_INSPECTION_OBSERVED!=WARD_DISK_VERIFIED'));
});
